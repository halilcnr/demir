/**
 * D2 — Buffered PriceSnapshot upsert flusher (SCAFFOLD — NOT WIRED IN).
 *
 * Status: skeleton committed for review. Not called from task-worker yet
 * because per-row inserts still work under current load (~25K rows/day,
 * well below per-row-insert throughput limits).
 *
 * Activate this when:
 *   - Worker count ≥ 5, AND
 *   - Observed pg_stat write latency p95 > 50ms for PriceSnapshot inserts
 *
 * Design notes:
 *   - Flush trigger: whichever fires first
 *       · buffered rows ≥ FLUSH_ROW_THRESHOLD (500)
 *       · elapsed since first enqueue ≥ FLUSH_INTERVAL_MS (1000)
 *   - Backpressure: producers await when buffer > BACKPRESSURE_ROWS (5000).
 *     No disk spill — Railway disks are ephemeral; loss on SIGKILL is bounded
 *     to 1s of scrapes (acceptable: next cycle re-scrapes).
 *   - Flush uses INSERT ... ON CONFLICT DO UPDATE. PriceSnapshot has no natural
 *     unique key beyond (listingId, observedAt) which at ms resolution is safe
 *     against realistic duplicates — but we don't have a unique index there yet.
 *     Before enabling: add `@@unique([listingId, observedAt])` in schema.
 *
 * Crash-safety budget: 1000ms max data loss window.
 * Memory cap: 5000 rows × ~300B ≈ 1.5MB (well under 20MB spec).
 */

import { prisma } from '@repo/shared';
import type { Prisma } from '@prisma/client';

export interface PriceSnapshotRow {
  listingId: string;
  observedPrice: number;
  previousPrice: number | null;
  currency?: string;
  changePercent: number | null;
  changeAmount: number | null;
  source: string | null;
  strategyUsed: string | null;
  parseConfidence: number | null;
  observedAt: Date;
  isSignificant: boolean;
}

const FLUSH_ROW_THRESHOLD = 500;
const FLUSH_INTERVAL_MS = 1000;
const BACKPRESSURE_ROWS = 5000;

let buffer: PriceSnapshotRow[] = [];
let firstEnqueuedAt = 0;
let flushTimer: NodeJS.Timeout | null = null;
let flushInProgress = false;
const producerWaiters: Array<() => void> = [];

/** Enqueue a snapshot. Returns a promise that only blocks under backpressure. */
export async function enqueueSnapshot(row: PriceSnapshotRow): Promise<void> {
  if (buffer.length >= BACKPRESSURE_ROWS) {
    // Block producer until buffer drains below threshold.
    await new Promise<void>((resolve) => producerWaiters.push(resolve));
  }

  if (buffer.length === 0) firstEnqueuedAt = Date.now();
  buffer.push(row);

  if (buffer.length >= FLUSH_ROW_THRESHOLD) {
    void flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
}

async function flush(): Promise<void> {
  if (flushInProgress) return;
  if (buffer.length === 0) return;
  flushInProgress = true;

  const batch = buffer;
  buffer = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

  try {
    // Prisma's createMany is enough when duplicates aren't expected.
    // For true upsert semantics switch to $executeRaw with INSERT ... ON CONFLICT.
    // ASSUMES: schema gets `@@unique([listingId, observedAt])` before raw-upsert path is enabled.
    await prisma.priceSnapshot.createMany({
      data: batch as unknown as Prisma.PriceSnapshotCreateManyInput[],
      skipDuplicates: true,
    });
  } catch (err) {
    console.error('[price-buffer] Flush failed, rows dropped:', err instanceof Error ? err.message : err, `(n=${batch.length})`);
    // Intentionally do NOT requeue — the next scrape cycle re-observes these
    // prices, and an unbounded retry loop is a worse failure mode than a
    // bounded-loss flush on DB hiccup.
  } finally {
    flushInProgress = false;
    // Release any producers that were blocked on backpressure
    while (producerWaiters.length && buffer.length < BACKPRESSURE_ROWS / 2) {
      const cb = producerWaiters.shift();
      cb?.();
    }
    firstEnqueuedAt = 0;
  }
}

/** Drain buffer on graceful shutdown. Returns rows flushed. */
export async function drainPriceBuffer(): Promise<number> {
  const count = buffer.length;
  await flush();
  return count;
}

export function getPriceBufferDepth(): number {
  return buffer.length;
}
