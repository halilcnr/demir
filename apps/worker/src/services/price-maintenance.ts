/**
 * Price Maintenance Worker
 *
 * Runs daily to:
 * 1. Merge consecutive duplicate snapshots (same listing + same price in a row)
 * 2. Generate PriceDailyStats aggregations for data older than 30 days
 * 3. Prune non-significant raw snapshots that have been aggregated (>30 days old)
 *
 * NEVER deletes significant records (price drops ≥2%, changes ≥5%, >500 TL swings).
 * Existing learning data is preserved — only true duplicates are merged.
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

// ─── Phase 1: Merge consecutive duplicate snapshots ──────────────

/**
 * Find consecutive snapshots with the same listingId and observedPrice,
 * keep the earliest one (extend its lastSeenAt), delete the rest.
 */
async function mergeDuplicateSnapshots(): Promise<number> {
  let totalMerged = 0;

  // Process in batches by listing to avoid loading everything into memory
  const listings = await prisma.listing.findMany({
    select: { id: true },
  });

  for (const listing of listings) {
    const snapshots = await prisma.priceSnapshot.findMany({
      where: { listingId: listing.id },
      orderBy: { observedAt: 'asc' },
      select: { id: true, observedPrice: true, observedAt: true, lastSeenAt: true, isSignificant: true },
    });

    if (snapshots.length < 2) continue;

    const idsToDelete: string[] = [];
    let anchor = snapshots[0]!;

    for (let i = 1; i < snapshots.length; i++) {
      const current = snapshots[i]!;
      if (current.observedPrice === anchor.observedPrice && !current.isSignificant) {
        // Same price → mark for deletion, extend anchor's lastSeenAt
        idsToDelete.push(current.id);
      } else {
        // Price changed → update anchor's lastSeenAt to the last seen time, move anchor
        if (idsToDelete.length > 0) {
          const lastDeleted = snapshots[i - 1]!;
          await prisma.priceSnapshot.update({
            where: { id: anchor.id },
            data: { lastSeenAt: lastDeleted.lastSeenAt ?? lastDeleted.observedAt },
          });
        }
        anchor = current;
      }
    }

    // Handle trailing duplicates
    if (idsToDelete.length > 0) {
      const lastSnapshot = snapshots[snapshots.length - 1]!;
      if (idsToDelete.includes(lastSnapshot.id)) {
        await prisma.priceSnapshot.update({
          where: { id: anchor.id },
          data: { lastSeenAt: lastSnapshot.lastSeenAt ?? lastSnapshot.observedAt },
        });
      }
    }

    // Batch delete duplicates (100 at a time to avoid query size limits)
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const batch = idsToDelete.slice(i, i + 100);
      await prisma.priceSnapshot.deleteMany({
        where: { id: { in: batch } },
      });
    }

    totalMerged += idsToDelete.length;
  }

  return totalMerged;
}

// ─── Phase 2: Generate daily aggregations ────────────────────────

/**
 * For snapshots older than 30 days, generate PriceDailyStats
 * grouped by (listingId, date). Skip days that already have stats.
 */
async function generateDailyAggregations(): Promise<number> {
  const cutoff = daysAgo(30);
  let daysCreated = 0;

  const listings = await prisma.listing.findMany({
    select: { id: true },
  });

  for (const listing of listings) {
    // Get old snapshots grouped by date
    const oldSnapshots = await prisma.priceSnapshot.findMany({
      where: {
        listingId: listing.id,
        observedAt: { lt: cutoff },
      },
      orderBy: { observedAt: 'asc' },
      select: { observedPrice: true, observedAt: true },
    });

    if (oldSnapshots.length === 0) continue;

    // Group by date (YYYY-MM-DD)
    const byDate = new Map<string, number[]>();
    for (const snap of oldSnapshots) {
      const dateKey = snap.observedAt.toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(snap.observedPrice);
    }

    for (const [dateStr, prices] of byDate) {
      const date = new Date(dateStr + 'T00:00:00.000Z');

      // Skip if already aggregated
      const existing = await prisma.priceDailyStats.findUnique({
        where: { listingId_date: { listingId: listing.id, date } },
      });
      if (existing) continue;

      const sorted = [...prices].sort((a, b) => a - b);
      const min = sorted[0]!;
      const max = sorted[sorted.length - 1]!;
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

      // Get first and last of the day for open/close
      const daySnapshots = oldSnapshots.filter(
        (s) => s.observedAt.toISOString().slice(0, 10) === dateStr
      );
      const openPrice = daySnapshots[0]!.observedPrice;
      const closePrice = daySnapshots[daySnapshots.length - 1]!.observedPrice;

      await prisma.priceDailyStats.create({
        data: {
          listingId: listing.id,
          date,
          minPrice: min,
          maxPrice: max,
          avgPrice: Math.round(avg * 100) / 100,
          openPrice,
          closePrice,
          sampleCount: prices.length,
        },
      });

      daysCreated++;
    }
  }

  return daysCreated;
}

// ─── Phase 3: Prune old non-significant snapshots ────────────────

/**
 * Delete raw snapshots older than 30 days that:
 * - Are NOT significant (no big price changes)
 * - Have been aggregated into PriceDailyStats
 *
 * This preserves significant records forever as learning data.
 */
async function pruneAggregatedSnapshots(): Promise<number> {
  const cutoff = daysAgo(30);
  let totalPruned = 0;

  // Only delete non-significant snapshots whose day has been aggregated
  const aggregatedDays = await prisma.priceDailyStats.findMany({
    select: { listingId: true, date: true },
  });

  // Build a Set for fast lookup
  const aggregatedSet = new Set(
    aggregatedDays.map((d) => `${d.listingId}|${d.date.toISOString().slice(0, 10)}`)
  );

  // Process in batches
  const listings = await prisma.listing.findMany({
    select: { id: true },
  });

  for (const listing of listings) {
    const candidates = await prisma.priceSnapshot.findMany({
      where: {
        listingId: listing.id,
        isSignificant: false,
        observedAt: { lt: cutoff },
      },
      select: { id: true, observedAt: true },
    });

    const idsToDelete = candidates.filter((snap) => {
      const dateKey = snap.observedAt.toISOString().slice(0, 10);
      return aggregatedSet.has(`${listing.id}|${dateKey}`);
    }).map((s) => s.id);

    for (let i = 0; i < idsToDelete.length; i += 100) {
      const batch = idsToDelete.slice(i, i + 100);
      await prisma.priceSnapshot.deleteMany({
        where: { id: { in: batch } },
      });
    }

    totalPruned += idsToDelete.length;
  }

  return totalPruned;
}
