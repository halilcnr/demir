/**
 * V5 — Trust-Score Reinforcement.
 *
 * Per-retailer reliability score (0..100). Two pillars:
 *   1. Reinforcement: GOT_IT (+10), OUT_OF_STOCK (-5).
 *      Plain additive — easy to explain, easy to debug. Caller-side rate limit.
 *   2. Daily mean-reversion: trustScore += (100 - trustScore) × 0.02.
 *      Eski hatalar sonsuza kadar cezalandırılmasın diye günlük 2% recovery.
 *      Yeni davranışa adapte ol — 30 günde halen ~%45 toparlanır.
 *
 * Consumers:
 *   • Baki-Quant: trustScore < 50 → required margin × 1.5 (sermaye koruması).
 *   • AIMD: effectiveConcurrency = base × (avgTrustScore / 100).
 *
 * Wilson lower-bound (used by getMarginMultiplier):
 *   Pure point estimate (e.g. 1/1 = 100%) is high-variance noise.
 *   We use Wilson 95% lower bound on the success rate of the last 30d feedback,
 *   defaulting to the legacy trustScore when the sample is too thin.
 */

import { prisma } from '@repo/shared';

// ─── Reinforcement deltas ────────────────────────────────────────
const TRUST_DELTA_POSITIVE =  10;
const TRUST_DELTA_NEGATIVE = -5;

const TRUST_FLOOR = 0;
const TRUST_CEIL  = 100;

// ─── Margin escalation threshold ─────────────────────────────────
const MARGIN_ESCALATION_THRESHOLD = 50;
const MARGIN_ESCALATION_MULTIPLIER = 1.5;

// ─── Decay (mean-reversion towards 100) ──────────────────────────
const DECAY_RATE_PER_DAY = 0.02;        // 2% recovery per day
const DECAY_TARGET = TRUST_CEIL;        // pull towards 100

// ─── Wilson lower-bound config ───────────────────────────────────
const WILSON_Z_95 = 1.96;
const MIN_FEEDBACK_FOR_WILSON = 5;       // below this, fall back to trustScore
const WILSON_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory cache so per-deal margin lookups don't hit the DB.
const marginCache = new Map<string, { multiplier: number; tag: 'NORMAL' | 'ESCALATED'; expiresAt: number }>();
const MARGIN_CACHE_TTL_MS = 60_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Adjust trustScore by `delta`, clamped to [0, 100]. */
export async function bumpTrustScore(retailerSlug: string, delta: number): Promise<void> {
  if (delta === 0) return;
  await prisma.$executeRaw`
    UPDATE "Retailer"
    SET "trustScore" = GREATEST(${TRUST_FLOOR}, LEAST(${TRUST_CEIL}, "trustScore" + ${delta}))
    WHERE slug = ${retailerSlug}
  `;
  marginCache.delete(retailerSlug); // invalidate
}

export async function recordPositiveFeedback(retailerSlug: string): Promise<void> {
  await bumpTrustScore(retailerSlug, TRUST_DELTA_POSITIVE);
}

export async function recordNegativeFeedback(retailerSlug: string): Promise<void> {
  await bumpTrustScore(retailerSlug, TRUST_DELTA_NEGATIVE);
}

/**
 * Daily decay cron — pull every retailer's score back towards 100 by 2%.
 *   newScore = score + (100 - score) × 0.02
 * Idempotency: lastTrustDecayAt is checked; runs at most once per 23h.
 */
export async function runTrustScoreDecay(): Promise<{ updated: number; skipped: number }> {
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const retailers = await prisma.retailer.findMany({
    select: { id: true, slug: true, trustScore: true, lastTrustDecayAt: true },
  });

  let updated = 0, skipped = 0;
  for (const r of retailers) {
    if (r.lastTrustDecayAt && r.lastTrustDecayAt > cutoff) {
      skipped++;
      continue;
    }
    const newScore = clamp(
      Math.round(r.trustScore + (DECAY_TARGET - r.trustScore) * DECAY_RATE_PER_DAY),
      TRUST_FLOOR,
      TRUST_CEIL,
    );
    await prisma.retailer.update({
      where: { id: r.id },
      data: { trustScore: newScore, lastTrustDecayAt: new Date() },
    });
    marginCache.delete(r.slug);
    updated++;
  }
  if (updated > 0) console.log(`[trust-score] 🔄 Decay applied to ${updated} retailer(s) (${skipped} skipped — within 23h)`);
  return { updated, skipped };
}

/** Wilson 95% lower bound on success rate. Used to derate sparse retailers. */
function wilsonLowerBound(successes: number, total: number, z = WILSON_Z_95): number {
  if (total === 0) return 0;
  const phat = successes / total;
  const denom = 1 + (z * z) / total;
  const center = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
}

/**
 * Returns the required-margin multiplier for a retailer.
 * Logic:
 *   1. If we have ≥ MIN_FEEDBACK_FOR_WILSON votes in the last 30d, use Wilson 95% lower bound:
 *        successRateLB < 0.50 → ESCALATED (1.5×)
 *      This avoids one good vote making a noisy retailer look trustworthy.
 *   2. Otherwise, fall back to trustScore < MARGIN_ESCALATION_THRESHOLD → ESCALATED.
 */
export async function getMarginMultiplier(
  retailerSlug: string,
): Promise<{ multiplier: number; tag: 'NORMAL' | 'ESCALATED'; reason: string }> {
  const cached = marginCache.get(retailerSlug);
  if (cached && cached.expiresAt > Date.now()) {
    return { multiplier: cached.multiplier, tag: cached.tag, reason: 'cache' };
  }

  const retailer = await prisma.retailer.findUnique({
    where: { slug: retailerSlug },
    select: { trustScore: true },
  });
  if (!retailer) {
    return { multiplier: 1.0, tag: 'NORMAL', reason: 'unknown-retailer' };
  }

  // Wilson path — only when sample is large enough.
  const since = new Date(Date.now() - WILSON_LOOKBACK_MS);
  const counts = await prisma.telegramFeedbackEvent.groupBy({
    by: ['button'],
    where: {
      retailerSlug,
      createdAt: { gte: since },
      button: { in: ['GOT_IT', 'OUT_OF_STOCK'] },
    },
    _count: true,
  });
  const got = counts.find(c => c.button === 'GOT_IT')?._count ?? 0;
  const oos = counts.find(c => c.button === 'OUT_OF_STOCK')?._count ?? 0;
  const total = got + oos;

  let escalated: boolean;
  let reason: string;
  if (total >= MIN_FEEDBACK_FOR_WILSON) {
    const lb = wilsonLowerBound(got, total);
    escalated = lb < 0.5;
    reason = `wilson(LB=${(lb * 100).toFixed(0)}%, n=${total})`;
  } else {
    escalated = retailer.trustScore < MARGIN_ESCALATION_THRESHOLD;
    reason = `trustScore=${retailer.trustScore} (n=${total} too small for Wilson)`;
  }

  const result = {
    multiplier: escalated ? MARGIN_ESCALATION_MULTIPLIER : 1.0,
    tag: (escalated ? 'ESCALATED' : 'NORMAL') as 'NORMAL' | 'ESCALATED',
    reason,
  };
  marginCache.set(retailerSlug, {
    multiplier: result.multiplier,
    tag: result.tag,
    expiresAt: Date.now() + MARGIN_CACHE_TTL_MS,
  });
  return result;
}

/**
 * Cluster-wide average trustScore — feeds AIMD effective concurrency.
 *   effectiveConcurrency = baseConcurrency × (avgTrustScore / 100)
 * Cached for AIMD tick (30s).
 */
let trustClusterCache: { avgTrust: number; expiresAt: number } | null = null;
const TRUST_CLUSTER_CACHE_TTL_MS = 30_000;

export async function getClusterAvgTrust(): Promise<number> {
  if (trustClusterCache && trustClusterCache.expiresAt > Date.now()) {
    return trustClusterCache.avgTrust;
  }
  const rows = await prisma.retailer.findMany({
    where: { isActive: true },
    select: { trustScore: true },
  });
  const avg = rows.length > 0
    ? rows.reduce((s, r) => s + r.trustScore, 0) / rows.length
    : TRUST_CEIL;
  trustClusterCache = { avgTrust: avg, expiresAt: Date.now() + TRUST_CLUSTER_CACHE_TTL_MS };
  return avg;
}

export async function getRetailerTrustSnapshot(): Promise<Array<{
  slug: string; name: string; trustScore: number; multiplier: number;
}>> {
  const rows = await prisma.retailer.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, trustScore: true },
    orderBy: { trustScore: 'asc' },
  });
  const snap = await Promise.all(rows.map(async r => {
    const m = await getMarginMultiplier(r.slug);
    return { slug: r.slug, name: r.name, trustScore: r.trustScore, multiplier: m.multiplier };
  }));
  return snap;
}
