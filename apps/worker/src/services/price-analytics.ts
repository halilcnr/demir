/**
 * Price Analytics Engine
 *
 * Computes per-variant price analytics: market average, top 3 cheapest,
 * deal probability, trend analysis, and smart deal detection.
 *
 * Materializes results to VariantPriceAnalytics for fast dashboard queries.
 */

import { prisma } from '@repo/shared';
import type { VariantAnalytics, SmartDealAlert } from '@repo/shared';

// ─── Compute analytics for a single variant ─────────────────────

export async function computeVariantAnalytics(variantId: string): Promise<VariantAnalytics | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      family: true,
      listings: {
        where: { isActive: true, currentPrice: { not: null, gt: 0 } },
        include: { retailer: true },
        orderBy: { currentPrice: 'asc' },
      },
    },
  });

  if (!variant) return null;

  const activePrices = variant.listings
    .filter(l => l.currentPrice != null && l.currentPrice > 0 && l.stockStatus !== 'OUT_OF_STOCK')
    .map(l => ({
      price: l.currentPrice!,
      slug: l.retailer.slug,
      name: l.retailer.name,
      url: l.productUrl,
    }));

  if (activePrices.length === 0) return null;

  // Sort by price ascending
  activePrices.sort((a, b) => a.price - b.price);

  const prices = activePrices.map(p => p.price);
  const lowestCurrentPrice = prices[0];
  const top3 = prices.slice(0, Math.min(3, prices.length));
  const top3AveragePrice = top3.reduce((a, b) => a + b, 0) / top3.length;
  const marketAveragePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const medianPrice = prices.length % 2 === 0
    ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
    : prices[Math.floor(prices.length / 2)];
  const priceSpread = prices[prices.length - 1] - prices[0];

  // Historical data
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const listingIds = variant.listings.map(l => l.id);

  const [allTimeAgg, agg7d, agg30d, agg90d, recentSnapshots] = await Promise.all([
    prisma.priceSnapshot.aggregate({
      where: { listingId: { in: listingIds } },
      _min: { observedPrice: true },
      _max: { observedPrice: true },
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId: { in: listingIds }, observedAt: { gte: d7 } },
      _avg: { observedPrice: true },
      _min: { observedPrice: true },
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId: { in: listingIds }, observedAt: { gte: d30 } },
      _avg: { observedPrice: true },
      _min: { observedPrice: true },
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId: { in: listingIds }, observedAt: { gte: d90 } },
      _avg: { observedPrice: true },
    }),
    prisma.priceSnapshot.findMany({
      where: { listingId: { in: listingIds }, observedAt: { gte: d7 } },
      orderBy: { observedAt: 'desc' },
      take: 50,
      select: { observedPrice: true, observedAt: true },
    }),
  ]);

  // Trend direction
  let trendDirection = 'unknown';
  if (recentSnapshots.length >= 5) {
    const recent = recentSnapshots.slice(0, 5).map(s => s.observedPrice);
    const older = recentSnapshots.slice(-5).map(s => s.observedPrice);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    const diff = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (diff < -2) trendDirection = 'falling';
    else if (diff > 2) trendDirection = 'rising';
    else trendDirection = 'stable';
  }

  // Volatility
  let volatilityScore: number | null = null;
  if (recentSnapshots.length >= 3) {
    const rPrices = recentSnapshots.map(s => s.observedPrice);
    const mean = rPrices.reduce((a, b) => a + b, 0) / rPrices.length;
    const variance = rPrices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / rPrices.length;
    volatilityScore = mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100 * 100) / 100 : 0;
  }

  // Price change percentages
  let priceChangePercent7d: number | null = null;
  let priceChangePercent30d: number | null = null;
  if (agg7d._avg.observedPrice && lowestCurrentPrice) {
    priceChangePercent7d = Math.round(((lowestCurrentPrice - agg7d._avg.observedPrice) / agg7d._avg.observedPrice) * 100 * 10) / 10;
  }
  if (agg30d._avg.observedPrice && lowestCurrentPrice) {
    priceChangePercent30d = Math.round(((lowestCurrentPrice - agg30d._avg.observedPrice) / agg30d._avg.observedPrice) * 100 * 10) / 10;
  }

  // Deal probability (0-100)
  let dealProbability = 0;
  const allTimeLow = allTimeAgg._min.observedPrice;
  if (allTimeLow && lowestCurrentPrice <= allTimeLow) {
    dealProbability += 40; // New all-time low is very strong signal
  }
  if (agg30d._avg.observedPrice && lowestCurrentPrice < agg30d._avg.observedPrice * 0.95) {
    dealProbability += 25;
  }
  if (agg30d._min.observedPrice && lowestCurrentPrice < agg30d._min.observedPrice) {
    dealProbability += 20;
  }
  if (trendDirection === 'falling') {
    dealProbability += 15;
  }
  dealProbability = Math.min(100, dealProbability);

  const best = activePrices[0];
  const secondBest = activePrices.length > 1 ? activePrices[1] : null;
  const savingsVsAvg = marketAveragePrice > 0 ? Math.round(marketAveragePrice - lowestCurrentPrice) : null;

  const cheapestRetailers = activePrices.slice(0, 3).map(p => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    productUrl: p.url,
  }));

  const analytics: VariantAnalytics = {
    variantId,
    variantName: variant.normalizedName,
    familyName: variant.family.name,
    color: variant.color,
    storageGb: variant.storageGb,
    lowestCurrentPrice,
    top3AveragePrice: Math.round(top3AveragePrice),
    marketAveragePrice: Math.round(marketAveragePrice),
    medianPrice: Math.round(medianPrice),
    priceSpread: Math.round(priceSpread),
    activeListingCount: activePrices.length,
    allTimeLowest: allTimeAgg._min.observedPrice,
    allTimeHighest: allTimeAgg._max.observedPrice,
    avg30d: agg30d._avg.observedPrice ? Math.round(agg30d._avg.observedPrice) : null,
    lowest30d: agg30d._min.observedPrice,
    trendDirection,
    volatilityScore,
    priceChangePercent7d,
    priceChangePercent30d,
    dealProbability,
    bestRetailer: { slug: best.slug, name: best.name, price: best.price },
    secondBest: secondBest ? { slug: secondBest.slug, price: secondBest.price } : null,
    savingsVsAverage: savingsVsAvg,
    cheapestRetailers,
  };

  // Materialize to DB
  await prisma.variantPriceAnalytics.upsert({
    where: { variantId },
    update: {
      lowestCurrentPrice,
      top3AveragePrice: Math.round(top3AveragePrice),
      marketAveragePrice: Math.round(marketAveragePrice),
      medianPrice: Math.round(medianPrice),
      priceSpread: Math.round(priceSpread),
      activeListingCount: activePrices.length,
      allTimeLowest: allTimeAgg._min.observedPrice,
      allTimeHighest: allTimeAgg._max.observedPrice,
      avg7d: agg7d._avg.observedPrice ? Math.round(agg7d._avg.observedPrice) : null,
      avg30d: agg30d._avg.observedPrice ? Math.round(agg30d._avg.observedPrice) : null,
      avg90d: agg90d._avg.observedPrice ? Math.round(agg90d._avg.observedPrice) : null,
      lowest7d: agg7d._min.observedPrice,
      lowest30d: agg30d._min.observedPrice,
      trendDirection,
      volatilityScore,
      priceChangePercent7d,
      priceChangePercent30d,
      dealProbability,
      bestRetailerSlug: best.slug,
      bestRetailerName: best.name,
      bestRetailerPrice: best.price,
      secondBestSlug: secondBest?.slug ?? null,
      secondBestPrice: secondBest?.price ?? null,
      savingsVsAverage: savingsVsAvg,
      computedAt: now,
    },
    create: {
      variantId,
      lowestCurrentPrice,
      top3AveragePrice: Math.round(top3AveragePrice),
      marketAveragePrice: Math.round(marketAveragePrice),
      medianPrice: Math.round(medianPrice),
      priceSpread: Math.round(priceSpread),
      activeListingCount: activePrices.length,
      allTimeLowest: allTimeAgg._min.observedPrice,
      allTimeHighest: allTimeAgg._max.observedPrice,
      avg7d: agg7d._avg.observedPrice ? Math.round(agg7d._avg.observedPrice) : null,
      avg30d: agg30d._avg.observedPrice ? Math.round(agg30d._avg.observedPrice) : null,
      avg90d: agg90d._avg.observedPrice ? Math.round(agg90d._avg.observedPrice) : null,
      lowest7d: agg7d._min.observedPrice,
      lowest30d: agg30d._min.observedPrice,
      trendDirection,
      volatilityScore,
      priceChangePercent7d,
      priceChangePercent30d,
      dealProbability,
      bestRetailerSlug: best.slug,
      bestRetailerName: best.name,
      bestRetailerPrice: best.price,
      secondBestSlug: secondBest?.slug ?? null,
      secondBestPrice: secondBest?.price ?? null,
      savingsVsAverage: savingsVsAvg,
    },
  }).catch(err => console.error(`[analytics] Failed to persist for ${variantId}:`, err));

  return analytics;
}

// ─── Compute analytics for ALL active variants ──────────────────

export async function computeAllVariantAnalytics(): Promise<number> {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let computed = 0;
  // Process in batches of 10
  for (let i = 0; i < variants.length; i += 10) {
    const batch = variants.slice(i, i + 10);
    await Promise.allSettled(batch.map(v => computeVariantAnalytics(v.id)));
    computed += batch.length;
  }

  console.log(`[analytics] Computed analytics for ${computed} variants`);
  return computed;
}

// ─── Smart Deal Detection ───────────────────────────────────────

export async function detectSmartDeals(): Promise<SmartDealAlert[]> {
  const alerts: SmartDealAlert[] = [];

  const analytics = await prisma.variantPriceAnalytics.findMany({
    where: {
      lowestCurrentPrice: { not: null, gt: 0 },
      activeListingCount: { gte: 2 },
    },
    include: {
      variant: {
        include: {
          family: true,
          listings: {
            where: { isActive: true, currentPrice: { not: null, gt: 0 }, stockStatus: 'IN_STOCK' },
            include: { retailer: true },
            orderBy: { currentPrice: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  for (const a of analytics) {
    if (!a.lowestCurrentPrice || !a.top3AveragePrice || !a.marketAveragePrice) continue;

    const bestListing = a.variant.listings[0];
    if (!bestListing || !bestListing.currentPrice) continue;

    const price = bestListing.currentPrice;
    const isNewAllTimeLow = a.allTimeLowest != null && price <= a.allTimeLowest;
    const isBelowTop3 = price < a.top3AveragePrice * 0.97; // 3% below top3 avg
    const isBelowMarket = price < a.marketAveragePrice * 0.95; // 5% below market avg

    if (!isNewAllTimeLow && !isBelowTop3 && !isBelowMarket) continue;

    const savingsVsMarket = Math.round(a.marketAveragePrice - price);
    const savingsVsTop3 = Math.round(a.top3AveragePrice - price);

    let dealScore = 0;
    const reasons: string[] = [];

    if (isNewAllTimeLow) {
      dealScore += 40;
      reasons.push('Tüm zamanların en düşüğü');
    }
    if (isBelowTop3) {
      const pct = ((a.top3AveragePrice - price) / a.top3AveragePrice * 100).toFixed(1);
      dealScore += 30;
      reasons.push(`Top 3 ortalamanın %${pct} altı`);
    }
    if (isBelowMarket) {
      const pct = ((a.marketAveragePrice - price) / a.marketAveragePrice * 100).toFixed(1);
      dealScore += 20;
      reasons.push(`Piyasa ortalamasının %${pct} altı`);
    }
    if (a.trendDirection === 'falling') dealScore += 10;

    dealScore = Math.min(100, dealScore);

    alerts.push({
      listingId: bestListing.id,
      variantName: a.variant.normalizedName,
      familyName: a.variant.family.name,
      retailerName: bestListing.retailer.name,
      retailerSlug: bestListing.retailer.slug,
      productUrl: bestListing.productUrl,
      currentPrice: price,
      top3Average: Math.round(a.top3AveragePrice),
      marketAverage: Math.round(a.marketAveragePrice),
      allTimeLowest: a.allTimeLowest,
      savingsVsMarket,
      savingsVsTop3,
      isNewAllTimeLow,
      isBelowTop3,
      isBelowMarket,
      dealScore,
      reason: reasons.join(' · '),
    });
  }

  // Sort by deal score descending
  alerts.sort((a, b) => b.dealScore - a.dealScore);
  return alerts;
}

// ─── Build Telegram smart deal message ──────────────────────────

export function buildSmartDealMessage(deal: SmartDealAlert): string {
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const lines: string[] = [];

  lines.push('🔥 <b>Gerçek Fırsat Tespit Edildi!</b>');
  lines.push('');
  lines.push(`📱 <b>${deal.variantName}</b>`);
  lines.push(`🏪 ${deal.retailerName}`);
  lines.push('');
  lines.push(`💰 Fiyat: <b>${fmtPrice(deal.currentPrice)} TL</b>`);
  lines.push(`📊 Top 3 Ort: ${fmtPrice(deal.top3Average)} TL`);
  lines.push(`📈 Piyasa Ort: ${fmtPrice(deal.marketAverage)} TL`);

  if (deal.allTimeLowest != null) {
    lines.push(`📉 Tüm zamanlar en düşük: ${fmtPrice(deal.allTimeLowest)} TL`);
  }

  lines.push('');
  lines.push(`💸 Piyasaya göre tasarruf: <b>${fmtPrice(deal.savingsVsMarket)} TL</b>`);

  if (deal.isNewAllTimeLow) {
    lines.push('');
    lines.push('⭐️ <b>YENİ TÜM ZAMANLARIN EN DÜŞÜĞÜ!</b>');
  }

  lines.push('');
  lines.push(`📋 ${deal.reason}`);
  lines.push('');
  lines.push(`🔗 <a href="${deal.productUrl}">Ürüne Git</a>`);

  return lines.join('\n');
}
