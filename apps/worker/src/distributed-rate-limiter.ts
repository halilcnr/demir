/**
 * Distributed Rate Limiter.
 *
 * Coordinates rate limits across all worker instances using PostgreSQL.
 * Each provider has a max requests-per-minute and max concurrency.
 * Workers check and increment counters atomically before sending requests.
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

/**
 * Try to acquire a rate-limited slot for a provider.
 * Returns true if the request can proceed, false if rate limit exceeded.
 */
export async function acquireRateSlot(slug: string): Promise<boolean> {
  const limits = DEFAULT_LIMITS[slug] ?? { maxPerMinute: 10, maxConcurrency: 2 };
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  try {
    // Ensure record exists
    await prisma.providerRateLimit.upsert({
      where: { id: slug },
      create: {
        id: slug,
        maxPerMinute: limits.maxPerMinute,
        maxConcurrency: limits.maxConcurrency,
        currentCount: 0,
        currentConcurrency: 0,
        windowStart: now,
      },
      update: {},
    });

    // Reset window if expired, then try to increment atomically
    // First, reset stale windows
    await prisma.providerRateLimit.updateMany({
      where: { id: slug, windowStart: { lt: windowStart } },
      data: { currentCount: 0, windowStart: now },
    });

    // Try to increment count if under limit
    const result = await prisma.providerRateLimit.updateMany({
      where: {
        id: slug,
        currentCount: { lt: limits.maxPerMinute },
        currentConcurrency: { lt: limits.maxConcurrency },
      },
      data: {
        currentCount: { increment: 1 },
        currentConcurrency: { increment: 1 },
      },
    });

    return result.count > 0;
  } catch {
    // On error, allow the request (fail open for rate limiting)
    return true;
  }
}

/**
 * Release a concurrency slot after a request completes.
 */
export async function releaseRateSlot(slug: string): Promise<void> {
  try {
    // Decrement concurrency, but don't go below 0
    const current = await prisma.providerRateLimit.findUnique({ where: { id: slug } });
    if (current && current.currentConcurrency > 0) {
      await prisma.providerRateLimit.updateMany({
        where: { id: slug, currentConcurrency: { gt: 0 } },
        data: { currentConcurrency: { decrement: 1 } },
      });
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Get current rate limit status for all providers.
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
 * Initialize rate limit records for all known providers.
 */
export async function initRateLimits(): Promise<void> {
  for (const [slug, limits] of Object.entries(DEFAULT_LIMITS)) {
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
}

/**
 * Reset all concurrency counters (call on startup to clear stale locks from crashed workers).
 */
export async function resetAllConcurrency(): Promise<void> {
  await prisma.providerRateLimit.updateMany({
    data: { currentConcurrency: 0 },
  }).catch(() => {});
}
