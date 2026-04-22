/**
 * Pulse Protocol — cycle-based dynamic backoff for scrape targets.
 *
 * Goals:
 *   1. Stop hammering listings that keep failing (anti-ban, anti-bot detection)
 *   2. Give dead listings a probabilistic chance to come back (Lazarus sampling)
 *   3. Zero per-cycle table scans / mass updates — the scheduler just bumps a
 *      single `currentCycle` counter, and each listing stores an *absolute*
 *      `skipUntilCycle` target. Eligibility = `skipUntilCycle <= currentCycle`.
 *
 * Backoff schedule (cycles, not time — so it stretches when the scheduler is paused):
 *   fails 1–2   → +5   cycles  (~25 min @ 5 min/cycle)
 *   fails 3–5   → +30  cycles  (~2.5 h)
 *   fails 6–10  → +150 cycles  (~12 h)
 *   fails 11+   → +500 cycles + random 0–49 jitter  (~40 h, staggered)
 *
 * Jitter on Deep Sleep is critical — without it, a scraper that fails 11× on
 * 1000 listings simultaneously would wake 1000 listings on the exact same cycle
 * and hammer the retailer in a spike. Jitter spreads the recovery.
 */

import { prisma } from '@repo/shared';

// ─── Config ─────────────────────────────────────────────────────

const LAZARUS_SAMPLE_RATE = 0.01;   // 1% of dormant listings get a retry shot each cycle
const LAZARUS_SAMPLE_CAP = 50;       // Hard cap — never resurrect more than this per cycle

// Backoff thresholds (in cycles). Tuned for ~5 min scheduler cadence.
const BACKOFF_LIGHT_CYCLES = 5;
const BACKOFF_MEDIUM_CYCLES = 30;
const BACKOFF_HEAVY_CYCLES = 150;
const BACKOFF_DEEP_SLEEP_CYCLES = 500;
const BACKOFF_DEEP_SLEEP_JITTER = 50;

// ─── Scheduler cycle counter ────────────────────────────────────

/**
 * Atomically bump the global scheduler cycle counter and return the new value.
 * Upserts the singleton row on first run. All eligibility checks hang off this value.
 */
export async function advanceCycle(): Promise<number> {
  const row = await prisma.schedulerState.upsert({
    where: { id: 'default' },
    create: { id: 'default', currentCycle: 1 },
    update: { currentCycle: { increment: 1 } },
    select: { currentCycle: true },
  });
  return row.currentCycle;
}

/** Read the current cycle without bumping. Used by listing-queue filters. */
export async function getCurrentCycle(): Promise<number> {
  const row = await prisma.schedulerState.findUnique({
    where: { id: 'default' },
    select: { currentCycle: true },
  });
  return row?.currentCycle ?? 0;
}

// ─── Success / Failure handlers ─────────────────────────────────

/**
 * Reset pulse state after a successful scrape.
 *
 * Resets `consecutiveFailures` and `skipUntilCycle` to 0, marks `isFresh=true`.
 * Designed to be spread into the caller's main `prisma.listing.update` so it
 * adds zero extra round trips.
 */
export const pulseSuccessFields = {
  consecutiveFailures: 0,
  skipUntilCycle: 0,
  isFresh: true,
} as const;

/**
 * Record a failed scrape. Computes `skipUntilCycle` atomically using a
 * single UPDATE with a CASE expression — no read-then-write race window
 * even when the same listing fails on two workers simultaneously.
 *
 * Callers should still record `lastBlockedAt`/`stockStatus` in their own
 * update as today; this helper only manages the pulse columns.
 */
export async function handleScrapeFailure(listingId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Listing"
    SET "consecutiveFailures" = "consecutiveFailures" + 1,
        "isFresh" = false,
        "skipUntilCycle" = (
          COALESCE(
            (SELECT "currentCycle" FROM "SchedulerState" WHERE id = 'default'),
            0
          )
          + CASE
              WHEN "consecutiveFailures" + 1 BETWEEN 1 AND 2  THEN ${BACKOFF_LIGHT_CYCLES}
              WHEN "consecutiveFailures" + 1 BETWEEN 3 AND 5  THEN ${BACKOFF_MEDIUM_CYCLES}
              WHEN "consecutiveFailures" + 1 BETWEEN 6 AND 10 THEN ${BACKOFF_HEAVY_CYCLES}
              ELSE ${BACKOFF_DEEP_SLEEP_CYCLES} + FLOOR(RANDOM() * ${BACKOFF_DEEP_SLEEP_JITTER})::INT
            END
        )
    WHERE id = ${listingId}
  `;
}

// ─── Lazarus awakening ──────────────────────────────────────────

/**
 * Return a probabilistic 1% sample of "dormant" listings (either deferred by
 * the pulse backoff, or explicitly deactivated) that deserve an unannounced
 * retry. This keeps dead URLs fresh-ish for restock detection without a
 * predictable check cadence that bot detection could fingerprint.
 *
 * Uses Bernoulli sampling (`random() < p`) after the WHERE filter so the
 * ratio is applied to the *dormant pool*, not the whole table.
 */
export async function getLazarusSample(currentCycle: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Listing"
    WHERE ("skipUntilCycle" > ${currentCycle} OR "isActive" = false)
      AND "productUrl" <> ''
      AND random() < ${LAZARUS_SAMPLE_RATE}
    LIMIT ${LAZARUS_SAMPLE_CAP}
  `;
  return rows.map((r) => r.id);
}

// ─── Query helpers for task-queue ───────────────────────────────

/**
 * Prisma `where` fragment for listings eligible to scrape this cycle.
 * Compose with the rest of your filter: `{ ...eligibilityFilter(cycle), retailer: {...} }`.
 */
export function eligibilityFilter(currentCycle: number) {
  return {
    isActive: true,
    skipUntilCycle: { lte: currentCycle },
  } as const;
}
