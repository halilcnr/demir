/**
 * Price Maintenance Worker (V2 — batched, semantics-preserving)
 *
 * Runs daily to:
 * 1. Merge consecutive duplicate snapshots (same listing + same price in a row)
 * 2. Generate PriceDailyStats aggregations for data older than 30 days
 * 3. Prune non-significant raw snapshots that have been aggregated (>30 days old)
 *
 * NEVER deletes significant records (price drops ≥2%, changes ≥5%, >500 TL swings).
 * V2 change: the per-listing N+1 was collapsed to bulk reads / writes. The
 * merge logic runs byte-for-byte identically to the V1 implementation, just
 * over in-memory batches instead of one Prisma round-trip per listing.
 */

import { prisma } from '@repo/shared';

// ─── Public API ──────────────────────────────────────────────────

export async function runPriceMaintenance(): Promise<MaintenanceReport> {
  console.log('[price-maintenance] Starting daily maintenance...');
  const start = Date.now();

  const merged = await mergeDuplicateSnapshots();
  const aggregated = await generateDailyAggregations();
  const pruned = await pruneAggregatedSnapshots();

  const report: MaintenanceReport = {
    mergedDuplicates: merged,
    daysAggregated: aggregated,
    prunedSnapshots: pruned,
    durationMs: Date.now() - start,
  };

  console.log(`[price-maintenance] Done in ${report.durationMs}ms — merged: ${merged}, aggregated: ${aggregated} days, pruned: ${pruned}`);
  return report;
}

export async function getPriceStorageStats() {
  const [totalSnapshots, significantCount, dailyStatsCount, oldNonSignificant] = await Promise.all([
    prisma.priceSnapshot.count(),
    prisma.priceSnapshot.count({ where: { isSignificant: true } }),
    prisma.priceDailyStats.count(),
    prisma.priceSnapshot.count({
      where: {
        isSignificant: false,
        observedAt: { lt: daysAgo(30) },
      },
    }),
  ]);

  return {
    totalSnapshots,
    significantCount,
    dailyStatsCount,
    oldNonSignificant,
    potentialSavings: oldNonSignificant,
  };
}

// ─── Types ───────────────────────────────────────────────────────

interface MaintenanceReport {
  mergedDuplicates: number;
  daysAggregated: number;
  prunedSnapshots: number;
  durationMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Bound each bulk fetch so memory stays predictable even on very large tables.
const LISTING_BATCH_SIZE = 500;

async function listingIdBatches(): Promise<string[][]> {
  const listings = await prisma.listing.findMany({ select: { id: true } });
  const batches: string[][] = [];
  for (let i = 0; i < listings.length; i += LISTING_BATCH_SIZE) {
    batches.push(listings.slice(i, i + LISTING_BATCH_SIZE).map((l) => l.id));
  }
  return batches;
}

// ─── Phase 1: Merge consecutive duplicate snapshots ──────────────

/**
 * Find consecutive snapshots with the same listingId and observedPrice,
 * keep the earliest one (extend its lastSeenAt), delete the rest.
 *
 * Semantics preserved from V1: significant snapshots always break a run
 * (they're never deleted, and they always start a new anchor).
 */
async function mergeDuplicateSnapshots(): Promise<number> {
  const batches = await listingIdBatches();
  const anchorUpdates = new Map<string, Date>();
  const allIdsToDelete: string[] = [];

  for (const batch of batches) {
    // One query per batch of LISTING_BATCH_SIZE listings instead of one per listing.
    const rows = await prisma.priceSnapshot.findMany({
      where: { listingId: { in: batch } },
      orderBy: [{ listingId: 'asc' }, { observedAt: 'asc' }],
      select: {
        id: true,
        listingId: true,
        observedPrice: true,
        observedAt: true,
        lastSeenAt: true,
        isSignificant: true,
      },
    });

    // Group by listing in memory, then apply identical V1 per-listing logic.
    const byListing = new Map<string, typeof rows>();
    for (const s of rows) {
      const arr = byListing.get(s.listingId);
      if (arr) arr.push(s);
      else byListing.set(s.listingId, [s]);
    }

    for (const snapshots of byListing.values()) {
      if (snapshots.length < 2) continue;

      const idsToDelete: string[] = [];
      let anchor = snapshots[0]!;

      for (let i = 1; i < snapshots.length; i++) {
        const current = snapshots[i]!;
        if (current.observedPrice === anchor.observedPrice && !current.isSignificant) {
          idsToDelete.push(current.id);
        } else {
          if (idsToDelete.length > 0) {
            const lastDeleted = snapshots[i - 1]!;
            anchorUpdates.set(anchor.id, lastDeleted.lastSeenAt ?? lastDeleted.observedAt);
          }
          anchor = current;
        }
      }

      if (idsToDelete.length > 0) {
        const lastSnapshot = snapshots[snapshots.length - 1]!;
        if (idsToDelete.includes(lastSnapshot.id)) {
          anchorUpdates.set(anchor.id, lastSnapshot.lastSeenAt ?? lastSnapshot.observedAt);
        }
        allIdsToDelete.push(...idsToDelete);
      }
    }
  }

  // Bulk apply anchor lastSeenAt extensions. Fire concurrently in chunks so a
  // single long query does not stall the pool.
  if (anchorUpdates.size > 0) {
    const entries = Array.from(anchorUpdates.entries());
    for (let i = 0; i < entries.length; i += 50) {
      const chunk = entries.slice(i, i + 50);
      await Promise.all(
        chunk.map(([id, lastSeenAt]) =>
          prisma.priceSnapshot.update({ where: { id }, data: { lastSeenAt } })
        )
      );
    }
  }

  // Bulk delete duplicates (Postgres handles `id IN (...)` with ~1000 values fine).
  for (let i = 0; i < allIdsToDelete.length; i += 1000) {
    const chunk = allIdsToDelete.slice(i, i + 1000);
    await prisma.priceSnapshot.deleteMany({ where: { id: { in: chunk } } });
  }

  return allIdsToDelete.length;
}

// ─── Phase 2: Generate daily aggregations ────────────────────────

/**
 * For snapshots older than 30 days, generate PriceDailyStats grouped by
 * (listingId, date). Skip days that already have stats (ON CONFLICT DO NOTHING).
 *
 * Single statement — Postgres does the grouping. Idempotent: re-running only
 * inserts newly-eligible (listingId, date) pairs.
 */
async function generateDailyAggregations(): Promise<number> {
  const cutoff = daysAgo(30);

  const result = await prisma.$executeRaw`
    INSERT INTO "PriceDailyStats"
      ("id", "listingId", "date", "minPrice", "maxPrice", "avgPrice",
       "openPrice", "closePrice", "sampleCount")
    SELECT
      gen_random_uuid()::text,
      "listingId",
      date_trunc('day', "observedAt")::date,
      MIN("observedPrice"),
      MAX("observedPrice"),
      ROUND(AVG("observedPrice")::numeric, 2)::float,
      (ARRAY_AGG("observedPrice" ORDER BY "observedAt" ASC))[1],
      (ARRAY_AGG("observedPrice" ORDER BY "observedAt" DESC))[1],
      COUNT(*)::int
    FROM "PriceSnapshot"
    WHERE "observedAt" < ${cutoff}
    GROUP BY "listingId", date_trunc('day', "observedAt")::date
    ON CONFLICT ("listingId", "date") DO NOTHING
  `;

  return Number(result);
}

// ─── Phase 3: Prune old non-significant snapshots ────────────────

/**
 * Delete raw snapshots older than 30 days that:
 * - Are NOT significant (no big price changes)
 * - Have been aggregated into PriceDailyStats
 *
 * Preserves all significant records forever. Correlated DELETE with EXISTS —
 * guarantees we only remove rows whose day already lives in PriceDailyStats.
 */
async function pruneAggregatedSnapshots(): Promise<number> {
  const cutoff = daysAgo(30);

  const result = await prisma.$executeRaw`
    DELETE FROM "PriceSnapshot" ps
    WHERE ps."isSignificant" = false
      AND ps."observedAt" < ${cutoff}
      AND EXISTS (
        SELECT 1 FROM "PriceDailyStats" ds
        WHERE ds."listingId" = ps."listingId"
          AND ds."date" = date_trunc('day', ps."observedAt")::date
      )
  `;

  return Number(result);
}
