/**
 * V5 — Global No-Miss Override Engine.
 *
 * Triggers when discountPercentage > 45%. Bypasses Baki-Quant filters AND mute,
 * but applies its own safety checks because high-discount events are statistically
 * dominated by parser bugs / fiyat hatası, not real fırsat.
 *
 * Pipeline (per candidate):
 *   1. evaluate(): is discount > 45%?
 *   2. confirm(): does PriceSnapshot history corroborate this price band in the last 30d?
 *      - If at least one historical snapshot is within ±10% → CONFIRMED (real low).
 *      - Otherwise → ANOMALY (likely parse error / fiyat hatası — still alert but with separate tag).
 *   3. burstCheck(): in the last 5 minutes, count NoMissEvent rows (excl. BURST_SUPPRESSED).
 *      - If ≥5 → BURST_SUPPRESSED (catalog-wide error — admin alert, no broadcast).
 *   4. Otherwise → ALERTED (writes back NoMissEvent.alertedAt).
 *
 * Why no live re-fetch with a different IP/UA?
 *   - The task-worker already wrote the snapshot via the production scrape path
 *     (rate-limited, captcha-protected). A second fetch races a captcha gate and
 *     adds 5-10s latency to the alert. History-corroboration is statistically
 *     stronger: a flapping parse bug will match itself twice but won't anchor in 30d.
 *   - If we ever want a live recheck, this engine has the hook (NoMissEvent.confirmedPrice
 *     can be filled by a re-scrape worker before alertedAt is set).
 */

import { prisma } from '@repo/shared';

const NO_MISS_DISCOUNT_THRESHOLD = 45; // %
const HISTORY_LOOKBACK_DAYS = 30;
const HISTORY_PRICE_BAND_PCT = 10;     // ±%10 anchor band
const BURST_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BURST_THRESHOLD = 5;
const NO_MISS_TAG = '🚨 NO-MISS';
const NO_MISS_ANOMALY_TAG = '⚠️ NO-MISS (DOĞRULANMADI)';

export type NoMissStatus =
  | 'PENDING_CONFIRM'
  | 'CONFIRMED'
  | 'ANOMALY'
  | 'BURST_SUPPRESSED'
  | 'ALERTED';

export interface NoMissDecision {
  /** Should the caller bypass Baki/mute filters and broadcast immediately? */
  alert: boolean;
  /** Status (drives audit + UI). */
  status: NoMissStatus;
  /** UI tag prefix for the alert message. */
  tag: string;
  /** Discount % at the moment of evaluation. */
  discountPercent: number;
  /** NoMissEvent row id for downstream linking. */
  eventId: string | null;
  /** Human reason — used for skip-logs and admin DMs. */
  reason: string;
  /** Whether this triggered a burst lockdown (admin should investigate). */
  burst: boolean;
}

export interface NoMissInput {
  listingId: string;
  variantId: string;
  retailerSlug: string;
  newPrice: number;
  oldPrice: number | null;
}

/** True iff discount qualifies for NO-MISS evaluation. */
export function isNoMissCandidate(input: NoMissInput): boolean {
  if (input.oldPrice == null || input.oldPrice <= 0) return false;
  const discount = ((input.oldPrice - input.newPrice) / input.oldPrice) * 100;
  return discount > NO_MISS_DISCOUNT_THRESHOLD;
}

/**
 * Full evaluation. Always writes a NoMissEvent row (even when suppressed) so the
 * audit trail is complete. Returns the decision the caller should act on.
 */
export async function evaluateNoMiss(input: NoMissInput): Promise<NoMissDecision> {
  if (input.oldPrice == null || input.oldPrice <= 0) {
    return {
      alert: false, status: 'ANOMALY', tag: NO_MISS_ANOMALY_TAG,
      discountPercent: 0, eventId: null, reason: 'no-old-price', burst: false,
    };
  }
  const discountPercent = ((input.oldPrice - input.newPrice) / input.oldPrice) * 100;
  if (discountPercent <= NO_MISS_DISCOUNT_THRESHOLD) {
    return {
      alert: false, status: 'PENDING_CONFIRM', tag: '',
      discountPercent, eventId: null, reason: 'below-threshold', burst: false,
    };
  }

  // Step 1 — open the audit row in PENDING_CONFIRM.
  const event = await prisma.noMissEvent.create({
    data: {
      listingId: input.listingId,
      variantId: input.variantId,
      retailerSlug: input.retailerSlug,
      observedPrice: input.newPrice,
      discountPercent,
      status: 'PENDING_CONFIRM',
    },
  }).catch(err => {
    console.error('[no-miss] event create failed:', err instanceof Error ? err.message : err);
    return null;
  });
  const eventId = event?.id ?? null;

  // Step 2 — burst guard (cheap; do this BEFORE history scan).
  const burstSince = new Date(Date.now() - BURST_WINDOW_MS);
  const burstCount = await prisma.noMissEvent.count({
    where: {
      observedAt: { gte: burstSince },
      status: { in: ['ALERTED', 'CONFIRMED', 'ANOMALY'] },
    },
  });
  if (burstCount >= BURST_THRESHOLD) {
    if (eventId) {
      await prisma.noMissEvent.update({
        where: { id: eventId },
        data: {
          status: 'BURST_SUPPRESSED',
          reason: `burst: ${burstCount} alerts in ${BURST_WINDOW_MS / 60_000}m`,
        },
      }).catch(() => {});
    }
    console.warn(`[no-miss] 🛑 BURST SUPPRESSED — ${burstCount} NO-MISS events in last ${BURST_WINDOW_MS / 60_000}m. Likely catalog-wide parse error.`);
    return {
      alert: false, status: 'BURST_SUPPRESSED', tag: '',
      discountPercent, eventId, reason: `burst-${burstCount}`, burst: true,
    };
  }

  // Step 3 — historical anchor: at least 1 snapshot within ±10% in last 30d?
  const lookback = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const lo = input.newPrice * (1 - HISTORY_PRICE_BAND_PCT / 100);
  const hi = input.newPrice * (1 + HISTORY_PRICE_BAND_PCT / 100);

  const anchor = await prisma.priceSnapshot.findFirst({
    where: {
      listing: { variantId: input.variantId },
      observedAt: { gte: lookback },
      observedPrice: { gte: lo, lte: hi },
    },
    select: { id: true, observedPrice: true, observedAt: true },
  });

  const status: NoMissStatus = anchor ? 'CONFIRMED' : 'ANOMALY';
  const tag = anchor ? NO_MISS_TAG : NO_MISS_ANOMALY_TAG;
  const reason = anchor
    ? `anchor @ ${Math.round(anchor.observedPrice)} TL on ${anchor.observedAt.toISOString().slice(0, 10)}`
    : `no anchor in last ${HISTORY_LOOKBACK_DAYS}d within ±${HISTORY_PRICE_BAND_PCT}% of ${Math.round(input.newPrice)} TL`;

  if (eventId) {
    await prisma.noMissEvent.update({
      where: { id: eventId },
      data: {
        status,
        reason,
        confirmedPrice: anchor?.observedPrice ?? null,
        confirmedAt: new Date(),
      },
    }).catch(() => {});
  }

  return {
    alert: true,            // both CONFIRMED and ANOMALY broadcast — only the tag differs.
    status,
    tag,
    discountPercent,
    eventId,
    reason,
    burst: false,
  };
}

/** Mark a NoMissEvent as ALERTED once the broadcast actually went out. */
export async function markNoMissAlerted(eventId: string): Promise<void> {
  await prisma.noMissEvent.update({
    where: { id: eventId },
    data: { status: 'ALERTED', alertedAt: new Date() },
  }).catch(() => {});
}

/** Last-24h roll-up for the daily ops summary. */
export async function getNoMissDailyStats(since: Date): Promise<{
  total: number;
  confirmed: number;
  anomaly: number;
  burstSuppressed: number;
  alerted: number;
}> {
  const rows = await prisma.noMissEvent.groupBy({
    by: ['status'],
    where: { observedAt: { gte: since } },
    _count: true,
  });
  const find = (s: string) => rows.find(r => r.status === s)?._count ?? 0;
  return {
    total: rows.reduce((s, r) => s + r._count, 0),
    confirmed: find('CONFIRMED'),
    anomaly: find('ANOMALY'),
    burstSuppressed: find('BURST_SUPPRESSED'),
    alerted: find('ALERTED'),
  };
}
