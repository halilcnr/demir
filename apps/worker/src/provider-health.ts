import { prisma, deriveProviderStatus } from '@repo/shared';
import type { ProviderStatus } from '@repo/shared';

export interface ProviderHealth {
  retailerSlug: string;
  status: ProviderStatus;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  consecutiveFailures: number;
  blockedCount: number;
  cooldownUntil: Date | null;
}

// ─── Discovery Source Health (in-memory per-cycle) ──────────────

export interface DiscoverySourceHealth {
  slug: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  blockedCount: number;
  consecutiveFailures: number;
  blockedThisCycle: boolean;
  cooldownUntil: number | null; // timestamp
}

const discoverySourceState = new Map<string, DiscoverySourceHealth>();
const DISCOVERY_SOURCES = ['akakce', 'cimri', 'enuygun', 'epey'] as const;

function getOrCreateDiscoverySource(slug: string): DiscoverySourceHealth {
  if (!discoverySourceState.has(slug)) {
    discoverySourceState.set(slug, {
      slug,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastBlockedAt: null,
      blockedCount: 0,
      consecutiveFailures: 0,
      blockedThisCycle: false,
      cooldownUntil: null,
    });
  }
  return discoverySourceState.get(slug)!;
}

export function recordDiscoverySuccess(slug: string): void {
  const s = getOrCreateDiscoverySource(slug);
  s.lastSuccessAt = new Date();
  s.consecutiveFailures = 0;
  s.blockedThisCycle = false;
  s.cooldownUntil = null;
}

export function recordDiscoveryFailure(slug: string): void {
  const s = getOrCreateDiscoverySource(slug);
  s.lastFailureAt = new Date();
  s.consecutiveFailures++;
}

export function recordDiscoveryBlocked(slug: string): void {
  const s = getOrCreateDiscoverySource(slug);
  s.lastBlockedAt = new Date();
  s.blockedCount++;
  s.consecutiveFailures++;
  s.blockedThisCycle = true;
  // 10 min cooldown for blocked discovery sources
  s.cooldownUntil = Date.now() + 10 * 60 * 1000;
}

export function isDiscoverySourceAvailable(slug: string): boolean {
  const s = discoverySourceState.get(slug);
  if (!s) return true;
  if (s.blockedThisCycle) return false;
  if (s.cooldownUntil && Date.now() < s.cooldownUntil) return false;
  return true;
}

export function getDiscoverySourceHealth(): DiscoverySourceHealth[] {
  // Ensure all sources exist
  for (const src of DISCOVERY_SOURCES) getOrCreateDiscoverySource(src);
  return [...discoverySourceState.values()];
}

export function resetDiscoverySourceState(): void {
  for (const s of discoverySourceState.values()) {
    s.blockedThisCycle = false;
    // Keep cooldownUntil across cycles (time-based)
  }
}

// ── Per-provider cooldown configuration ──
export interface ProviderCooldownConfig {
  /** Initial cooldown after first block (ms) */
  blockCooldownMs: number;
  /** Cooldown after 429 rate limit (ms) */
  rateLimitCooldownMs: number;
  /** Multiplier for consecutive blocks */
  escalationFactor: number;
  /** Max cooldown cap (ms) */
  maxCooldownMs: number;
}

const DEFAULT_COOLDOWN: ProviderCooldownConfig = {
  blockCooldownMs: 5 * 60 * 1000,       // 5 min
  rateLimitCooldownMs: 3 * 60 * 1000,   // 3 min
  escalationFactor: 1.5,
  maxCooldownMs: 30 * 60 * 1000,        // 30 min
};

// ── Provider-specific cooldown overrides ──
const PROVIDER_COOLDOWNS: Record<string, Partial<ProviderCooldownConfig>> = {
  amazon:      { blockCooldownMs: 10 * 60 * 1000, rateLimitCooldownMs: 5 * 60 * 1000, maxCooldownMs: 60 * 60 * 1000 },
  hepsiburada: { blockCooldownMs: 8 * 60 * 1000, maxCooldownMs: 45 * 60 * 1000 },
  trendyol:    { blockCooldownMs: 8 * 60 * 1000, maxCooldownMs: 45 * 60 * 1000 },
  n11:         { blockCooldownMs: 10 * 60 * 1000, rateLimitCooldownMs: 5 * 60 * 1000, maxCooldownMs: 60 * 60 * 1000 },
  mediamarkt:  { blockCooldownMs: 5 * 60 * 1000 },
  pazarama:    { blockCooldownMs: 5 * 60 * 1000 },
  a101:        { blockCooldownMs: 5 * 60 * 1000 },
  migros:      { blockCooldownMs: 5 * 60 * 1000 },
  idefix:      { blockCooldownMs: 5 * 60 * 1000 },
};

function getCooldownConfig(slug: string): ProviderCooldownConfig {
  return { ...DEFAULT_COOLDOWN, ...PROVIDER_COOLDOWNS[slug] };
}

/**
 * In-memory provider health state for the current sync cycle.
 * Tracks blocks, cooldowns, and consecutive failures per cycle.
 */
const blockedThisCycle = new Set<string>();
const cooldownUntilMap = new Map<string, number>(); // slug → timestamp when cooldown ends
const cycleFailureCounts = new Map<string, number>(); // slug → failures this cycle

/** Mark provider as blocked for the rest of this sync cycle + apply cooldown */
export function markBlockedThisCycle(slug: string): void {
  blockedThisCycle.add(slug);
  const config = getCooldownConfig(slug);
  const currentFailures = cycleFailureCounts.get(slug) ?? 0;
  const escalation = Math.pow(config.escalationFactor, Math.min(currentFailures, 5));
  const cooldownMs = Math.min(config.blockCooldownMs * escalation, config.maxCooldownMs);
  cooldownUntilMap.set(slug, Date.now() + cooldownMs);
}

/** Apply rate limit cooldown (lighter than block) */
export function applyCooldown(slug: string, type: 'block' | 'rate_limit' = 'block', retryAfterMs?: number): void {
  const config = getCooldownConfig(slug);
  const currentFailures = cycleFailureCounts.get(slug) ?? 0;
  let cooldownMs: number;

  if (retryAfterMs) {
    cooldownMs = Math.min(retryAfterMs, config.maxCooldownMs);
  } else if (type === 'rate_limit') {
    cooldownMs = config.rateLimitCooldownMs * Math.pow(config.escalationFactor, Math.min(currentFailures, 3));
  } else {
    cooldownMs = config.blockCooldownMs * Math.pow(config.escalationFactor, Math.min(currentFailures, 5));
  }

  cooldownMs = Math.min(cooldownMs, config.maxCooldownMs);
  const existingCooldown = cooldownUntilMap.get(slug) ?? 0;
  cooldownUntilMap.set(slug, Math.max(existingCooldown, Date.now() + cooldownMs));
}

/** Check if provider is blocked this cycle */
export function isBlockedThisCycle(slug: string): boolean {
  return blockedThisCycle.has(slug);
}

/** Check if provider is in cooldown (returns true if should skip) */
export function isInCooldown(slug: string): boolean {
  const until = cooldownUntilMap.get(slug);
  if (!until) return false;
  if (Date.now() >= until) {
    cooldownUntilMap.delete(slug); // cooldown expired
    return false;
  }
  return true;
}

/** Get cooldown remaining ms for a provider */
export function getCooldownRemainingMs(slug: string): number {
  const until = cooldownUntilMap.get(slug);
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

/** Get all provider cooldown states */
export function getAllCooldownStates(): Record<string, { inCooldown: boolean; remainingMs: number; blockedThisCycle: boolean }> {
  const result: Record<string, { inCooldown: boolean; remainingMs: number; blockedThisCycle: boolean }> = {};
  for (const [slug, until] of cooldownUntilMap.entries()) {
    const remaining = Math.max(0, until - Date.now());
    result[slug] = { inCooldown: remaining > 0, remainingMs: remaining, blockedThisCycle: blockedThisCycle.has(slug) };
  }
  // Also include blocked providers that may not have cooldowns
  for (const slug of blockedThisCycle) {
    if (!result[slug]) {
      result[slug] = { inCooldown: false, remainingMs: 0, blockedThisCycle: true };
    }
  }
  return result;
}

/** Reset cycle state — call at start of each sync run */
export function resetCycleState(): void {
  blockedThisCycle.clear();
  cooldownUntilMap.clear();
  cycleFailureCounts.clear();
  resetDiscoverySourceState();
}

/** Record a successful scrape for a retailer */
export async function recordSuccess(retailerSlug: string): Promise<void> {
  cycleFailureCounts.delete(retailerSlug); // reset failure count on success
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
  cycleFailureCounts.set(retailerSlug, (cycleFailureCounts.get(retailerSlug) ?? 0) + 1);
  await prisma.retailer.update({
    where: { slug: retailerSlug },
    data: {
      lastFailureAt: new Date(),
      consecutiveFailures: { increment: 1 },
    },
  });
}

/** Record a 403 block event for a retailer — applies cooldown + blocks cycle */
export async function recordBlocked(retailerSlug: string): Promise<void> {
  markBlockedThisCycle(retailerSlug);
  cycleFailureCounts.set(retailerSlug, (cycleFailureCounts.get(retailerSlug) ?? 0) + 1);
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

/** Derive provider status from DB fields + in-memory cooldown state */
export function deriveStatus(retailer: {
  slug?: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  consecutiveFailures: number;
}): ProviderStatus {
  // Check in-memory cooldown first (worker-only state)
  if (retailer.slug && isInCooldown(retailer.slug)) {
    return 'cooldown';
  }
  return deriveProviderStatus(retailer);
}

/** Get health for all retailers */
export async function getAllProviderHealth(): Promise<ProviderHealth[]> {
  const retailers = await prisma.retailer.findMany();
  return retailers.map((r) => ({
    retailerSlug: r.slug,
    status: deriveStatus({ ...r, slug: r.slug }),
    lastSuccessAt: r.lastSuccessAt,
    lastFailureAt: r.lastFailureAt,
    lastBlockedAt: r.lastBlockedAt,
    consecutiveFailures: r.consecutiveFailures,
    blockedCount: r.blockedCount,
    cooldownUntil: cooldownUntilMap.has(r.slug) ? new Date(cooldownUntilMap.get(r.slug)!) : null,
  }));
}
