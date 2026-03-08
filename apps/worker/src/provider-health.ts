import { prisma } from '@repo/shared';

export type ProviderStatus = 'healthy' | 'warning' | 'blocked' | 'error';

export interface ProviderHealth {
  retailerSlug: string;
  status: ProviderStatus;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  consecutiveFailures: number;
  blockedCount: number;
}

/**
 * In-memory provider health state for the current sync cycle.
 * Prevents further requests to a blocked provider within a single run.
 */
const blockedThisCycle = new Set<string>();

/** Mark provider as blocked for the rest of this sync cycle */
export function markBlockedThisCycle(slug: string): void {
  blockedThisCycle.add(slug);
}

/** Check if provider is blocked this cycle */
export function isBlockedThisCycle(slug: string): boolean {
  return blockedThisCycle.has(slug);
}

/** Reset cycle state — call at start of each sync run */
export function resetCycleState(): void {
  blockedThisCycle.clear();
}

/** Record a successful scrape for a retailer */
export async function recordSuccess(retailerSlug: string): Promise<void> {
  await prisma.retailer.update({
    where: { slug: retailerSlug },
    data: {
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
    },
  });
}

/** Record a failure (non-blocked) for a retailer */
export async function recordFailure(retailerSlug: string): Promise<void> {
  await prisma.retailer.update({
    where: { slug: retailerSlug },
    data: {
      lastFailureAt: new Date(),
      consecutiveFailures: { increment: 1 },
    },
  });
}

/** Record a 403 block event for a retailer */
export async function recordBlocked(retailerSlug: string): Promise<void> {
  markBlockedThisCycle(retailerSlug);
  await prisma.retailer.update({
    where: { slug: retailerSlug },
    data: {
      lastBlockedAt: new Date(),
      lastFailureAt: new Date(),
      blockedCount: { increment: 1 },
      consecutiveFailures: { increment: 1 },
    },
  });
}

const HEALTHY_WINDOW_MS = 15 * 60 * 1000; // 15 min
const WARNING_WINDOW_MS = 30 * 60 * 1000; // 30 min
const FAILURE_THRESHOLD = 5;

/** Derive provider status from DB fields */
export function deriveStatus(retailer: {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  consecutiveFailures: number;
}): ProviderStatus {
  const now = Date.now();

  // Blocked takes priority
  if (
    retailer.lastBlockedAt &&
    (!retailer.lastSuccessAt || retailer.lastBlockedAt > retailer.lastSuccessAt)
  ) {
    return 'blocked';
  }

  // Consecutive failure threshold
  if (retailer.consecutiveFailures >= FAILURE_THRESHOLD) {
    return 'error';
  }

  // Recent success → healthy
  if (retailer.lastSuccessAt && now - retailer.lastSuccessAt.getTime() < HEALTHY_WINDOW_MS) {
    return 'healthy';
  }

  // No recent success but within warning window or never succeeded
  if (
    retailer.lastSuccessAt &&
    now - retailer.lastSuccessAt.getTime() < WARNING_WINDOW_MS
  ) {
    return 'warning';
  }

  // No success at all, no failures either — just unknown/warning
  if (!retailer.lastSuccessAt && retailer.consecutiveFailures === 0) {
    return 'warning';
  }

  return 'error';
}

/** Get health for all retailers */
export async function getAllProviderHealth(): Promise<ProviderHealth[]> {
  const retailers = await prisma.retailer.findMany();
  return retailers.map((r) => ({
    retailerSlug: r.slug,
    status: deriveStatus(r),
    lastSuccessAt: r.lastSuccessAt,
    lastFailureAt: r.lastFailureAt,
    lastBlockedAt: r.lastBlockedAt,
    consecutiveFailures: r.consecutiveFailures,
    blockedCount: r.blockedCount,
  }));
}
