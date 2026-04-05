/**
 * BAKİ-QUANT ARBİTRAJ MOTORu
 *
 * Precision arbitrage engine with 10 commandments.
 * Wraps the existing arbitrage pipeline with additional
 * filters, enhanced scoring, and Baki Abi commentary.
 *
 * Integration: Called from telegram.ts's notifySmartDeal()
 * after the initial arbitrage computation.
 */

import { prisma } from '@repo/shared';
import type {
  ArbitrageResult,
  GlobalMarketSnapshot,
  GenerationalContext,
  MarketPrice,
} from './deals';

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

export type BakiVerdict = 'GONDER' | 'REDDET';

export interface CommandmentResult {
  id: number;
  name: string;
  passed: boolean;
  reason: string;
  penalty: number; // 0-100 score penalty (0 = no penalty)
}

export interface BakiQuantResult {
  verdict: BakiVerdict;
  bakiScore: number;               // 0-100 enhanced score
  commandments: CommandmentResult[];
  failedCommandments: number[];     // IDs of failed hard-kill commandments
  commentary: string;               // Baki Abi's Turkish commentary
  rejectionReason: string | null;   // MODE B: why it was rejected (null if approved)
  resaleMarginTL: number | null;    // Commandment #4 output
  liquidityPenalty: number;         // Commandment #6 penalty applied
  isFlashCrash: boolean;            // Commandment #8 flag
  stockWarning: boolean;            // Commandment #10 flag
}

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Hard threshold for sending a notification */
const BAKI_SCORE_THRESHOLD = 75;

/** Lower threshold for first observations (previousPrice == null).
 *  New products have fewer providers scraped → coverage/liquidity penalties stack.
 *  A lower bar prevents silently killing every first-observation notification. */
const FIRST_OBSERVATION_THRESHOLD = 55;

/** Flash crash: single-scrape drop exceeding this % is suspicious */
const FLASH_CRASH_DROP_PERCENT = 25;

/** Outlier gap: price is this % below median → suspect outlier */
const OUTLIER_GAP_PERCENT = 20;

/** Re-alert lock per variant group (12h balances spam vs. opportunity) */
const RENOTIFY_LOCK_MS = 12 * 60 * 60 * 1000;

/** Minimum active providers for reliable arbitrage */
const MIN_PROVIDER_COVERAGE = 3;

/** Stock exhaustion threshold — ≤ this many in-stock listings → warning */
const STOCK_EXHAUSTION_THRESHOLD = 2;

/** Minimum TL amount for resale margin to be considered viable */
const MIN_RESALE_MARGIN_TL = 2000;

/** Penalty per missing provider (below MIN_PROVIDER_COVERAGE) */
const COVERAGE_PENALTY_PER_MISSING = 8;

/** Color popularity tiers (Turkish market) */
const POPULAR_COLORS = new Set([
  // iPhone
  'siyah', 'black', 'beyaz', 'white', 'gece yarısı', 'midnight',
  'yıldız ışığı', 'starlight', 'titanyum siyah', 'natural titanium',
  'titanyum doğal', 'obsidian', 'phantom black', 'cream',
  // Samsung
  'titanium black', 'titanium gray', 'titanium grey', 'titanium blue',
  'titanium white', 'titanium silverblue', 'titanium silver', 'titanium violet',
  'titanium yellow', 'titanyum gri', 'titanyum mavi', 'titanyum gümüş',
  'titanyum beyaz', 'titanyum mor', 'titanyum sarı',
]);

// ═══════════════════════════════════════════════════════════════════
//  48-HOUR RE-NOTIFICATION LOCK (in-memory + DB backed)
// ═══════════════════════════════════════════════════════════════════

// In-memory cache for fast checks (DB is source of truth)
const renotifyLockCache = new Map<string, number>();

/**
 * Build a cache key for the 48h lock: familyId + storageGb
 * This locks at the variant GROUP level, not individual listing
 */
function lockKey(familyId: string, storageGb: number): string {
  return `${familyId}:${storageGb}`;
}

async function isLockedForRenotify(variantId: string): Promise<{ locked: boolean; lockedUntil: Date | null }> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { familyId: true, storageGb: true },
  });
  if (!variant) return { locked: false, lockedUntil: null };

  const key = lockKey(variant.familyId, variant.storageGb);

  // Fast path: in-memory check
  const cached = renotifyLockCache.get(key);
  if (cached && Date.now() < cached) {
    return { locked: true, lockedUntil: new Date(cached) };
  }

  // DB check: last notification for any listing in this variant group
  const cutoff = new Date(Date.now() - RENOTIFY_LOCK_MS);
  const recent = await prisma.listing.findFirst({
    where: {
      variant: { familyId: variant.familyId, storageGb: variant.storageGb },
      notificationSentAt: { gte: cutoff },
    },
    select: { notificationSentAt: true },
    orderBy: { notificationSentAt: 'desc' },
  });

  if (recent?.notificationSentAt) {
    const expiresAt = recent.notificationSentAt.getTime() + RENOTIFY_LOCK_MS;
    if (Date.now() < expiresAt) {
      renotifyLockCache.set(key, expiresAt);
      return { locked: true, lockedUntil: new Date(expiresAt) };
    }
  }

  return { locked: false, lockedUntil: null };
}

export function recordBakiNotification(familyId: string, storageGb: number): void {
  const key = lockKey(familyId, storageGb);
  renotifyLockCache.set(key, Date.now() + RENOTIFY_LOCK_MS);
}

// ═══════════════════════════════════════════════════════════════════
//  10 COMMANDMENTS (Emir)
// ═══════════════════════════════════════════════════════════════════

/**
 * Emir #1: Nesil Bariyeri (Generational Barrier)
 * Delegates to existing checkGenerationalBarrier().
 * HARD KILL — fails the entire pipeline.
 */
function commandment1_GenerationalBarrier(
  genContext: GenerationalContext | null,
): CommandmentResult {
  if (!genContext) {
    return { id: 1, name: 'Nesil Bariyeri', passed: true, reason: 'Nesil verisi yok — kontrol atlandı', penalty: 0 };
  }
  if (genContext.barrierPassed) {
    const gap = genContext.gapPercent != null ? ` (%${genContext.gapPercent.toFixed(1)} fark)` : '';
    return { id: 1, name: 'Nesil Bariyeri', passed: true, reason: `Yeterli nesil farkı${gap}`, penalty: 0 };
  }
  return {
    id: 1, name: 'Nesil Bariyeri', passed: false,
    reason: genContext.reason,
    penalty: 100, // hard kill
  };
}

/**
 * Emir #2: Piyasa Düzeltmesi (Market Correction)
 * If >40% of providers dropped in 12h, the market is correcting.
 * SOFT PENALTY — reduces score but doesn't kill.
 */
function commandment2_MarketCorrection(
  market: GlobalMarketSnapshot,
): CommandmentResult {
  if (market.isMarketCorrection) {
    return {
      id: 2, name: 'Piyasa Düzeltmesi', passed: true,
      reason: 'Piyasa genelinde düzeltme — bu fiyat özel değil, herkes düşüyor',
      penalty: 10,
    };
  }
  return { id: 2, name: 'Piyasa Düzeltmesi', passed: true, reason: 'Piyasa stabil', penalty: 0 };
}

/**
 * Emir #3: Aykırı Değer Testi (Outlier Gap Test)
 * If price is >20% below the median of all in-stock prices,
 * it's likely a data error or bait listing. HARD KILL.
 */
function commandment3_OutlierGap(
  currentPrice: number,
  market: GlobalMarketSnapshot,
): CommandmentResult {
  const prices = market.allInStockPrices.map(p => p.price).sort((a, b) => a - b);
  if (prices.length < 2) {
    return { id: 3, name: 'Aykırı Değer Testi', passed: true, reason: 'Tek fiyat — kontrol atlandı', penalty: 0 };
  }

  const median = prices.length % 2 === 0
    ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
    : prices[Math.floor(prices.length / 2)];

  const gapPercent = ((median - currentPrice) / median) * 100;

  if (gapPercent > OUTLIER_GAP_PERCENT) {
    return {
      id: 3, name: 'Aykırı Değer Testi', passed: false,
      reason: `Fiyat medyandan %${gapPercent.toFixed(1)} düşük — veri hatası olabilir (${fmtTL(currentPrice)} vs medyan ${fmtTL(median)})`,
      penalty: 100,
    };
  }

  if (gapPercent > 15) {
    return {
      id: 3, name: 'Aykırı Değer Testi', passed: true,
      reason: `Medyandan %${gapPercent.toFixed(1)} düşük — dikkatli ol`,
      penalty: 10,
    };
  }

  return { id: 3, name: 'Aykırı Değer Testi', passed: true, reason: 'Normal aralıkta', penalty: 0 };
}

/**
 * Emir #4: Yeniden Satış Marjı (Resale Margin)
 * Calculate potential TL margin vs next-gen floor.
 * INFORMATIONAL — no hard kill, but factors into scoring.
 */
function commandment4_ResaleMargin(
  currentPrice: number,
  genContext: GenerationalContext | null,
  market: GlobalMarketSnapshot,
): CommandmentResult & { resaleMarginTL: number | null } {
  // Resale margin = what you gain vs cheapest next-gen equivalent
  let resaleMarginTL: number | null = null;

  if (genContext && !genContext.isLatestGen) {
    const nextGenFloor = genContext.nextGenPrice ?? genContext.latestGenPrice;
    if (nextGenFloor != null) {
      resaleMarginTL = nextGenFloor - currentPrice;
    }
  }

  // For latest gen, margin = market average - current price
  if (resaleMarginTL == null) {
    resaleMarginTL = Math.round(market.marketAverage - currentPrice);
  }

  if (resaleMarginTL != null && resaleMarginTL >= MIN_RESALE_MARGIN_TL) {
    return {
      id: 4, name: 'Yeniden Satış Marjı', passed: true,
      reason: `${fmtTL(resaleMarginTL)} yeniden satış marjı`,
      penalty: 0, resaleMarginTL,
    };
  }

  if (resaleMarginTL != null && resaleMarginTL > 0) {
    return {
      id: 4, name: 'Yeniden Satış Marjı', passed: true,
      reason: `Düşük marj: ${fmtTL(resaleMarginTL)}`,
      penalty: 5, resaleMarginTL,
    };
  }

  return {
    id: 4, name: 'Yeniden Satış Marjı', passed: true,
    reason: 'Yeniden satış marjı yok veya negatif',
    penalty: 10, resaleMarginTL,
  };
}

/**
 * Emir #5: Renk-Agnostik Taban Doğrulama (Color-Agnostic Floor)
 * Verify the price is at or very near the global floor.
 * HARD KILL if >2% above floor (mirrors existing DISCARD logic).
 */
function commandment5_ColorAgnosticFloor(
  currentPrice: number,
  arb: ArbitrageResult,
): CommandmentResult {
  if (arb.isMarketLeader) {
    return { id: 5, name: 'Renk-Agnostik Taban', passed: true, reason: 'Piyasa lideri — en ucuz teklif', penalty: 0 };
  }

  const aboveFloorPct = ((currentPrice - arb.globalFloor) / arb.globalFloor) * 100;

  if (aboveFloorPct > 2) {
    return {
      id: 5, name: 'Renk-Agnostik Taban', passed: false,
      reason: `Tabandan %${aboveFloorPct.toFixed(1)} yukarıda — daha ucuz seçenek var (${fmtTL(arb.globalFloor)} @ ${arb.globalFloorRetailer}/${arb.globalFloorColor})`,
      penalty: 100,
    };
  }

  if (aboveFloorPct > 0) {
    return {
      id: 5, name: 'Renk-Agnostik Taban', passed: true,
      reason: `Tabana yakın (%${aboveFloorPct.toFixed(1)} üstünde)`,
      penalty: Math.round(aboveFloorPct * 3),
    };
  }

  return { id: 5, name: 'Renk-Agnostik Taban', passed: true, reason: 'Taban fiyatında', penalty: 0 };
}

/**
 * Emir #6: Likidite / Renk Cezası (Liquidity/Color Penalty)
 * Unpopular colors = harder to resell = score penalty.
 */
function commandment6_LiquidityPenalty(
  market: GlobalMarketSnapshot,
  currentColor: string,
): CommandmentResult & { liquidityPenalty: number } {
  const colorLower = currentColor.toLowerCase().trim();

  // Count how many unique retailers carry this specific color
  const thisColorListings = market.allInStockPrices.filter(
    p => p.color.toLowerCase().trim() === colorLower
  );
  const uniqueRetailersForColor = new Set(thisColorListings.map(p => p.retailerSlug)).size;

  let liquidityPenalty = 0;
  let reason: string;

  if (POPULAR_COLORS.has(colorLower)) {
    reason = 'Popüler renk — likidite iyi';
    liquidityPenalty = 0;
  } else if (uniqueRetailersForColor >= 3) {
    reason = `${uniqueRetailersForColor} mağazada satışta — yeterli likidite`;
    liquidityPenalty = 0;
  } else if (uniqueRetailersForColor === 2) {
    reason = 'Sadece 2 mağazada — düşük likidite';
    liquidityPenalty = 3;
  } else if (uniqueRetailersForColor === 1) {
    reason = 'Tek mağazada — çok düşük likidite';
    liquidityPenalty = 5;
  } else {
    reason = 'Hiçbir mağazada stokta değil (?)';
    liquidityPenalty = 8;
  }

  return {
    id: 6, name: 'Likidite/Renk Cezası', passed: true,
    reason, penalty: liquidityPenalty, liquidityPenalty,
  };
}

/**
 * Emir #7: 48 Saat Kilidi (48-Hour Re-Notification Lock)
 * Same variant group (family + storage) cannot trigger within 48h.
 * HARD KILL.
 */
async function commandment7_48HourLock(
  variantId: string,
): Promise<CommandmentResult> {
  const lockCheck = await isLockedForRenotify(variantId);

  if (lockCheck.locked) {
    const until = lockCheck.lockedUntil
      ? lockCheck.lockedUntil.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
      : '?';
    return {
      id: 7, name: '48 Saat Kilidi', passed: false,
      reason: `Bu grup için son 48 saatte bildirim gönderilmiş (kilit: ${until})`,
      penalty: 100,
    };
  }

  return { id: 7, name: '48 Saat Kilidi', passed: true, reason: 'Kilit yok — gönderime uygun', penalty: 0 };
}

/**
 * Emir #8: Flash Crash Tespiti (Flash Crash Detection)
 * If a single-scrape drop exceeds 25%, likely a pricing error.
 * HARD KILL.
 */
function commandment8_FlashCrash(
  currentPrice: number,
  previousPrice: number | null,
): CommandmentResult & { isFlashCrash: boolean } {
  if (previousPrice == null || previousPrice <= 0) {
    return { id: 8, name: 'Flash Crash', passed: true, reason: 'Önceki fiyat yok — kontrol atlandı', penalty: 0, isFlashCrash: false };
  }

  const dropPercent = ((previousPrice - currentPrice) / previousPrice) * 100;

  if (dropPercent >= FLASH_CRASH_DROP_PERCENT) {
    return {
      id: 8, name: 'Flash Crash', passed: false,
      reason: `Tek seferde %${dropPercent.toFixed(1)} düşüş — fiyat hatası olabilir (${fmtTL(previousPrice)} → ${fmtTL(currentPrice)})`,
      penalty: 100, isFlashCrash: true,
    };
  }

  if (dropPercent >= 15) {
    return {
      id: 8, name: 'Flash Crash', passed: true,
      reason: `%${dropPercent.toFixed(1)} düşüş — agresif ama kabul edilebilir`,
      penalty: 5, isFlashCrash: false,
    };
  }

  return { id: 8, name: 'Flash Crash', passed: true, reason: 'Normal fiyat hareketi', penalty: 0, isFlashCrash: false };
}

/**
 * Emir #9: Minimum Veri Kapsamı (Minimum Data Coverage)
 * Require ≥3 active providers for reliable arbitrage.
 * SOFT PENALTY if not enough.
 */
function commandment9_DataCoverage(
  market: GlobalMarketSnapshot,
): CommandmentResult {
  const providerCount = market.activeProviderCount;

  if (providerCount >= MIN_PROVIDER_COVERAGE) {
    return {
      id: 9, name: 'Veri Kapsamı', passed: true,
      reason: `${providerCount} aktif mağaza — yeterli kapsam`,
      penalty: 0,
    };
  }

  if (providerCount === 2) {
    return {
      id: 9, name: 'Veri Kapsamı', passed: true,
      reason: `Sadece 2 mağaza — sınırlı kapsam`,
      penalty: COVERAGE_PENALTY_PER_MISSING,
    };
  }

  if (providerCount === 1) {
    return {
      id: 9, name: 'Veri Kapsamı', passed: true,
      reason: `Tek mağaza — kapsam çok düşük, arbitraj güvenilir değil`,
      penalty: COVERAGE_PENALTY_PER_MISSING + 5,
    };
  }

  return {
    id: 9, name: 'Veri Kapsamı', passed: false,
    reason: 'Hiçbir mağaza verisi yok',
    penalty: 100,
  };
}

/**
 * Emir #10: Stok Tükenme Uyarısı (Stock Exhaustion Warning)
 * When ≤2 fresh listings remain, this may be a last-chance deal — or a trap.
 * INFORMATIONAL — adds a flag, mild penalty.
 */
function commandment10_StockExhaustion(
  market: GlobalMarketSnapshot,
): CommandmentResult & { stockWarning: boolean } {
  const freshCount = market.freshListingCount;

  if (freshCount <= STOCK_EXHAUSTION_THRESHOLD) {
    return {
      id: 10, name: 'Stok Tükenme', passed: true,
      reason: `Sadece ${freshCount} güncel listing kaldı — stok tükeniyor olabilir`,
      penalty: 3,
      stockWarning: true,
    };
  }

  return { id: 10, name: 'Stok Tükenme', passed: true, reason: `${freshCount} güncel listing`, penalty: 0, stockWarning: false };
}

// ═══════════════════════════════════════════════════════════════════
//  ENHANCED SCORING MODEL
// ═══════════════════════════════════════════════════════════════════

interface ScoringInputs {
  arb: ArbitrageResult;
  market: GlobalMarketSnapshot;
  genContext: GenerationalContext | null;
  totalPenalty: number;
  currentPrice: number;
}

/**
 * Enhanced Baki-Quant scoring model.
 * Base = existing arbitrage score, then apply commandment penalties.
 *
 * Weight distribution:
 *   Market Position  35%  — floor proximity + leader status
 *   Historical       25%  — ATL distance
 *   Arbitrage Gap    25%  — savings vs siblings/competitors
 *   Data Confidence  15%  — freshness + coverage
 */
function computeBakiScore(inputs: ScoringInputs): number {
  const { arb, market, currentPrice, totalPenalty } = inputs;

  // ── Market Position (35%) ──
  let marketScore = 0;
  if (arb.isMarketLeader) {
    marketScore = 100;
  } else {
    const aboveFloor = ((currentPrice - arb.globalFloor) / arb.globalFloor) * 100;
    if (aboveFloor <= 0) marketScore = 100;
    else if (aboveFloor <= 1) marketScore = 85;
    else if (aboveFloor <= 2) marketScore = 70;
    else marketScore = Math.max(0, 50 - Math.round(aboveFloor * 5));
  }

  // Below market average bonus
  if (currentPrice < market.marketAverage * 0.95) {
    const pctBelow = ((market.marketAverage - currentPrice) / market.marketAverage) * 100;
    marketScore = Math.min(100, marketScore + Math.round(pctBelow * 0.3));
  }

  // ── Historical Position (25%) ──
  let historicalScore = 0;
  if (arb.distanceFromATL != null) {
    if (arb.distanceFromATL <= 0) historicalScore = 100;
    else if (arb.distanceFromATL <= 2) historicalScore = 90;
    else if (arb.distanceFromATL <= 5) historicalScore = 75;
    else if (arb.distanceFromATL <= 8) historicalScore = 55;
    else if (arb.distanceFromATL <= 12) historicalScore = 35;
    else historicalScore = Math.max(0, 20 - Math.round(arb.distanceFromATL));
  } else {
    historicalScore = 40; // no data → neutral-low
  }

  // ── Arbitrage Gap (25%) ──
  let arbitrageScore = 0;
  if (arb.savingsVsNextSibling != null && arb.savingsVsNextSibling > 0) {
    const siblingGapPct = (arb.savingsVsNextSibling / currentPrice) * 100;
    arbitrageScore = Math.min(100, Math.round(siblingGapPct * 12));
  } else if (arb.isMarketLeader) {
    arbitrageScore = 80;
  } else {
    arbitrageScore = 30;
  }

  // Competitor spread bonus
  if (market.globalCompetitors.length > 0) {
    const cheapestCompetitor = Math.min(...market.globalCompetitors.map(c => c.price));
    if (currentPrice < cheapestCompetitor) {
      const gap = ((cheapestCompetitor - currentPrice) / cheapestCompetitor) * 100;
      arbitrageScore = Math.min(100, arbitrageScore + Math.round(gap * 2));
    }
  }

  // ── Data Confidence (15%) ──
  let confidenceScore = 0;
  const freshRatio = market.activeListingCount > 0
    ? market.freshListingCount / market.activeListingCount
    : 0;
  confidenceScore = Math.round(freshRatio * 70);

  // Provider coverage bonus
  if (market.activeProviderCount >= 4) confidenceScore = Math.min(100, confidenceScore + 30);
  else if (market.activeProviderCount >= 3) confidenceScore = Math.min(100, confidenceScore + 20);
  else if (market.activeProviderCount >= 2) confidenceScore = Math.min(100, confidenceScore + 10);

  // Stale blocker penalty
  if (market.staleBlockerListings.length > 0) {
    confidenceScore = Math.max(0, confidenceScore - market.staleBlockerListings.length * 10);
  }

  // ── Weighted composite ──
  const raw = Math.round(
    marketScore * 0.35 +
    historicalScore * 0.25 +
    arbitrageScore * 0.25 +
    confidenceScore * 0.15
  );

  // Apply commandment penalties
  const final = Math.max(0, Math.min(100, raw - totalPenalty));

  return final;
}

// ═══════════════════════════════════════════════════════════════════
//  BAKİ ABİ COMMENTARY GENERATOR
// ═══════════════════════════════════════════════════════════════════

function generateBakiCommentary(
  bakiScore: number,
  currentPrice: number,
  arb: ArbitrageResult,
  market: GlobalMarketSnapshot,
  genContext: GenerationalContext | null,
  commandments: CommandmentResult[],
  variantLabel: string,
  retailerName: string,
  resaleMarginTL: number | null,
  stockWarning: boolean,
): string {
  const parts: string[] = [];

  // ── Market leader emphasis ──
  if (arb.isMarketLeader) {
    const competitors = market.globalCompetitors.length;
    if (competitors > 0) {
      const cheapestCompetitor = Math.min(...market.globalCompetitors.map(c => c.price));
      const diff = cheapestCompetitor - currentPrice;
      parts.push(`${retailerName} rakiplerden ${fmtTL(diff)} daha ucuz veriyor.`);
    } else {
      parts.push(`${retailerName} piyasadaki en ucuz seçenek.`);
    }
  }

  // ── ATL proximity ──
  if (arb.distanceFromATL != null) {
    if (arb.distanceFromATL <= 0) {
      parts.push('Tüm zamanların en düşük fiyatı — bu fırsatı kaçırma.');
    } else if (arb.distanceFromATL <= 3) {
      parts.push(`ATL'ye sadece %${arb.distanceFromATL.toFixed(1)} uzakta.`);
    }
  }

  // ── Resale margin ──
  if (resaleMarginTL != null && resaleMarginTL >= MIN_RESALE_MARGIN_TL) {
    parts.push(`Yeniden satışta ${fmtTL(resaleMarginTL)} marj potansiyeli var.`);
  }

  // ── Generational context ──
  if (genContext && !genContext.isLatestGen && genContext.nextGenPrice != null) {
    const gap = genContext.nextGenPrice - currentPrice;
    parts.push(`Bir üst nesile geçmek için ${fmtTL(gap)} fark var — bu modelde kalmak mantıklı.`);
  } else if (genContext?.isLatestGen) {
    parts.push('En güncel nesil — değer kaybı minimum.');
  }

  // ── Market correction warning ──
  if (market.isMarketCorrection) {
    parts.push('Piyasa genelinde düzeltme var. Herkes düşüyor, bu tek başına özel değil.');
  }

  // ── Stock warning ──
  if (stockWarning) {
    parts.push('Stok azalıyor — son fırsat olabilir ama tuzak da olabilir.');
  }

  // ── Score-based closing ──
  if (bakiScore >= 95) {
    parts.push('Bu fiyata bu telefonu bırakma abi.');
  } else if (bakiScore >= 85) {
    parts.push('Güçlü fırsat. Düşünmeden al.');
  } else if (bakiScore >= 75) {
    parts.push('İyi bir alım. Hızlı karar ver.');
  }

  if (parts.length === 0) {
    parts.push('Fiyat makul seviyede.');
  }

  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════════
//  MODE B: REJECTION REASON GENERATOR
// ═══════════════════════════════════════════════════════════════════

function generateRejectionReason(
  commandments: CommandmentResult[],
  bakiScore: number,
): string {
  const failed = commandments.filter(c => !c.passed);
  if (failed.length > 0) {
    return failed.map(c => `[Emir #${c.id}: ${c.name}] ${c.reason}`).join(' | ');
  }

  // All commandments passed but score is too low
  return `Skor yetersiz (${bakiScore}/100 < ${BAKI_SCORE_THRESHOLD})`;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN ENGINE
// ═══════════════════════════════════════════════════════════════════

export interface BakiQuantInput {
  currentPrice: number;
  previousPrice: number | null;
  variantId: string;
  variantLabel: string;
  retailerName: string;
  retailerSlug: string;
  arb: ArbitrageResult;
  market: GlobalMarketSnapshot;
  genContext: GenerationalContext | null;
}

/**
 * Run the full Baki-Quant engine.
 * Applies all 10 commandments, computes enhanced score,
 * generates Baki Abi commentary (MODE A) or rejection reason (MODE B).
 */
export async function runBakiQuantEngine(input: BakiQuantInput): Promise<BakiQuantResult> {
  const { currentPrice, previousPrice, variantId, variantLabel, retailerName, arb, market, genContext } = input;

  // ── Resolve color from market data ──
  const thisListing = market.allInStockPrices.find(
    p => p.retailerSlug === input.retailerSlug && Math.abs(p.price - currentPrice) < 1
  );
  const currentColor = thisListing?.color ?? '';

  // ── Run all 10 commandments ──
  const c1 = commandment1_GenerationalBarrier(genContext);
  const c2 = commandment2_MarketCorrection(market);
  const c3 = commandment3_OutlierGap(currentPrice, market);
  const c4 = commandment4_ResaleMargin(currentPrice, genContext, market);
  const c5 = commandment5_ColorAgnosticFloor(currentPrice, arb);
  const c6 = commandment6_LiquidityPenalty(market, currentColor);
  const c7 = await commandment7_48HourLock(variantId);
  const c8 = commandment8_FlashCrash(currentPrice, previousPrice);
  const c9 = commandment9_DataCoverage(market);
  const c10 = commandment10_StockExhaustion(market);

  const commandments: CommandmentResult[] = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10];

  // ── Check for hard kills ──
  const failedCommandments = commandments.filter(c => !c.passed).map(c => c.id);
  const hasHardKill = failedCommandments.length > 0;

  // ── Calculate total soft penalty (from passing commandments that still penalize) ──
  const softPenalties = commandments
    .filter(c => c.passed)
    .reduce((sum, c) => sum + c.penalty, 0);

  // ── Compute enhanced Baki score ──
  const bakiScore = hasHardKill
    ? 0
    : computeBakiScore({
        arb,
        market,
        genContext,
        totalPenalty: softPenalties,
        currentPrice,
      });

  // ── Verdict ──
  const isFirstObservation = previousPrice == null;
  const effectiveThreshold = isFirstObservation ? FIRST_OBSERVATION_THRESHOLD : BAKI_SCORE_THRESHOLD;
  const verdict: BakiVerdict = (!hasHardKill && bakiScore >= effectiveThreshold)
    ? 'GONDER'
    : 'REDDET';

  // ── Commentary or rejection ──
  const commentary = verdict === 'GONDER'
    ? generateBakiCommentary(
        bakiScore, currentPrice, arb, market, genContext,
        commandments, variantLabel, retailerName,
        c4.resaleMarginTL, c10.stockWarning,
      )
    : '';

  const rejectionReason = verdict === 'REDDET'
    ? generateRejectionReason(commandments, bakiScore)
    : null;

  return {
    verdict,
    bakiScore,
    commandments,
    failedCommandments,
    commentary,
    rejectionReason,
    resaleMarginTL: c4.resaleMarginTL,
    liquidityPenalty: c6.liquidityPenalty,
    isFlashCrash: c8.isFlashCrash,
    stockWarning: c10.stockWarning,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  NOTIFICATION FORMATTER (Baki Abi Template)
// ═══════════════════════════════════════════════════════════════════

export interface BakiNotificationInput {
  variantLabel: string;
  retailerName: string;
  productUrl: string;
  newPrice: number;
  oldPrice: number | null;
  arb: ArbitrageResult;
  market: GlobalMarketSnapshot;
  genContext: GenerationalContext | null;
  baki: BakiQuantResult;
  timings: { dataMs: number; analysisMs: number; totalMs: number };
}

/**
 * Build the Baki Abi flash notification (Phase 1).
 * Sent immediately — product, price, link, buy now.
 */
export function buildBakiFlashMessage(input: BakiNotificationInput): string {
  const { newPrice, oldPrice, arb, market, baki, variantLabel, retailerName, productUrl } = input;
  const lines: string[] = [];

  // ── Header ──
  const isATL = market.groupAllTimeLow != null && newPrice <= market.groupAllTimeLow;
  if (isATL) {
    lines.push('🏆 <b>TÜM ZAMANLARIN EN DÜŞÜĞÜ</b>');
  } else if (arb.isMarketLeader) {
    lines.push('🔥 <b>BAKİ ABİ DİYOR Kİ: AL!</b>');
  } else {
    lines.push('💰 <b>BAKİ ABİ FIRSATI</b>');
  }
  lines.push('');

  // ── Product + Price ──
  lines.push(`📱 <b>${variantLabel}</b>`);
  lines.push(`💰 <b>${fmtTL(newPrice)}</b> — ${retailerName}`);

  if (oldPrice != null && oldPrice !== newPrice && oldPrice > newPrice) {
    const dropPct = ((oldPrice - newPrice) / oldPrice * 100).toFixed(1);
    lines.push(`<s>${fmtTL(oldPrice)}</s> → <b>${fmtTL(newPrice)}</b> (-%${dropPct})`);
  }
  lines.push('');

  // ── Baki Abi Commentary ──
  if (baki.commentary) {
    lines.push(`💬 <i>"${baki.commentary}"</i>`);
    lines.push('');
  }

  // ── Score badge ──
  const scoreBadge = baki.bakiScore >= 90 ? '🟢' : baki.bakiScore >= 80 ? '🔵' : '🟡';
  lines.push(`${scoreBadge} <b>Baki Skor: ${baki.bakiScore}/100</b>`);

  // ── Stock warning ──
  if (baki.stockWarning) {
    lines.push('⚠️ Stok azalıyor');
  }
  lines.push('');

  // ── Link ──
  lines.push(`🔗 <a href="${productUrl}">Satın Al →</a>`);

  // ── Timestamp ──
  lines.push('');
  lines.push(`<i>${istanbulTimestamp()}</i>`);

  return lines.join('\n');
}

/**
 * Build the Baki Abi detail message (Phase 2).
 * Sent as fire-and-forget follow-up.
 */
export function buildBakiDetailMessage(input: BakiNotificationInput): string {
  const { newPrice, arb, market, genContext, baki, timings, variantLabel, retailerName } = input;
  const lines: string[] = [];

  lines.push(`📊 <b>Baki-Quant Analiz: ${variantLabel}</b>`);
  lines.push('');

  // ── Market Analysis ──
  lines.push('━━━ PİYASA ━━━');
  if (arb.isMarketLeader) {
    lines.push('  🥇 Tüm mağaza ve renklerde <b>en ucuz</b>');
  } else {
    lines.push(`  En ucuz: <b>${fmtTL(arb.globalFloor)}</b> (${market.globalFloorRetailer}/${market.globalFloorColor})`);
  }

  // Second cheapest
  if (market.allInStockPrices.length > 1) {
    const sorted = [...market.allInStockPrices].sort((a, b) => a.price - b.price);
    const second = sorted.find(p =>
      p.retailerSlug !== arb.globalFloorRetailer || p.color !== arb.globalFloorColor
    );
    if (second) {
      const diff = second.price - newPrice;
      const diffStr = diff > 0 ? ` (+${fmtTL(Math.round(diff))})` : '';
      lines.push(`  2. teklif: <b>${fmtTL(second.price)}</b> — ${second.retailerName}/${second.color}${diffStr}`);
    }
  }

  if (market.marketAverage > 0) {
    const belowPct = (((market.marketAverage - newPrice) / market.marketAverage) * 100).toFixed(1);
    lines.push(`  Ortalama: <b>${fmtTL(Math.round(market.marketAverage))}</b>${Number(belowPct) > 0 ? ` (%${belowPct} altında)` : ''}`);
  }

  // ATL
  if (market.groupAllTimeLow != null) {
    const isATL = newPrice <= market.groupAllTimeLow;
    if (isATL) {
      lines.push('  🏅 Tüm zamanların en düşük fiyatı!');
    } else {
      const dist = (((newPrice - market.groupAllTimeLow) / market.groupAllTimeLow) * 100).toFixed(1);
      lines.push(`  ATL: ${fmtTL(market.groupAllTimeLow)} (%${dist} üstünde)`);
    }
  }

  // Competitor list
  if (market.globalCompetitors.length > 0) {
    const byRetailer = new Map<string, { name: string; price: number }>();
    for (const c of market.globalCompetitors) {
      const existing = byRetailer.get(c.retailerSlug);
      if (!existing || c.price < existing.price) {
        byRetailer.set(c.retailerSlug, { name: c.retailerName, price: c.price });
      }
    }
    const parts = [...byRetailer.values()]
      .sort((a, b) => a.price - b.price)
      .slice(0, 4)
      .map(c => `${c.name} ${fmtTL(c.price)}`);
    if (parts.length > 0) {
      lines.push(`  Rakipler: ${parts.join(', ')}`);
    }
  }
  lines.push('');

  // ── Generational comparison ──
  if (genContext && !genContext.isLatestGen && (genContext.nextGenPrice != null || genContext.latestGenPrice != null)) {
    lines.push('━━━ NESİL KIYASLAMASI ━━━');
    lines.push(`  ${genContext.currentFamilyName}: <b>${fmtTL(newPrice)}</b> ← bu fırsat`);
    if (genContext.nextGenPrice != null && genContext.nextGenFamilyName) {
      const gap = genContext.nextGenPrice - newPrice;
      lines.push(`  ${genContext.nextGenFamilyName}: ${fmtTL(genContext.nextGenPrice)} (+${fmtTL(gap)})`);
    }
    if (genContext.latestGenPrice != null && genContext.latestGenFamilyName !== genContext.nextGenFamilyName) {
      const gap = genContext.latestGenPrice - newPrice;
      lines.push(`  ${genContext.latestGenFamilyName}: ${fmtTL(genContext.latestGenPrice)} (+${fmtTL(gap)})`);
    }
    lines.push('  ✅ Yeterli nesil farkı — değerli alım');
    lines.push('');
  } else if (genContext?.isLatestGen) {
    lines.push('⚡ En güncel nesil');
    lines.push('');
  }

  // ── Resale margin ──
  if (baki.resaleMarginTL != null && baki.resaleMarginTL >= MIN_RESALE_MARGIN_TL) {
    lines.push(`💼 Yeniden satış marjı: ~${fmtTL(baki.resaleMarginTL)}`);
    lines.push('');
  }

  // ── Commandment summary ──
  lines.push('━━━ 10 EMİR KONTROLÜ ━━━');
  for (const c of baki.commandments) {
    const icon = c.passed ? (c.penalty > 0 ? '⚠️' : '✅') : '❌';
    const penaltyStr = c.penalty > 0 && c.passed ? ` (-${c.penalty})` : '';
    lines.push(`  ${icon} #${c.id} ${c.name}${penaltyStr}`);
  }
  lines.push('');

  // ── Final score ──
  lines.push(`🎯 <b>Baki Skor: ${baki.bakiScore}/100</b> | ${arb.verdict}`);
  if (market.isMarketCorrection) {
    lines.push('⚠️ Piyasa düzeltmesi aktif');
  }
  lines.push('');

  // ── Timing ──
  const totalSec = (timings.totalMs / 1000).toFixed(1);
  const dataSec = (timings.dataMs / 1000).toFixed(1);
  const analysisSec = (timings.analysisMs / 1000).toFixed(1);
  lines.push(`⏱️ ${totalSec}s (📡${dataSec}s 🧠${analysisSec}s)`);
  lines.push(`⚙️ Baki-Quant v1.0 | Eşik: ${BAKI_SCORE_THRESHOLD}`);

  // ── Timestamp ──
  lines.push('');
  lines.push(`<i>${istanbulTimestamp()}</i>`);

  return lines.join('\n');
}

/**
 * Build rejection log message (MODE B) — logged but not sent to users.
 */
export function buildRejectionLog(
  variantLabel: string,
  retailerName: string,
  newPrice: number,
  baki: BakiQuantResult,
): string {
  const failedIds = baki.failedCommandments.join(', ') || 'yok (skor düşük)';
  return `[baki-quant] REDDET: ${variantLabel} @ ${retailerName} ${fmtTL(newPrice)} | skor=${baki.bakiScore} | başarısız emirler=[${failedIds}] | ${baki.rejectionReason}`;
}

// ═══════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════

function fmtTL(price: number): string {
  return price.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' TL';
}

function istanbulTimestamp(): string {
  return new Date().toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

/** Expose threshold for external use */
export const BAKI_THRESHOLD = BAKI_SCORE_THRESHOLD;
