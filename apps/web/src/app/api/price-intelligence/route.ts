import { NextRequest, NextResponse } from 'next/server';
import { prisma, calculateChangePercent } from '@repo/shared';
import type { PriceIntelligence } from '@repo/shared';
import { DEAL_THRESHOLDS } from '@repo/shared';

export const maxDuration = 30;

/** GET /api/price-intelligence?listingId=xxx — full price intelligence for a listing */
export async function GET(req: NextRequest) {
  const listingId = req.nextUrl.searchParams.get('listingId');
  if (!listingId) {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { currentPrice: true, previousPrice: true },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allTimeAgg, agg24h, agg7d, agg30d, snapshotCount, recentSnapshots] = await Promise.all([
    prisma.priceSnapshot.aggregate({
      where: { listingId },
      _min: { observedPrice: true },
      _max: { observedPrice: true },
      _avg: { observedPrice: true },
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId, observedAt: { gte: h24 } },
      _min: { observedPrice: true },
      _max: { observedPrice: true },
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId, observedAt: { gte: d7 } },
      _min: { observedPrice: true },
      _max: { observedPrice: true },
      _avg: { observedPrice: true },
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId, observedAt: { gte: d30 } },
      _min: { observedPrice: true },
      _max: { observedPrice: true },
      _avg: { observedPrice: true },
    }),
    prisma.priceSnapshot.count({ where: { listingId } }),
    prisma.priceSnapshot.findMany({
      where: { listingId, observedAt: { gte: d7 } },
      orderBy: { observedAt: 'desc' },
      take: 20,
      select: { observedPrice: true, observedAt: true },
    }),
  ]);

  const currentPrice = listing.currentPrice;
  const historicalLowest = allTimeAgg._min.observedPrice;
  const historicalHighest = allTimeAgg._max.observedPrice;
  const rollingAverage7d = agg7d._avg.observedPrice ? Math.round(agg7d._avg.observedPrice) : null;
  const rollingAverage30d = agg30d._avg.observedPrice ? Math.round(agg30d._avg.observedPrice) : null;

  let priceDrop24h: number | null = null;
  if (currentPrice != null && agg24h._max.observedPrice != null && agg24h._max.observedPrice > currentPrice) {
    priceDrop24h = Math.round(((agg24h._max.observedPrice - currentPrice) / agg24h._max.observedPrice) * 1000) / 10;
  }

  let priceDrop7d: number | null = null;
  if (currentPrice != null && agg7d._max.observedPrice != null && agg7d._max.observedPrice > currentPrice) {
    priceDrop7d = Math.round(((agg7d._max.observedPrice - currentPrice) / agg7d._max.observedPrice) * 1000) / 10;
  }

  let priceDropVsAverage: number | null = null;
  if (currentPrice != null && rollingAverage30d != null && rollingAverage30d > 0) {
    priceDropVsAverage = Math.round(((rollingAverage30d - currentPrice) / rollingAverage30d) * 1000) / 10;
  }

  // Volatility
  let volatilityScore: number | null = null;
  if (recentSnapshots.length >= 3) {
    const prices = recentSnapshots.map(s => s.observedPrice);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
    volatilityScore = mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100 * 100) / 100 : 0;
  }

  // Trend
  let trendDirection: PriceIntelligence['trendDirection'] = 'unknown';
  if (recentSnapshots.length >= 3) {
    const oldest = recentSnapshots[recentSnapshots.length - 1].observedPrice;
    const newest = recentSnapshots[0].observedPrice;
    const diff = ((newest - oldest) / oldest) * 100;
    if (diff < -2) trendDirection = 'falling';
    else if (diff > 2) trendDirection = 'rising';
    else trendDirection = 'stable';
  }

  let lastMeaningfulDropPercent: number | null = null;
  for (let i = 0; i < recentSnapshots.length - 1; i++) {
    const curr = recentSnapshots[i].observedPrice;
    const prev = recentSnapshots[i + 1].observedPrice;
    if (prev > curr) {
      const drop = ((prev - curr) / prev) * 100;
      if (drop >= DEAL_THRESHOLDS.MINOR_DROP_PERCENT) {
        lastMeaningfulDropPercent = Math.round(drop * 10) / 10;
        break;
      }
    }
  }

  const isNewAllTimeLow = currentPrice != null && historicalLowest != null && currentPrice <= historicalLowest;
  const isBelowHistoricalAverage = priceDropVsAverage != null && priceDropVsAverage > DEAL_THRESHOLDS.BELOW_AVG_PERCENT;
  const isUnusualDrop = priceDrop7d != null && priceDrop7d > DEAL_THRESHOLDS.SIGNIFICANT_DROP_PERCENT;

  let marketPosition: PriceIntelligence['marketPosition'] = 'unknown';
  if (currentPrice != null && rollingAverage30d != null && rollingAverage30d > 0) {
    const ratio = currentPrice / rollingAverage30d;
    if (ratio <= 0.92) marketPosition = 'cheapest';
    else if (ratio <= 0.97) marketPosition = 'below_avg';
    else if (ratio <= 1.03) marketPosition = 'average';
    else if (ratio <= 1.08) marketPosition = 'above_avg';
    else marketPosition = 'expensive';
  }

  const result: PriceIntelligence = {
    latestPrice: currentPrice,
    previousPrice: listing.previousPrice,
    historicalLowest,
    historicalHighest,
    rollingAverage7d,
    rollingAverage30d,
    minPrice24h: agg24h._min.observedPrice,
    minPrice7d: agg7d._min.observedPrice,
    minPrice30d: agg30d._min.observedPrice,
    maxPrice30d: agg30d._max.observedPrice,
    priceDrop24h,
    priceDrop7d,
    priceDropVsAverage,
    volatilityScore,
    trendDirection,
    lastMeaningfulDropPercent,
    marketPosition,
    isNewAllTimeLow,
    isBelowHistoricalAverage,
    isUnusualDrop,
    snapshotCount,
  };

  return NextResponse.json(result);
}
