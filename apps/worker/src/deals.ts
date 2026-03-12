import { prisma } from '@repo/shared';
import type { DetectedDeal } from '@repo/shared';
import { DEAL_THRESHOLDS } from '@repo/shared';
import { computePriceIntelligence, detectSuspiciousDiscount } from './price-intelligence';

// ═══════════════════════════════════════════════════════════════════
//  GLOBAL MARKET-AWARE ARBITRAGE & DEAL ENGINE
//
//  Replaces single-store, single-variant detection with a
//  multi-provider, color-agnostic arbitrage system.
//
//  Key concept: "Global Floor" = min price across ALL in-stock
//  colors at ALL providers for the same model+storage.
// ═══════════════════════════════════════════════════════════════════

interface ListingContext {
  listingId: string;
  variantId: string;
  retailerId: string;
  currentPrice: number;
  previousPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  retailerSlug: string;
}

// ─── Global Market Snapshot (fetched once per deal check) ────────
export interface GlobalMarketSnapshot {
  globalFloor: number;                         // min(all_in_stock_colors_all_providers)
  globalFloorRetailer: string;                 // which retailer has the floor
  globalFloorColor: string;                    // which color
  localSiblings: SiblingPrice[];               // other colors at SAME retailer
  globalCompetitors: CompetitorPrice[];        // prices at OTHER retailers (all colors)
  allInStockPrices: MarketPrice[];             // every in-stock price in the group
  groupAllTimeLow: number | null;              // ATL for this global group
  marketAverage: number;                       // average of all in-stock prices
  isMarketCorrection: boolean;                 // >40% providers dropped in 12h
  activeProviderCount: number;
  activeListingCount: number;
}

export interface SiblingPrice {
  variantId: string;
  color: string;
  price: number;
  listingId: string;
}

export interface CompetitorPrice {
  retailerSlug: string;
  retailerName: string;
  color: string;
  price: number;
  variantId: string;
  listingId: string;
}

export interface MarketPrice {
  price: number;
  retailerSlug: string;
  retailerName: string;
  color: string;
  variantId: string;
  listingId: string;
}

// ─── Arbitrage Result ────────────────────────────────────────────
export type ArbitrageVerdict = 'ELITE_DEAL' | 'GOOD_DEAL' | 'DISCARD';

export interface ArbitrageResult {
  verdict: ArbitrageVerdict;
  score: number;                               // 0-100 multi-factor
  globalFloor: number;
  globalFloorRetailer: string;
  globalFloorColor: string;
  savingsVsFloor: number;                      // how much cheaper vs floor (negative = more expensive)
  savingsVsNextSibling: number | null;         // savings vs next cheapest color at same store
  distanceFromATL: number | null;              // % distance from group ATL
  isMarketLeader: boolean;                     // is this THE cheapest in the entire market?
  isMarketCorrection: boolean;
  market: GlobalMarketSnapshot;
  reasons: string[];
}

// ─── Score weights ───────────────────────────────────────────────
const WEIGHT_MARKET_POSITION = 0.35;
const WEIGHT_SIBLING_ARBITRAGE = 0.35;
const WEIGHT_HISTORICAL = 0.30;

// ─── Tolerance ───────────────────────────────────────────────────
const GLOBAL_FLOOR_TOLERANCE = 1.02;  // 2% tolerance for discard
const NOISE_THRESHOLD = 0.01;         // 1% noise range

/**
 * Fetch the ENTIRE market state for this variant's global group
 * (same model + storage, all colors, all in-stock retailers) in optimized queries.
 */
export async function fetchGlobalMarketSnapshot(
  variantId: string,
): Promise<GlobalMarketSnapshot | null> {
  // Get variant's family + storage to find all siblings
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { familyId: true, storageGb: true, globalGroupId: true, family: { select: { name: true, brand: true } } },
  });
  if (!variant) return null;

  // ── Single optimized query: all in-stock listings for this global group ──
  const allListings = await prisma.listing.findMany({
    where: {
      variant: {
        familyId: variant.familyId,
        storageGb: variant.storageGb,
        isActive: true,
      },
      isActive: true,
      currentPrice: { not: null, gt: 0 },
      stockStatus: { in: ['IN_STOCK', 'LIMITED'] },  // OUT_OF_STOCK excluded from floor
    },
    include: {
      retailer: { select: { slug: true, name: true } },
      variant: { select: { id: true, color: true } },
    },
    orderBy: { currentPrice: 'asc' },
  });

  if (allListings.length === 0) return null;

  const allPrices: MarketPrice[] = allListings.map(l => ({
    price: l.currentPrice!,
    retailerSlug: l.retailer.slug,
    retailerName: l.retailer.name,
    color: l.variant.color,
    variantId: l.variant.id,
    listingId: l.id,
  }));

  const cheapest = allPrices[0];
  const globalFloor = cheapest.price;

  // Separate local siblings (same retailer, different color) from global competitors
  const thisListing = allListings.find(l => l.variantId === variantId);
  const thisRetailerSlug = thisListing?.retailer.slug;

  const localSiblings: SiblingPrice[] = allPrices
    .filter(p => p.retailerSlug === thisRetailerSlug && p.variantId !== variantId)
    .map(p => ({ variantId: p.variantId, color: p.color, price: p.price, listingId: p.listingId }));

  const globalCompetitors: CompetitorPrice[] = allPrices
    .filter(p => p.retailerSlug !== thisRetailerSlug)
    .map(p => ({
      retailerSlug: p.retailerSlug,
      retailerName: p.retailerName,
      color: p.color,
      price: p.price,
      variantId: p.variantId,
      listingId: p.listingId,
    }));

  // Historical ATL for this global group
  const variantIds = [...new Set(allListings.map(l => l.variantId))];
  const groupListingIds = allListings.map(l => l.id);

  // Also get listing IDs for ALL variants in this group (including out-of-stock) for historical data
  const allGroupListings = await prisma.listing.findMany({
    where: { variant: { familyId: variant.familyId, storageGb: variant.storageGb } },
    select: { id: true },
  });
  const allGroupListingIds = allGroupListings.map(l => l.id);

  const historicalAgg = allGroupListingIds.length > 0
    ? await prisma.priceSnapshot.aggregate({
        where: { listingId: { in: allGroupListingIds } },
        _min: { observedPrice: true },
      })
    : { _min: { observedPrice: null } };

  // Market average
  const prices = allPrices.map(p => p.price);
  const marketAverage = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Unique retailer slugs with data
  const uniqueRetailers = new Set(allPrices.map(p => p.retailerSlug));

  // ── Market Drift Detection: >40% of providers dropped in last 12h ──
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  let isMarketCorrection = false;

  if (allGroupListingIds.length > 0) {
    const recentDrops = await prisma.priceSnapshot.findMany({
      where: {
        listingId: { in: allGroupListingIds },
        observedAt: { gte: twelveHoursAgo },
        changePercent: { lt: -1 },  // meaningful drops only
      },
      select: { listingId: true },
      distinct: ['listingId'],
    });

    const droppedProviders = new Set<string>();
    for (const snap of recentDrops) {
      const listing = allListings.find(l => l.id === snap.listingId);
      if (listing) droppedProviders.add(listing.retailer.slug);
    }

    if (uniqueRetailers.size > 0 && droppedProviders.size / uniqueRetailers.size > 0.4) {
      isMarketCorrection = true;
    }
  }

  return {
    globalFloor,
    globalFloorRetailer: cheapest.retailerSlug,
    globalFloorColor: cheapest.color,
    localSiblings,
    globalCompetitors,
    allInStockPrices: allPrices,
    groupAllTimeLow: historicalAgg._min.observedPrice,
    marketAverage,
    isMarketCorrection,
    activeProviderCount: uniqueRetailers.size,
    activeListingCount: allPrices.length,
  };
}

/**
 * CORE ARBITRAGE ALGORITHM
 *
 * Given a price drop for Variant A at Retailer X:
 * 1. Local Sibling Check (other colors at same store)
 * 2. Global Market Check (all colors at all stores)
 * 3. Compute Global Floor, apply 2% tolerance
 * 4. Multi-factor score (Market Position 35%, Sibling 35%, Historical 30%)
 */
export function computeArbitrage(
  currentPrice: number,
  retailerSlug: string,
  market: GlobalMarketSnapshot,
): ArbitrageResult {
  const reasons: string[] = [];

  const { globalFloor, globalFloorRetailer, globalFloorColor, marketAverage, groupAllTimeLow } = market;

  // ── Is this the global market leader? ──
  const isMarketLeader = currentPrice <= globalFloor;

  // ── Savings vs global floor (negative means more expensive) ──
  const savingsVsFloor = globalFloor - currentPrice;

  // ── Savings vs next cheapest sibling at same store ──
  let savingsVsNextSibling: number | null = null;
  if (market.localSiblings.length > 0) {
    const cheapestSibling = market.localSiblings[0].price; // already sorted by price
    savingsVsNextSibling = cheapestSibling - currentPrice;
  }

  // ── Distance from group ATL ──
  let distanceFromATL: number | null = null;
  if (groupAllTimeLow != null && groupAllTimeLow > 0) {
    distanceFromATL = ((currentPrice - groupAllTimeLow) / groupAllTimeLow) * 100;
  }

  // ═══ ARBITRAGE FILTER ═══
  let verdict: ArbitrageVerdict;

  if (currentPrice > globalFloor * GLOBAL_FLOOR_TOLERANCE) {
    // Price is >2% above the cheapest option in the market → DISCARD
    verdict = 'DISCARD';
    reasons.push(`Piyasadaki en ucuz seçenek ${globalFloor.toLocaleString('tr-TR')} TL (${globalFloorRetailer}, ${globalFloorColor}) — bu fiyat %${(((currentPrice - globalFloor) / globalFloor) * 100).toFixed(1)} daha pahalı`);
  } else if (isMarketLeader) {
    verdict = 'ELITE_DEAL';
    reasons.push('Tüm piyasadaki en ucuz seçenek!');
  } else {
    verdict = 'GOOD_DEAL';
    reasons.push(`Global tabana %${(((currentPrice - globalFloor) / globalFloor) * 100).toFixed(1)} yakın`);
  }

  // ═══ MULTI-FACTOR SCORE (0-100) ═══
  let marketPositionScore = 0;   // 0-100, weight 35%
  let siblingArbitrageScore = 0; // 0-100, weight 35%
  let historicalScore = 0;       // 0-100, weight 30%

  // ── Market Position (35%) ──
  // How does this price compare to all tracked shops?
  if (isMarketLeader) {
    marketPositionScore = 100;
    reasons.push('PİYASADAKİ EN UCUZ SEÇENEK');
  } else if (currentPrice <= globalFloor * 1.01) {
    // Within 1% of floor
    marketPositionScore = 85;
    reasons.push('Piyasa tabanına çok yakın');
  } else if (currentPrice <= globalFloor * GLOBAL_FLOOR_TOLERANCE) {
    // Within 2% tolerance
    const gap = ((currentPrice - globalFloor) / globalFloor) * 100;
    marketPositionScore = Math.max(0, 70 - Math.round(gap * 15));
  } else {
    // Above tolerance — penalize heavily
    const excess = ((currentPrice - globalFloor) / globalFloor) * 100;
    marketPositionScore = Math.max(0, 30 - Math.round(excess * 5));
  }

  // Bonus: below market average
  if (currentPrice < marketAverage * 0.95) {
    const pctBelow = ((marketAverage - currentPrice) / marketAverage) * 100;
    marketPositionScore = Math.min(100, marketPositionScore + Math.round(pctBelow));
    reasons.push(`Piyasa ortalamasının %${pctBelow.toFixed(1)} altında`);
  }

  // ── Sibling Arbitrage (35%) ──
  // How much cheaper is this compared to the next cheapest color at the same store?
  if (market.localSiblings.length > 0) {
    const cheapestSiblingPrice = market.localSiblings[0].price;
    if (currentPrice < cheapestSiblingPrice) {
      const siblingGap = ((cheapestSiblingPrice - currentPrice) / cheapestSiblingPrice) * 100;
      siblingArbitrageScore = Math.min(100, Math.round(siblingGap * 10));
      reasons.push(`Aynı mağazadaki diğer renklere göre %${siblingGap.toFixed(1)} daha ucuz (+${Math.round(cheapestSiblingPrice - currentPrice)} TL fark)`);
    } else if (currentPrice === cheapestSiblingPrice) {
      siblingArbitrageScore = 50;
    } else {
      // More expensive than a sibling → penalty
      const overPct = ((currentPrice - cheapestSiblingPrice) / cheapestSiblingPrice) * 100;
      siblingArbitrageScore = Math.max(0, 40 - Math.round(overPct * 5));
    }
  } else {
    // No siblings at same store → neutral (use global competitor data)
    if (market.globalCompetitors.length > 0) {
      const cheapestCompetitor = Math.min(...market.globalCompetitors.map(c => c.price));
      if (currentPrice <= cheapestCompetitor) {
        siblingArbitrageScore = 80;
        reasons.push('Tüm rakip mağazalardan daha ucuz');
      } else {
        const gap = ((currentPrice - cheapestCompetitor) / cheapestCompetitor) * 100;
        siblingArbitrageScore = Math.max(0, 60 - Math.round(gap * 5));
      }
    } else {
      siblingArbitrageScore = 50; // sole listing → neutral
    }
  }

  // ── Historical Context (30%) ──
  // Distance from the group ATL
  if (distanceFromATL != null) {
    if (distanceFromATL <= 0) {
      // At or below ATL → maximum score
      historicalScore = 100;
      reasons.push('Global grup için tüm zamanların en düşük fiyatı!');
    } else if (distanceFromATL <= 2) {
      historicalScore = 90;
      reasons.push(`ATL'ye %${distanceFromATL.toFixed(1)} yakın`);
    } else if (distanceFromATL <= 5) {
      historicalScore = 70;
      reasons.push(`ATL'nin %${distanceFromATL.toFixed(1)} üstünde`);
    } else if (distanceFromATL <= 10) {
      historicalScore = 50;
    } else if (distanceFromATL <= 20) {
      historicalScore = 30;
    } else {
      historicalScore = Math.max(0, 20 - Math.round((distanceFromATL - 20) / 2));
    }
  } else {
    historicalScore = 50; // no historical data → neutral
  }

  // ── Weighted final score ──
  const rawScore = Math.round(
    marketPositionScore * WEIGHT_MARKET_POSITION +
    siblingArbitrageScore * WEIGHT_SIBLING_ARBITRAGE +
    historicalScore * WEIGHT_HISTORICAL
  );

  // Market correction penalty: reduce priority
  let score = rawScore;
  if (market.isMarketCorrection) {
    score = Math.round(score * 0.7);
    reasons.push('⚠️ Piyasa genelinde düzeltme tespit edildi — düşük öncelik');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    verdict,
    score,
    globalFloor,
    globalFloorRetailer,
    globalFloorColor,
    savingsVsFloor,
    savingsVsNextSibling,
    distanceFromATL,
    isMarketLeader,
    isMarketCorrection: market.isMarketCorrection,
    market,
    reasons,
  };
}

/**
 * Full deal analysis using the Global Arbitrage Engine.
 * Creates DealEvent records for meaningful events.
 * Returns the best detected deal (highest score) or null if discarded.
 */
export async function detectDeal(ctx: ListingContext): Promise<DetectedDeal | null> {
  // Get full price intelligence from history
  const intel = await computePriceIntelligence(ctx.listingId, ctx.currentPrice, ctx.previousPrice);

  // Check for suspicious discount
  const suspicious = await detectSuspiciousDiscount(ctx.listingId, ctx.currentPrice, ctx.previousPrice);

  // Flag suspicious discounts
  if (suspicious.isSuspicious) {
    await createDealEvent(ctx, 'SUSPICIOUS_DISCOUNT', ctx.previousPrice, 'spike_analysis', 'info', false, false, suspicious);
  }

  // ── Noise filter: ignore <1% fluctuations from current group leader ──
  if (ctx.previousPrice && ctx.currentPrice > 0) {
    const changePct = Math.abs((ctx.currentPrice - ctx.previousPrice) / ctx.previousPrice);
    if (changePct < NOISE_THRESHOLD) {
      return null;
    }
  }

  // ── Fetch global market state in a single optimized query ──
  const market = await fetchGlobalMarketSnapshot(ctx.variantId);
  if (!market) {
    // Fallback: no market data, use basic detection
    return fallbackBasicDetection(ctx, intel, suspicious);
  }

  // ── Run arbitrage algorithm ──
  const arb = computeArbitrage(ctx.currentPrice, ctx.retailerSlug, market);

  // ── DISCARD: a cheaper option exists elsewhere ──
  if (arb.verdict === 'DISCARD') {
    console.log(`[deals-arb] DISCARD: ${ctx.currentPrice} TL > global floor ${arb.globalFloor} TL × ${GLOBAL_FLOOR_TOLERANCE} (${arb.globalFloorRetailer}/${arb.globalFloorColor})`);
    return null;
  }

  // ── Record market correction event if detected ──
  if (arb.isMarketCorrection) {
    await recordMarketCorrectionEvent(ctx.variantId, market);
  }

  // ── Create DealEvent record ──
  const severity = arb.score >= 80 ? 'significant' : arb.score >= 60 ? 'notable' : 'info';
  const eventType = arb.isMarketLeader ? 'CROSS_RETAILER_LOW'
    : intel.isNewAllTimeLow ? 'ALL_TIME_LOW'
    : arb.distanceFromATL != null && arb.distanceFromATL <= 0 ? 'ALL_TIME_LOW'
    : 'PRICE_DROP';

  await createDealEvent(
    ctx, eventType, arb.globalFloor,
    'global_arbitrage', severity,
    arb.distanceFromATL != null && arb.distanceFromATL <= 0,
    ctx.currentPrice < market.marketAverage,
    suspicious,
  );

  // Build the deal type label
  const dealType = arb.isMarketLeader ? 'CROSS_RETAILER_LOW' as const
    : arb.distanceFromATL != null && arb.distanceFromATL <= 0 ? 'ALL_TIME_LOW' as const
    : 'PRICE_DROP' as const;

  return {
    listingId: ctx.listingId,
    dealType,
    score: arb.score,
    reason: arb.reasons.slice(0, 3).join(' | '),
    currentPrice: ctx.currentPrice,
    referencePrice: arb.globalFloor,
    dropPercent: arb.globalFloor > 0 ? ((arb.globalFloor - ctx.currentPrice) / arb.globalFloor) * 100 : 0,
  };
}

/**
 * Fallback for single-listing variants with no market data.
 */
async function fallbackBasicDetection(
  ctx: ListingContext,
  intel: Awaited<ReturnType<typeof computePriceIntelligence>>,
  suspicious: { isSuspicious: boolean; reason: string | null },
): Promise<DetectedDeal | null> {
  const candidates: DetectedDeal[] = [];

  if (intel.isNewAllTimeLow && intel.historicalHighest) {
    const drop = ((intel.historicalHighest - ctx.currentPrice) / intel.historicalHighest) * 100;
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'ALL_TIME_LOW',
      score: Math.min(100, 65 + Math.round(drop / 2)),
      reason: 'Tüm zamanların en düşük fiyatı',
      currentPrice: ctx.currentPrice,
      referencePrice: intel.historicalLowest ?? ctx.currentPrice,
      dropPercent: drop,
    });
    await createDealEvent(ctx, 'ALL_TIME_LOW', intel.historicalLowest, '30d_avg', 'significant', true, intel.isBelowHistoricalAverage, suspicious);
  }

  if (ctx.previousPrice && ctx.currentPrice < ctx.previousPrice) {
    const drop = ((ctx.previousPrice - ctx.currentPrice) / ctx.previousPrice) * 100;
    if (drop >= DEAL_THRESHOLDS.MINOR_DROP_PERCENT) {
      const severity = drop >= DEAL_THRESHOLDS.SIGNIFICANT_DROP_PERCENT ? 'significant'
        : drop >= DEAL_THRESHOLDS.NOTABLE_DROP_PERCENT ? 'notable' : 'info';
      candidates.push({
        listingId: ctx.listingId,
        dealType: 'PRICE_DROP',
        score: Math.min(100, Math.round(drop * 3)),
        reason: `Önceki fiyata göre %${drop.toFixed(1)} düşüş`,
        currentPrice: ctx.currentPrice,
        referencePrice: ctx.previousPrice,
        dropPercent: drop,
      });
      await createDealEvent(ctx, 'PRICE_DROP', ctx.previousPrice, 'previous_price', severity, intel.isNewAllTimeLow, intel.isBelowHistoricalAverage, suspicious);
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Record a market correction event (>40% of providers dropped in 12h).
 */
async function recordMarketCorrectionEvent(variantId: string, market: GlobalMarketSnapshot): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { globalGroupId: true },
  });
  if (!variant?.globalGroupId) return;

  // Dedup: only one per group per 12 hours
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const existing = await prisma.marketCorrectionEvent.findFirst({
    where: {
      globalGroupId: variant.globalGroupId,
      detectedAt: { gte: twelveHoursAgo },
    },
  });
  if (existing) return;

  await prisma.marketCorrectionEvent.create({
    data: {
      globalGroupId: variant.globalGroupId,
      totalProviders: market.activeProviderCount,
      windowHours: 12,
    },
  });
}

/**
 * Create a DealEvent record in the database.
 * Deduplicates: won't create a duplicate event for the same listing + eventType within 1 hour.
 */
async function createDealEvent(
  ctx: ListingContext,
  eventType: string,
  referencePrice: number | null | undefined,
  basis: string,
  severity: string,
  isNewAllTimeLow: boolean,
  isBelowAverage: boolean,
  suspicious: { isSuspicious: boolean; reason: string | null },
): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const existing = await prisma.dealEvent.findFirst({
    where: {
      listingId: ctx.listingId,
      eventType: eventType as never,
      detectedAt: { gte: oneHourAgo },
    },
  });
  if (existing) return;

  const dropAmount = referencePrice != null ? referencePrice - ctx.currentPrice : null;
  const dropPercent = referencePrice != null && referencePrice > 0
    ? ((referencePrice - ctx.currentPrice) / referencePrice) * 100
    : null;

  await prisma.dealEvent.create({
    data: {
      listingId: ctx.listingId,
      variantId: ctx.variantId,
      retailerId: ctx.retailerId,
      eventType: eventType as never,
      oldPrice: referencePrice ?? ctx.previousPrice,
      newPrice: ctx.currentPrice,
      dropAmount: dropAmount != null ? Math.round(dropAmount) : null,
      dropPercent: dropPercent != null ? Math.round(dropPercent * 10) / 10 : null,
      basis,
      severity,
      isNewAllTimeLow,
      isBelowAverage,
      isSuspiciousDiscount: suspicious.isSuspicious,
      suspiciousReason: suspicious.reason,
    },
  });
}

/**
 * Alert kurallarını kontrol eder ve eşleşenleri tetikler.
 */
export async function checkAlertRules(
  variantId: string,
  listingId: string,
  currentPrice: number,
  previousPrice: number | null,
  retailerSlug: string
): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { familyId: true },
  });

  const rules = await prisma.alertRule.findMany({
    where: {
      isActive: true,
      OR: [
        { variantId },
        { familyId: variant?.familyId ?? undefined },
        { variantId: null, familyId: null },
      ],
    },
  });

  for (const rule of rules) {
    if (rule.retailerSlug && rule.retailerSlug !== retailerSlug) continue;

    let shouldTrigger = false;
    let reason = '';
    let dropPercent: number | null = null;

    switch (rule.type) {
      case 'PRICE_DROP_PERCENT': {
        if (previousPrice && rule.threshold) {
          const drop = ((previousPrice - currentPrice) / previousPrice) * 100;
          if (drop >= rule.threshold) {
            shouldTrigger = true;
            reason = `Fiyat %${drop.toFixed(1)} düştü (eşik: %${rule.threshold})`;
            dropPercent = drop;
          }
        }
        break;
      }
      case 'PRICE_BELOW': {
        if (rule.threshold && currentPrice <= rule.threshold) {
          shouldTrigger = true;
          reason = `Fiyat ${currentPrice} TL — hedef ${rule.threshold} TL altında`;
        }
        break;
      }
      case 'NEW_LOWEST': {
        const listing = await prisma.listing.findUnique({
          where: { id: listingId },
          select: { lowestPrice: true },
        });
        if (listing?.lowestPrice && currentPrice <= listing.lowestPrice) {
          shouldTrigger = true;
          reason = `Yeni en düşük fiyat: ${currentPrice} TL`;
        }
        break;
      }
      case 'CROSS_RETAILER': {
        const others = await prisma.listing.findMany({
          where: {
            variantId,
            retailer: { slug: { not: retailerSlug } },
            currentPrice: { not: null },
            stockStatus: { in: ['IN_STOCK', 'LIMITED'] },
          },
          select: { currentPrice: true },
        });
        if (others.length > 0) {
          const minOther = Math.min(...others.map((o) => o.currentPrice!));
          if (currentPrice < minOther) {
            shouldTrigger = true;
            const diff = ((minOther - currentPrice) / minOther) * 100;
            reason = `En ucuz site! Diğerlerinden %${diff.toFixed(1)} daha ucuz`;
            dropPercent = diff;
          }
        }
        break;
      }
    }

    if (shouldTrigger) {
      await prisma.alertEvent.create({
        data: {
          alertRuleId: rule.id,
          listingId,
          alertType: rule.type,
          triggerReason: reason,
          oldPrice: previousPrice,
          newPrice: currentPrice,
          dropPercent,
        },
      });
    }
  }
}
