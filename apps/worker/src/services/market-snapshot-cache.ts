/**
 * Persistent MarketSnapshotCache — second-level cache backing
 * the in-memory cycle cache in deals.ts.
 *
 * Survives worker restarts and is shared across multi-worker deployments.
 * TTL is enforced at read time (`ts > NOW() - interval`).
 */

import { prisma } from '@repo/shared';
import type { GlobalMarketSnapshot } from '../deals';

const TTL_SECONDS = 120;

interface CachedPayload {
  data: GlobalMarketSnapshot;
}

/** Fetch a cached snapshot if it exists and is within TTL. Returns null on miss/expiry/error. */
export async function getPersistedSnapshot(
  key: string,
): Promise<GlobalMarketSnapshot | null> {
  try {
    const row = await prisma.marketSnapshotCache.findUnique({
      where: { key },
      select: { data: true, ts: true },
    });
    if (!row) return null;
    const ageMs = Date.now() - row.ts.getTime();
    if (ageMs > TTL_SECONDS * 1000) return null;

    const payload = row.data as unknown as CachedPayload;
    return rehydrate(payload.data);
  } catch (err) {
    console.warn('[market-snapshot-cache] read failed:', (err as Error).message);
    return null;
  }
}

/** Upsert a snapshot into the persistent cache. Fire-and-forget; never throws. */
export async function setPersistedSnapshot(
  key: string,
  data: GlobalMarketSnapshot,
): Promise<void> {
  try {
    const payload: CachedPayload = { data };
    await prisma.marketSnapshotCache.upsert({
      where: { key },
      create: { key, data: payload as unknown as object, ts: new Date() },
      update: { data: payload as unknown as object, ts: new Date() },
    });
  } catch (err) {
    console.warn('[market-snapshot-cache] write failed:', (err as Error).message);
  }
}

/** Rehydrate Date fields that JSON serialization flattened to ISO strings. */
function rehydrate(snap: GlobalMarketSnapshot): GlobalMarketSnapshot {
  return {
    ...snap,
    allInStockPrices: snap.allInStockPrices.map((p) => ({
      ...p,
      lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt as unknown as string) : null,
    })),
  };
}

/** Best-effort cleanup of expired cache rows. Call from scheduled maintenance. */
export async function pruneExpiredSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - TTL_SECONDS * 1000 * 10); // keep a 10× buffer for debugging
  const result = await prisma.marketSnapshotCache.deleteMany({
    where: { ts: { lt: cutoff } },
  });
  return result.count;
}
