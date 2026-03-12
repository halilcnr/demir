import { prisma } from '@repo/shared';
import type { DetectedDeal } from '@repo/shared';
import { DEAL_THRESHOLDS } from '@repo/shared';
import { computePriceIntelligence, detectSuspiciousDiscount } from './price-intelligence';

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

/**
 * Full deal analysis using historical price intelligence.
 * Creates DealEvent records for meaningful events.
 * Returns the best detected deal (highest score).
 */
export async function detectDeal(ctx: ListingContext): Promise<DetectedDeal | null> {
  const candidates: DetectedDeal[] = [];

  // Get full price intelligence from history
  const intel = await computePriceIntelligence(ctx.listingId, ctx.currentPrice, ctx.previousPrice);

  // Check for suspicious discount
  const suspicious = await detectSuspiciousDiscount(ctx.listingId, ctx.currentPrice, ctx.previousPrice);

  // 1) ALL_TIME_LOW — new historical lowest
  if (intel.isNewAllTimeLow && intel.historicalHighest) {
    const drop = ((intel.historicalHighest - ctx.currentPrice) / intel.historicalHighest) * 100;
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'ALL_TIME_LOW',
      score: Math.min(100, 65 + Math.round(drop / 2)),
      reason: `Tüm zamanların en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: intel.historicalLowest ?? ctx.currentPrice,
      dropPercent: drop,
    });
    await createDealEvent(ctx, 'ALL_TIME_LOW', intel.historicalLowest, '30d_avg', 'significant', true, intel.isBelowHistoricalAverage, suspicious);
  }

  // 2) BELOW_AVERAGE — below 30d average by threshold
  if (intel.isBelowHistoricalAverage && intel.rollingAverage30d && intel.priceDropVsAverage) {
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'MONTHLY_LOW',
      score: Math.min(100, 45 + Math.round(intel.priceDropVsAverage * 2)),
      reason: `30 günlük ortalamadan %${intel.priceDropVsAverage.toFixed(1)} düşük`,
      currentPrice: ctx.currentPrice,
      referencePrice: intel.rollingAverage30d,
      dropPercent: intel.priceDropVsAverage,
    });
    if (!intel.isNewAllTimeLow) {
      await createDealEvent(ctx, 'BELOW_AVERAGE', intel.rollingAverage30d, '30d_avg', 'notable', false, true, suspicious);
    }
  }

  // 3) MONTHLY_LOW — lowest in 30 days
  if (intel.minPrice30d != null && ctx.currentPrice <= intel.minPrice30d && !intel.isNewAllTimeLow) {
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'MONTHLY_LOW',
      score: 55,
      reason: `Son 30 günün en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: intel.minPrice30d,
      dropPercent: 0,
    });
    await createDealEvent(ctx, 'MONTHLY_LOW', intel.minPrice30d, 'min_30d', 'notable', false, intel.isBelowHistoricalAverage, suspicious);
  }

  // 4) WEEKLY_LOW — lowest in 7 days (only if not already monthly low)
  if (intel.minPrice7d != null && ctx.currentPrice <= intel.minPrice7d && (intel.minPrice30d == null || ctx.currentPrice > intel.minPrice30d)) {
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'DAILY_LOW',
      score: 40,
      reason: `Son 7 günün en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: intel.minPrice7d,
      dropPercent: 0,
    });
  }

  // 5) PRICE_DROP — immediate drop from previous price
  if (ctx.previousPrice && ctx.currentPrice < ctx.previousPrice) {
    const drop = ((ctx.previousPrice - ctx.currentPrice) / ctx.previousPrice) * 100;
    if (drop >= DEAL_THRESHOLDS.MINOR_DROP_PERCENT) {
      const severity = drop >= DEAL_THRESHOLDS.SIGNIFICANT_DROP_PERCENT ? 'significant'
        : drop >= DEAL_THRESHOLDS.NOTABLE_DROP_PERCENT ? 'notable'
        : 'info';
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

  // 6) SUDDEN_DROP — 10%+ immediate drop
  if (ctx.previousPrice && ctx.currentPrice < ctx.previousPrice) {
    const drop = ((ctx.previousPrice - ctx.currentPrice) / ctx.previousPrice) * 100;
    if (drop >= 10) {
      candidates.push({
        listingId: ctx.listingId,
        dealType: 'SUDDEN_DROP',
        score: Math.min(100, 70 + Math.round(drop)),
        reason: `Ani %${drop.toFixed(1)} fiyat düşüşü tespit edildi`,
        currentPrice: ctx.currentPrice,
        referencePrice: ctx.previousPrice,
        dropPercent: drop,
      });
    }
  }

  // 7) CROSS_RETAILER_LOW — cheapest vs other retailers for same variant
  const otherListings = await prisma.listing.findMany({
    where: {
      variantId: ctx.variantId,
      retailer: { slug: { not: ctx.retailerSlug } },
      currentPrice: { not: null },
      stockStatus: 'IN_STOCK',
    },
    select: { currentPrice: true },
  });

  if (otherListings.length > 0) {
    const minOther = Math.min(...otherListings.map((l) => l.currentPrice!).filter(Boolean));
    if (ctx.currentPrice < minOther) {
      const diff = ((minOther - ctx.currentPrice) / minOther) * 100;
      if (diff >= 1) {
        candidates.push({
          listingId: ctx.listingId,
          dealType: 'CROSS_RETAILER_LOW',
          score: Math.min(100, 35 + Math.round(diff * 2)),
          reason: `Diğer sitelere göre %${diff.toFixed(1)} daha ucuz`,
          currentPrice: ctx.currentPrice,
          referencePrice: minOther,
          dropPercent: diff,
        });
      }
    }
  }

  // 8) SUSPICIOUS_DISCOUNT — flag if suspicious
  if (suspicious.isSuspicious) {
    await createDealEvent(ctx, 'SUSPICIOUS_DISCOUNT', ctx.previousPrice, 'spike_analysis', 'info', false, false, suspicious);
  }

  // 9) DAILY_LOW — 24h lowest
  if (intel.minPrice24h != null && ctx.currentPrice <= intel.minPrice24h) {
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'DAILY_LOW',
      score: 35,
      reason: `Son 24 saatin en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: intel.minPrice24h,
      dropPercent: 0,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];

  // ── Family-Aware Validation: compare across color variants of same model+storage ──
  const variant = await prisma.productVariant.findUnique({
    where: { id: ctx.variantId },
    select: { familyId: true, storageGb: true },
  });

  if (variant) {
    const cheapestSibling = await prisma.listing.findFirst({
      where: {
        variant: { familyId: variant.familyId, storageGb: variant.storageGb },
        variantId: { not: ctx.variantId },
        isActive: true,
        currentPrice: { not: null, gt: 0 },
        stockStatus: { in: ['IN_STOCK', 'LIMITED'] },
      },
      orderBy: { currentPrice: 'asc' },
      select: { currentPrice: true },
    });

    if (cheapestSibling?.currentPrice != null) {
      const groupLowest = cheapestSibling.currentPrice;
      // If this price is more than 2% above the cheapest sibling color, suppress the deal
      if (ctx.currentPrice > groupLowest * 1.02) {
        console.log(`[deals] Family filter: ${ctx.currentPrice} TL > group lowest ${groupLowest} TL × 1.02 — suppressing deal`);
        return null;
      }
      // If within 2% but not actually cheapest, apply a score penalty
      if (ctx.currentPrice > groupLowest) {
        const penalty = Math.round(((ctx.currentPrice - groupLowest) / groupLowest) * 100 * 10); // up to ~20 pts
        best = { ...best, score: Math.max(0, best.score - penalty) };
        console.log(`[deals] Family penalty: -${penalty} pts (${ctx.currentPrice} TL vs group lowest ${groupLowest} TL)`);
      }
    }
  }

  return best;
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
  // Deduplicate: check if same event type was created in last hour for this listing
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
