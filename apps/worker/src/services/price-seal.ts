/**
 * V5 — Price-Seal Engine.
 *
 * Anti-spam, zero-miss notification gate. Independent from scraper:
 *   • SCRAPER NEVER STOPS — mute only suppresses ALERTS, scraping continues.
 *   • Scope: per (variantId, retailerId) — i.e. per Listing row.
 *     Tek satıcının "Stok Yok" feedback'i diğer satıcıyı SUSTURMAZ.
 *   • TTL: 24h auto-thaw — ghostUntil ile farklı bir signal'dir.
 *     ghost = "scrape skip" değil, mute = "alert suppress".
 *
 * Flow:
 *   1. Community votes 3+ "Stok Yok / Hatalı" → applyMute(listingId, currentPrice)
 *      → Listing.mutedPrice/mutedAt set + MuteEvent row opened.
 *   2. Next scrape arrives in DealEngine:
 *      a) Same price as mutedPrice → SILENT (no notify, scrape persisted).
 *      b) Different price → clearMute("price-changed") + alert proceeds.
 *   3. 24h cron sweeps Listing.mutedAt < now-24h → clearMute("auto-thaw-24h").
 */

import { prisma } from '@repo/shared';

const MUTE_TTL_MS = 24 * 60 * 60 * 1000; // 24h auto-thaw
// Use a tolerant comparison so a 1 TL parser drift doesn't unmute spuriously.
// Most price changes that matter are ≥ %0.5; sub-1‰ wobble is parser noise.
const MUTE_PRICE_EPSILON_TL = 1;
const MUTE_PRICE_EPSILON_PCT = 0.001; // 0.1%

/** Compare two prices with parser-noise tolerance. */
function pricesMatch(a: number, b: number): boolean {
  const absDiff = Math.abs(a - b);
  if (absDiff <= MUTE_PRICE_EPSILON_TL) return true;
  const rel = b !== 0 ? absDiff / b : 1;
  return rel <= MUTE_PRICE_EPSILON_PCT;
}

export interface ApplyMuteInput {
  listingId: string;
  mutedPrice: number;
  source: 'community-vote' | 'admin' | 'auto';
  voteCount?: number;
}

/**
 * Mark a Listing as muted at a specific price.
 * Idempotent: if already muted at the same price, refreshes mutedAt only.
 * If muted at a different price, the old MuteEvent is closed
 * (unmuteReason='price-replaced') before opening the new one.
 */
export async function applyMute(input: ApplyMuteInput): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true, variantId: true, mutedPrice: true,
      retailer: { select: { slug: true } },
    },
  });
  if (!listing) return;

  const now = new Date();

  // Close any open MuteEvent if we're muting at a different price.
  if (listing.mutedPrice != null && !pricesMatch(listing.mutedPrice, input.mutedPrice)) {
    await closeOpenMuteEvent(input.listingId, 'price-replaced');
  }

  await prisma.listing.update({
    where: { id: input.listingId },
    data: {
      mutedPrice: input.mutedPrice,
      mutedAt: now,
      muteSource: input.source,
    },
  });

  // Don't open a duplicate MuteEvent if we already have an open one at this price.
  const existing = await prisma.muteEvent.findFirst({
    where: { listingId: input.listingId, unmutedAt: null },
    select: { id: true, mutedPrice: true },
  });
  if (existing && pricesMatch(existing.mutedPrice, input.mutedPrice)) {
    return; // Same mute already open — no-op.
  }

  await prisma.muteEvent.create({
    data: {
      listingId: input.listingId,
      variantId: listing.variantId,
      retailerSlug: listing.retailer.slug,
      mutedPrice: input.mutedPrice,
      mutedAt: now,
      source: input.source,
      voteCount: input.voteCount ?? null,
    },
  });
}

/**
 * Clear mute on a Listing and close the open MuteEvent.
 * unmuteReason is recorded so we can audit which mutes were thawed by which trigger.
 */
export async function clearMute(
  listingId: string,
  unmuteReason: 'auto-thaw-24h' | 'price-changed' | 'no-miss-override' | 'admin' | 'price-replaced',
): Promise<void> {
  await prisma.listing.update({
    where: { id: listingId },
    data: { mutedPrice: null, mutedAt: null, muteSource: null },
  }).catch(() => {});

  await closeOpenMuteEvent(listingId, unmuteReason);
}

async function closeOpenMuteEvent(
  listingId: string,
  reason: string,
): Promise<void> {
  await prisma.muteEvent.updateMany({
    where: { listingId, unmutedAt: null },
    data: { unmutedAt: new Date(), unmuteReason: reason },
  }).catch(() => {});
}

/**
 * Decision API for DealEngine: "Should I notify for this scrape?"
 * Returns { silent: true } if the new price matches the muted price.
 * Returns { silent: false, didThaw: true } if the new price differs (auto-clears mute).
 * Returns { silent: false } when nothing was muted to begin with.
 */
export async function shouldSilenceForMute(
  listingId: string,
  scrapedPrice: number,
): Promise<{ silent: boolean; didThaw: boolean; mutedPrice?: number }> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { mutedPrice: true, mutedAt: true },
  });
  if (!listing || listing.mutedPrice == null) {
    return { silent: false, didThaw: false };
  }

  // Belt-and-suspenders TTL check (cron handles the bulk; this guards races).
  if (listing.mutedAt && Date.now() - listing.mutedAt.getTime() > MUTE_TTL_MS) {
    await clearMute(listingId, 'auto-thaw-24h');
    return { silent: false, didThaw: true };
  }

  if (pricesMatch(listing.mutedPrice, scrapedPrice)) {
    return { silent: true, didThaw: false, mutedPrice: listing.mutedPrice };
  }

  // Price drifted from muted value → user's "stok yok" no longer applies.
  await clearMute(listingId, 'price-changed');
  return { silent: false, didThaw: true, mutedPrice: listing.mutedPrice };
}

/**
 * Cron: scan Listing.mutedAt index for stale mutes (>24h) and thaw them.
 * Hourly invocation is fine — 24h TTL is loose enough to tolerate drift.
 */
export async function runMuteAutoThaw(): Promise<{ thawed: number }> {
  const cutoff = new Date(Date.now() - MUTE_TTL_MS);
  const stale = await prisma.listing.findMany({
    where: { mutedAt: { lt: cutoff, not: null } },
    select: { id: true },
    take: 500, // safety cap
  });
  if (stale.length === 0) return { thawed: 0 };

  for (const row of stale) {
    await clearMute(row.id, 'auto-thaw-24h');
  }
  console.log(`[price-seal] 🔓 Auto-thawed ${stale.length} stale mute(s) (>24h)`);
  return { thawed: stale.length };
}

/**
 * Mute-rate sinyali — last `windowMs`'lik pencerede yeni mute oranı.
 * AIMD bridge bunu okuyup ani spike'lerde DEGRADED state'e geçer.
 */
export async function getRecentMuteRate(windowMs = 60 * 60 * 1000): Promise<{
  newMutes: number;
  totalListings: number;
  mutedListings: number;
  ratePerHour: number;
}> {
  const since = new Date(Date.now() - windowMs);
  const [newMutes, totalListings, mutedListings] = await Promise.all([
    prisma.muteEvent.count({ where: { mutedAt: { gte: since } } }),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.listing.count({ where: { mutedAt: { not: null } } }),
  ]);
  const ratePerHour = newMutes / Math.max(1, windowMs / (60 * 60 * 1000));
  return { newMutes, totalListings, mutedListings, ratePerHour };
}
