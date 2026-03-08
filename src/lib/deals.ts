import { prisma } from './db';
import type { DetectedDeal, DealType } from '@/types';

interface ListingContext {
  listingId: string;
  variantId: string;
  currentPrice: number;
  previousPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  retailerSlug: string;
}

/**
 * Tek bir listing için deal analizi yapar.
 * Birden fazla deal tipi aynı anda tetiklenebilir; en yüksek skoru döner.
 */
export async function detectDeal(ctx: ListingContext): Promise<DetectedDeal | null> {
  const candidates: DetectedDeal[] = [];

  // 1) Önceki fiyata göre düşüş (PRICE_DROP)
  if (ctx.previousPrice && ctx.currentPrice < ctx.previousPrice) {
    const drop = ((ctx.previousPrice - ctx.currentPrice) / ctx.previousPrice) * 100;
    if (drop >= 2) {
      candidates.push({
        listingId: ctx.listingId,
        dealType: 'PRICE_DROP',
        score: Math.min(100, Math.round(drop * 3)),
        reason: `Önceki fiyata göre %${drop.toFixed(1)} düşüş`,
        currentPrice: ctx.currentPrice,
        referencePrice: ctx.previousPrice,
        dropPercent: drop,
      });
    }
  }

  // 2) Tüm zamanların en düşüğü (ALL_TIME_LOW)
  if (ctx.lowestPrice && ctx.currentPrice <= ctx.lowestPrice) {
    const drop = ctx.highestPrice
      ? ((ctx.highestPrice - ctx.currentPrice) / ctx.highestPrice) * 100
      : 0;
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'ALL_TIME_LOW',
      score: Math.min(100, 60 + Math.round(drop)),
      reason: `Tüm zamanların en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: ctx.lowestPrice,
      dropPercent: drop,
    });
  }

  // 3) Son 24 saatin en düşüğü (DAILY_LOW)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dailyMin = await prisma.priceSnapshot.aggregate({
    where: {
      listingId: ctx.listingId,
      observedAt: { gte: oneDayAgo },
    },
    _min: { observedPrice: true },
  });

  if (dailyMin._min.observedPrice && ctx.currentPrice <= dailyMin._min.observedPrice) {
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'DAILY_LOW',
      score: 40,
      reason: `Son 24 saatin en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: dailyMin._min.observedPrice,
      dropPercent: 0,
    });
  }

  // 4) Son 30 günün en düşüğü (MONTHLY_LOW)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const monthlyMin = await prisma.priceSnapshot.aggregate({
    where: {
      listingId: ctx.listingId,
      observedAt: { gte: thirtyDaysAgo },
    },
    _min: { observedPrice: true },
  });

  if (monthlyMin._min.observedPrice && ctx.currentPrice <= monthlyMin._min.observedPrice) {
    candidates.push({
      listingId: ctx.listingId,
      dealType: 'MONTHLY_LOW',
      score: 55,
      reason: `Son 30 günün en düşük fiyatı`,
      currentPrice: ctx.currentPrice,
      referencePrice: monthlyMin._min.observedPrice,
      dropPercent: 0,
    });
  }

  // 5) Aynı variant diğer retailer'lara göre en ucuz (CROSS_RETAILER_LOW)
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
    const minOther = Math.min(
      ...otherListings.map((l) => l.currentPrice!).filter(Boolean)
    );
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

  // 6) Ani büyük düşüş (SUDDEN_DROP) — %10'dan fazla tek seferde düşüş
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

  if (candidates.length === 0) return null;

  // En yüksek puanlı deal'i döndür
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
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
        { variantId: null, familyId: null }, // global rules
      ],
    },
  });

  for (const rule of rules) {
    // Retailer filtresi varsa kontrol et
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
