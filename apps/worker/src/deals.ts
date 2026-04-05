import { prisma } from '@repo/shared';
import type { DetectedDeal } from '@repo/shared';
import { DEAL_THRESHOLDS } from '@repo/shared';
import { computePriceIntelligence, detectSuspiciousDiscount } from './price-intelligence';
import { enqueueEmergencyScrape } from './task-queue';

// ═══════════════════════════════════════════════════════════════════
//  GLOBAL MARKET-AWARE ARBITRAGE & DEAL ENGINE
//
//  Replaces single-store, single-variant detection with a
//  multi-provider, color-agnostic arbitrage system.
//
//  Key concept: "Global Floor" = min price across ALL in-stock
//  colors at ALL providers for the same model+storage,
//  filtered by DATA FRESHNESS to avoid ghost prices.
// ═══════════════════════════════════════════════════════════════════

// ─── Freshness Tiers ─────────────────────────────────────────────
export type FreshnessTier = 'CANLI' | 'BELIRSIZ' | 'BAYAT';

const CANLI_MS  = 4  * 60 * 60 * 1000;  // 0-4h: Full weight
const BELIRSIZ_MS = 12 * 60 * 60 * 1000;  // 4-12h: Valid history, may trigger emergency scrape
// >12h = BAYAT: Ghost price — discard from arbitrage

export function classifyFreshness(lastSeenAt: Date | null): FreshnessTier {
  if (!lastSeenAt) return 'BAYAT';
  const age = Date.now() - lastSeenAt.getTime();
  if (age <= CANLI_MS) return 'CANLI';
  if (age <= BELIRSIZ_MS) return 'BELIRSIZ';
  return 'BAYAT';
}

/** Returns 0-1 weight for freshness (CANLI=1.0, BELIRSIZ=0.5, BAYAT=0.0) */
function freshnessWeight(tier: FreshnessTier): number {
  switch (tier) {
    case 'CANLI': return 1.0;
    case 'BELIRSIZ': return 0.5;
    case 'BAYAT': return 0.0;
  }
}

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
  globalFloor: number;                         // min(CANLI in_stock colors across all providers)
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
  freshListingCount: number;                   // CANLI listings used for floor calc
  staleBlockerListings: string[];              // BAYAT listing IDs that are below the new price (need emergency scrape)
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
  freshness: FreshnessTier;
  lastSeenAt: Date | null;
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
const WEIGHT_SIBLING_ARBITRAGE = 0.40;
const WEIGHT_HISTORICAL = 0.30;
const WEIGHT_FRESHNESS = 0.30;

// ─── Tolerance ───────────────────────────────────────────────────
const GLOBAL_FLOOR_TOLERANCE = 1.02;  // 2% tolerance for discard
const NOISE_THRESHOLD = 0.01;         // 1% noise range

/**
 * Minimum sane price for a phone listing (TL).
 * Anything below this is a scraping error, accessory price, or bait listing.
 * Excluded from market snapshot calculations to prevent poisoning the floor.
 */
const MIN_SANE_PHONE_PRICE_TL = 5000;

// ═══════════════════════════════════════════════════════════════════
//  GENERATIONAL BARRIER (BAKİ PROTOCOL)
//
//  Suppresses alerts when an older model's price is too close to
//  the next generation's cheapest price in the same product line.
//
//  Product lines (each compared within itself only):
//    base:     iPhone 13 → 14 → 15 → 16 → 17
//    pro:      iPhone 16 Pro → 17 Pro
//    pro-max:  iPhone 16 Pro Max → 17 Pro Max
//    air:      iPhone 17 Air (no cross-gen comparison)
//
//  Formula: ALLOW only if BOTH:
//    1) Price(N) <= AnchorPrice(N+1) × 0.90   (≥10% gap)
//    2) AnchorPrice(N+1) − Price(N) >= 4,000 TL
// ═══════════════════════════════════════════════════════════════════

interface ProductLineInfo {
  line: 'base' | 'air' | 'pro' | 'pro-max' | 'ultra' | 'plus' | 'fe' | 'a-mid';
  gen: number;
}

export function parseProductLine(familyName: string): ProductLineInfo | null {
  // iPhone: "iPhone 16 Pro Max", "iPhone 17 Air", etc.
  const iphoneMatch = familyName.match(/^iPhone\s+(\d+)\s*(Pro\s+Max|Pro|Air)?$/i);
  if (iphoneMatch) {
    const gen = parseInt(iphoneMatch[1], 10);
    const suffix = (iphoneMatch[2] ?? '').trim().toLowerCase();
    let line: ProductLineInfo['line'];
    if (suffix === 'pro max') line = 'pro-max';
    else if (suffix === 'pro') line = 'pro';
    else if (suffix === 'air') line = 'air';
    else line = 'base';
    return { line, gen };
  }

  // Samsung Galaxy S-series: "Galaxy S25 Ultra", "Galaxy S24 Ultra", etc.
  const samsungSMatch = familyName.match(/^Galaxy\s+S(\d+)\s*(Ultra|Plus|\+|FE)?$/i);
  if (samsungSMatch) {
    const gen = parseInt(samsungSMatch[1], 10);
    const suffix = (samsungSMatch[2] ?? '').trim().toLowerCase();
    let line: ProductLineInfo['line'];
    if (suffix === 'ultra') line = 'ultra';
    else if (suffix === 'plus' || suffix === '+') line = 'plus';
    else if (suffix === 'fe') line = 'fe';
    else line = 'base';
    return { line, gen };
  }

  // Samsung Galaxy A-series: "Galaxy A56", "Galaxy A36", etc.
  const samsungAMatch = familyName.match(/^Galaxy\s+A(\d+)$/i);
  if (samsungAMatch) {
    const gen = parseInt(samsungAMatch[1], 10);
    return { line: 'a-mid', gen };
  }

  return null;
}

export interface GenerationalContext {
  currentLine: ProductLineInfo;
  currentFamilyName: string;
  nextGenFamilyName: string | null;
  nextGenPrice: number | null;
  latestGenFamilyName: string | null;
  latestGenPrice: number | null;
  isLatestGen: boolean;
  barrierPassed: boolean;
  gapPercent: number | null;
  gapAmount: number | null;
  reason: string;
}

const GENERATIONAL_GAP_PERCENT = 0.10;
const GENERATIONAL_GAP_MIN_TL = 4000;

export async function checkGenerationalBarrier(
  variantId: string,
  currentPrice: number,
): Promise<GenerationalContext | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      storageGb: true,
      family: { select: { id: true, name: true, sortOrder: true, brand: true } },
    },
  });
  if (!variant) return null;

  const currentLineInfo = parseProductLine(variant.family.name);
  if (!currentLineInfo) return null;

  // Air serisi — nesil kıyaslaması yok
  if (currentLineInfo.line === 'air') {
    return {
      currentLine: currentLineInfo,
      currentFamilyName: variant.family.name,
      nextGenFamilyName: null, nextGenPrice: null,
      latestGenFamilyName: variant.family.name, latestGenPrice: null,
      isLatestGen: true, barrierPassed: true,
      gapPercent: null, gapAmount: null,
      reason: 'Air serisi — nesil kıyaslaması yok',
    };
  }

  // Aynı hattaki tüm aileleri bul
  const allFamilies = await prisma.productFamily.findMany({
    where: { brand: variant.family.brand, isActive: true },
    select: { id: true, name: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });

  const sameLine = allFamilies
    .map(f => ({ ...f, parsed: parseProductLine(f.name) }))
    .filter((f): f is typeof f & { parsed: ProductLineInfo } =>
      f.parsed != null && f.parsed.line === currentLineInfo.line)
    .sort((a, b) => b.parsed.gen - a.parsed.gen); // en yeni ilk

  if (sameLine.length === 0) return null;

  const latestGen = sameLine[0];
  const isLatestGen = latestGen.id === variant.family.id;

  // En yeni nesil — bariyer yok
  if (isLatestGen) {
    return {
      currentLine: currentLineInfo,
      currentFamilyName: variant.family.name,
      nextGenFamilyName: null, nextGenPrice: null,
      latestGenFamilyName: latestGen.name, latestGenPrice: null,
      isLatestGen: true, barrierPassed: true,
      gapPercent: null, gapAmount: null,
      reason: 'En yeni nesil — bariyer kontrolü gerekmiyor',
    };
  }

  // Bir üst nesli bul (aynı hat, bir adım yeni)
  const currentIdx = sameLine.findIndex(f => f.id === variant.family.id);
  const nextGenFamily = currentIdx > 0 ? sameLine[currentIdx - 1] : null;

  // Bir aile+depolama için en ucuz stokta fiyatı getir (BAYAT hariç)
  async function getCheapestPrice(familyId: string): Promise<number | null> {
    const cheapest = await prisma.listing.findFirst({
      where: {
        variant: { familyId, storageGb: variant!.storageGb, isActive: true },
        isActive: true,
        currentPrice: { not: null, gt: 0 },
        stockStatus: { in: ['IN_STOCK', 'LIMITED', 'UNKNOWN'] },
        lastSeenAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      },
      orderBy: { currentPrice: 'asc' },
      select: { currentPrice: true },
    });
    return cheapest?.currentPrice ?? null;
  }

  const nextGenId = nextGenFamily?.id ?? null;
  const [nextGenPrice, latestGenPrice] = await Promise.all([
    nextGenId ? getCheapestPrice(nextGenId) : Promise.resolve(null),
    latestGen.id !== nextGenId ? getCheapestPrice(latestGen.id) : Promise.resolve(null),
  ]);

  // Bariyer kontrolü için üst nesil fiyatı; yoksa en yeni nesil fiyatı
  const anchorPrice = nextGenPrice ?? latestGenPrice;
  const anchorFamilyName = nextGenPrice != null ? nextGenFamily!.name : latestGen.name;

  if (anchorPrice == null) {
    return {
      currentLine: currentLineInfo,
      currentFamilyName: variant.family.name,
      nextGenFamilyName: nextGenFamily?.name ?? null, nextGenPrice: null,
      latestGenFamilyName: latestGen.name, latestGenPrice: null,
      isLatestGen: false, barrierPassed: true,
      gapPercent: null, gapAmount: null,
      reason: 'Üst nesil fiyat verisi bulunamadı — bariyer devre dışı',
    };
  }

  // Baki Protocol
  const gapAmount = anchorPrice - currentPrice;
  const gapPercent = anchorPrice > 0 ? (gapAmount / anchorPrice) * 100 : 0;
  const passesPercentGate = currentPrice <= anchorPrice * (1 - GENERATIONAL_GAP_PERCENT);
  const passesCashGate = gapAmount >= GENERATIONAL_GAP_MIN_TL;
  const barrierPassed = passesPercentGate && passesCashGate;

  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

  const reason = barrierPassed
    ? `${variant.family.name} (${fmtPrice(currentPrice)} TL) → ${anchorFamilyName} (${fmtPrice(anchorPrice)} TL): ${fmtPrice(gapAmount)} TL fark (%${gapPercent.toFixed(1)}) ✓`
    : `DEĞER TUZAĞI: ${variant.family.name} (${fmtPrice(currentPrice)} TL) → ${anchorFamilyName} (${fmtPrice(anchorPrice)} TL): sadece ${fmtPrice(gapAmount)} TL fark (%${gapPercent.toFixed(1)})`;

  const resolvedLatestGenPrice = latestGen.id === nextGenId ? nextGenPrice : latestGenPrice;

  return {
    currentLine: currentLineInfo,
    currentFamilyName: variant.family.name,
    nextGenFamilyName: nextGenFamily?.name ?? null,
    nextGenPrice,
    latestGenFamilyName: latestGen.name,
    latestGenPrice: resolvedLatestGenPrice,
    isLatestGen: false,
    barrierPassed,
    gapPercent,
    gapAmount,
    reason,
  };
}

// ─── Cycle-scoped market snapshot cache (saves ~4 DB calls per duplicate variant group) ──
const marketSnapshotCache = new Map<string, { data: GlobalMarketSnapshot | null; ts: number }>();
const MARKET_CACHE_TTL_MS = 60_000; // 60s — covers one cycle

/** Clear the market snapshot cache (call at cycle start) */
export function clearMarketSnapshotCache(): void {
  marketSnapshotCache.clear();
}

/**
 * Fetch the ENTIRE market state for this variant's global group
 * (same model + storage, all colors, all in-stock retailers) in optimized queries.
 * Uses cycle-scoped in-memory cache to avoid redundant queries for same variant group.
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

  // Cache key = familyId + storageGb (all colors in same group share this)
  const cacheKey = `${variant.familyId}:${variant.storageGb}`;
  const cached = marketSnapshotCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < MARKET_CACHE_TTL_MS) {
    return cached.data;
  }

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
      stockStatus: { in: ['IN_STOCK', 'LIMITED', 'UNKNOWN'] },  // UNKNOWN = not yet scraped, include it
    },
    select: {
      id: true,
      variantId: true,
      currentPrice: true,
      lastSeenAt: true,
      retailer: { select: { slug: true, name: true } },
      variant: { select: { id: true, color: true } },
    },
    orderBy: { currentPrice: 'asc' },
  });

  if (allListings.length === 0) return null;

  const allPrices: MarketPrice[] = allListings
    .filter(l => l.currentPrice! >= MIN_SANE_PHONE_PRICE_TL) // Exclude garbage scrape prices
    .map(l => ({
    price: l.currentPrice!,
    retailerSlug: l.retailer.slug,
    retailerName: l.retailer.name,
    color: l.variant.color,
    variantId: l.variant.id,
    listingId: l.id,
    freshness: classifyFreshness(l.lastSeenAt),
    lastSeenAt: l.lastSeenAt,
  }));

  if (allPrices.length === 0) return null;

  // ── Freshness-aware global floor: use ONLY CANLI data ──
  // BELİRSİZ prices are kept for context but don't set the floor.
  // BAYAT prices are ghost data — fully excluded.
  const freshPrices = allPrices.filter(p => p.freshness === 'CANLI');
  const uncertainPrices = allPrices.filter(p => p.freshness === 'BELIRSIZ');
  const validPrices = [...freshPrices, ...uncertainPrices]; // for context, not floor
  
  // Floor is calculated from CANLI only; fallback to BELIRSIZ if no CANLI data
  const floorCandidates = freshPrices.length > 0 ? freshPrices : uncertainPrices;
  
  if (floorCandidates.length === 0) {
    // Everyone is stale — can't compute meaningful arbitrage
    return null;
  }

  const cheapest = floorCandidates.reduce((min, p) => p.price < min.price ? p : min, floorCandidates[0]);
  const globalFloor = cheapest.price;

  // Separate local siblings (same retailer, different color) from global competitors
  // Use non-BAYAT data for siblings/competitors (CANLI + BELIRSIZ)
  const thisListing = allListings.find(l => l.variantId === variantId);
  const thisRetailerSlug = thisListing?.retailer.slug;

  const localSiblings: SiblingPrice[] = validPrices
    .filter(p => p.retailerSlug === thisRetailerSlug && p.variantId !== variantId)
    .map(p => ({ variantId: p.variantId, color: p.color, price: p.price, listingId: p.listingId }));

  const globalCompetitors: CompetitorPrice[] = validPrices
    .filter(p => p.retailerSlug !== thisRetailerSlug)
    .map(p => ({
      retailerSlug: p.retailerSlug,
      retailerName: p.retailerName,
      color: p.color,
      price: p.price,
      variantId: p.variantId,
      listingId: p.listingId,
    }));

  // Stale blockers: BAYAT listings whose price would be lower than fresh floor
  // These need emergency re-scrape to verify if they're still valid
  const staleBlockerListings = allPrices
    .filter(p => p.freshness === 'BAYAT' && p.price <= globalFloor)
    .map(p => p.listingId);

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

  const result: GlobalMarketSnapshot = {
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
    freshListingCount: freshPrices.length,
    staleBlockerListings,
  };

  // Cache for subsequent calls with same variant group
  marketSnapshotCache.set(cacheKey, { data: result, ts: Date.now() });

  return result;
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
  // Sibling Arbitrage 40%, Historical 30%, Freshness 30%
  let siblingArbitrageScore = 0; // 0-100, weight 40%
  let historicalScore = 0;       // 0-100, weight 30%
  let freshnessScore = 0;        // 0-100, weight 30%

  // ── Sibling Arbitrage (40%) ──
  // Combines market position + sibling/competitor analysis
  // Market leader bonus baked into sibling score
  if (isMarketLeader) {
    siblingArbitrageScore = 100;
    reasons.push('PİYASADAKİ EN UCUZ SEÇENEK');
  } else if (market.localSiblings.length > 0) {
    const cheapestSiblingPrice = market.localSiblings[0].price;
    if (currentPrice < cheapestSiblingPrice) {
      const siblingGap = ((cheapestSiblingPrice - currentPrice) / cheapestSiblingPrice) * 100;
      siblingArbitrageScore = Math.min(95, Math.round(siblingGap * 10));
      reasons.push(`Aynı mağazadaki diğer renklere göre %${siblingGap.toFixed(1)} daha ucuz (+${Math.round(cheapestSiblingPrice - currentPrice)} TL fark)`);
    } else if (currentPrice === cheapestSiblingPrice) {
      siblingArbitrageScore = 50;
    } else {
      const overPct = ((currentPrice - cheapestSiblingPrice) / cheapestSiblingPrice) * 100;
      siblingArbitrageScore = Math.max(0, 40 - Math.round(overPct * 5));
    }
  } else {
    // No siblings at same store → use global competitor data
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

  // Below-market-average bonus (folded from old market position)
  if (currentPrice < marketAverage * 0.95) {
    const pctBelow = ((marketAverage - currentPrice) / marketAverage) * 100;
    siblingArbitrageScore = Math.min(100, siblingArbitrageScore + Math.round(pctBelow * 0.5));
    reasons.push(`Piyasa ortalamasının %${pctBelow.toFixed(1)} altında`);
  }

  // ── Historical Context (30%) ──
  // Distance from the group ATL
  if (distanceFromATL != null) {
    if (distanceFromATL <= 0) {
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
    } else if (distanceFromATL <= 30) {
      historicalScore = 15;
    } else {
      historicalScore = 0; // Çok uzaksa (30%+) tarihsel puan sıfır
      reasons.push(`⚠️ Tarihsel dipten çok uzak (%${distanceFromATL.toFixed(1)} yukarıda)`);
    }
  } else {
    historicalScore = 50; // no historical data → neutral
  }

  // ── Freshness Penalty (30%) ──
  // How much of the market data is actually fresh?
  // High ratio of fresh data = high confidence = high score
  const totalListings = market.activeListingCount;
  const freshCount = market.freshListingCount;
  if (totalListings > 0) {
    const freshRatio = freshCount / totalListings;
    freshnessScore = Math.round(freshRatio * 100);
    if (freshRatio < 0.5) {
      reasons.push(`⚠️ Piyasa verilerinin sadece %${Math.round(freshRatio * 100)}'i güncel`);
    }
  } else {
    freshnessScore = 0; // no data at all
  }

  // Stale blockers penalty: if BAYAT listings might undercut the fresh floor
  if (market.staleBlockerListings.length > 0) {
    const penalty = Math.min(30, market.staleBlockerListings.length * 10);
    freshnessScore = Math.max(0, freshnessScore - penalty);
    reasons.push(`${market.staleBlockerListings.length} eski fiyat doğrulama bekliyor`);
  }

  // ── Weighted final score ──
  const rawScore = Math.round(
    siblingArbitrageScore * WEIGHT_SIBLING_ARBITRAGE +
    historicalScore * WEIGHT_HISTORICAL +
    freshnessScore * WEIGHT_FRESHNESS
  );

  // Market correction penalty: reduce priority
  let score = rawScore;
  if (market.isMarketCorrection) {
    score = Math.round(score * 0.7);
    reasons.push('⚠️ Piyasa genelinde düzeltme tespit edildi — düşük öncelik');
  }

  score = Math.max(0, Math.min(100, score));

  // ── Absolute Disqualification: Way too far from ATL ──
  // Even if it's a market leader, if it's >10% above its own historical low,
  // the market is extremely inflated. Discard it entirely to prevent spam.
  if (distanceFromATL != null && distanceFromATL > 10) {
    if (score >= 80) { // If it would have passed otherwise
      verdict = 'DISCARD';
      reasons.push(`❌ Piyasa lideri olmasına rağmen ATL'den çok uzak (%${distanceFromATL.toFixed(1)}). Pazar şişkin.`);
      score = 0;
    }
  }

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

  // ── Emergency scrape: verify stale data that might block this deal ──
  if (market.staleBlockerListings.length > 0) {
    enqueueEmergencyScrape(market.staleBlockerListings).catch(err =>
      console.error('[deals-arb] Emergency scrape enqueue failed:', err)
    );
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

// ─── Alert rules cache (loaded once per cycle, saves ~2 DB calls per task) ──
let alertRulesCache: Awaited<ReturnType<typeof prisma.alertRule.findMany>> | null = null;
let alertRulesCacheTime = 0;
const ALERT_RULES_CACHE_TTL_MS = 120_000; // 2 min — covers one cycle

/** Clear alert rules cache (call at cycle start) */
export function clearAlertRulesCache(): void {
  alertRulesCache = null;
  alertRulesCacheTime = 0;
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

  // Use cached rules if available
  if (!alertRulesCache || (Date.now() - alertRulesCacheTime) > ALERT_RULES_CACHE_TTL_MS) {
    alertRulesCache = await prisma.alertRule.findMany({
      where: { isActive: true },
    });
    alertRulesCacheTime = Date.now();
  }

  // Filter in memory instead of querying DB
  const rules = alertRulesCache.filter(rule =>
    rule.variantId === variantId ||
    rule.familyId === variant?.familyId ||
    (rule.variantId === null && rule.familyId === null)
  );

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
            stockStatus: { in: ['IN_STOCK', 'LIMITED', 'UNKNOWN'] },
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
