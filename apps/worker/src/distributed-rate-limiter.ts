/**
 * In-Memory Rate Limiter with periodic DB sync.
 *
 * Replaces the old DB-per-request approach (4-5 DB calls/task) with
 * in-memory counters synced to DB every 30s for dashboard visibility.
 * Saves ~4-5 DB round-trips per scrape task.
 */

import { prisma } from '@repo/shared';

/** Default rate limits per provider */
const DEFAULT_LIMITS: Record<string, { maxPerMinute: number; maxConcurrency: number }> = {
  amazon:      { maxPerMinute: 15, maxConcurrency: 3 },
  hepsiburada: { maxPerMinute: 20, maxConcurrency: 4 },
  trendyol:    { maxPerMinute: 20, maxConcurrency: 4 },
  n11:         { maxPerMinute: 10, maxConcurrency: 2 },
  pazarama:    { maxPerMinute: 12, maxConcurrency: 2 },
  idefix:      { maxPerMinute: 10, maxConcurrency: 2 },
  mediamarkt:  { maxPerMinute: 10, maxConcurrency: 2 },
  a101:        { maxPerMinute: 12, maxConcurrency: 2 },
  migros:      { maxPerMinute: 12, maxConcurrency: 2 },
};

const RATE_WINDOW_MS = 60_000; // 1 minute window
const DB_SYNC_INTERVAL_MS = 30_000; // sync to DB every 30s

// ─── In-memory state per provider ─────────────────────────────
interface ProviderRateState {
  currentCount: number;
  currentConcurrency: number;
  windowStart: number; // epoch ms
}

const state = new Map<string, ProviderRateState>();

function getState(slug: string): ProviderRateState {
  let s = state.get(slug);
  if (!s) {
    s = { currentCount: 0, currentConcurrency: 0, windowStart: Date.now() };
    state.set(slug, s);
  }
  return s;
}

/**
 * Try to acquire a rate-limited slot for a provider.
 * Pure in-memory — 0 DB calls.
 */
export function acquireRateSlot(slug: string): boolean {
  const limits = DEFAULT_LIMITS[slug] ?? { maxPerMinute: 10, maxConcurrency: 2 };
  const s = getState(slug);
  const now = Date.now();

  // Reset window if expired
  if (now - s.windowStart > RATE_WINDOW_MS) {
    s.currentCount = 0;
    s.windowStart = now;
  }

  if (s.currentCount >= limits.maxPerMinute || s.currentConcurrency >= limits.maxConcurrency) {
    return false;
  }

  s.currentCount++;
  s.currentConcurrency++;
  return true;
}

/**
 * Release a concurrency slot after a request completes.
 * Pure in-memory — 0 DB calls.
 */
export function releaseRateSlot(slug: string): void {
  const s = state.get(slug);
  if (s && s.currentConcurrency > 0) {
    s.currentConcurrency--;
  }
}

/**
 * Get current rate limit status for all providers (for dashboard).
 */
export async function getAllRateLimits() {
  try {
    return await prisma.providerRateLimit.findMany({
      orderBy: { id: 'asc' },
    });
  } catch {
    return [];
  }
}

/**
 * Initialize rate limit records for all known providers & start DB sync.
 */
export async function initRateLimits(): Promise<void> {
  for (const [slug, limits] of Object.entries(DEFAULT_LIMITS)) {
    state.set(slug, { currentCount: 0, currentConcurrency: 0, windowStart: Date.now() });
    await prisma.providerRateLimit.upsert({
      where: { id: slug },
      create: {
        id: slug,
        maxPerMinute: limits.maxPerMinute,
        maxConcurrency: limits.maxConcurrency,
        currentCount: 0,
        currentConcurrency: 0,
        windowStart: new Date(),
      },
      update: {
        maxPerMinute: limits.maxPerMinute,
        maxConcurrency: limits.maxConcurrency,
      },
    }).catch(() => {});
  }

  // Periodic DB sync for dashboard visibility
  setInterval(() => { syncRateLimitsToDB().catch(() => {}); }, DB_SYNC_INTERVAL_MS);
}

/**
 * Reset all concurrency counters (call on startup to clear stale locks from crashed workers).
 */
export function resetAllConcurrency(): void {
  for (const s of state.values()) {
    s.currentConcurrency = 0;
  }
  // Also reset DB (fire-and-forget)
  prisma.providerRateLimit.updateMany({
    data: { currentConcurrency: 0 },
  }).catch(() => {});
}

/** Sync in-memory state to DB for dashboard visibility */
async function syncRateLimitsToDB(): Promise<void> {
  for (const [slug, s] of state.entries()) {
    await prisma.providerRateLimit.updateMany({
      where: { id: slug },
      data: {
        currentCount: s.currentCount,
        currentConcurrency: s.currentConcurrency,
        windowStart: new Date(s.windowStart),
      },
    }).catch(() => {});
  }
}
