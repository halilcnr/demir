import { prisma } from '@repo/shared';
import type { PriceIntelligence } from '@repo/shared';
import { DEAL_THRESHOLDS } from '@repo/shared';

/**
 * Compute full price intelligence for a listing based on its PriceSnapshot history.
 * All analytics come from historical data — not just current vs previous.
 */
export async function computePriceIntelligence(
  listingId: string,
  currentPrice: number | null,
  previousPrice: number | null,
): Promise<PriceIntelligence> {
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

  const historicalLowest = allTimeAgg._min.observedPrice;
  const historicalHighest = allTimeAgg._max.observedPrice;
  const rollingAverage7d = agg7d._avg.observedPrice ? Math.round(agg7d._avg.observedPrice) : null;
  const rollingAverage30d = agg30d._avg.observedPrice ? Math.round(agg30d._avg.observedPrice) : null;

  // Price drops
  let priceDrop24h: number | null = null;
  if (currentPrice != null && agg24h._max.observedPrice != null && agg24h._max.observedPrice > currentPrice) {
    priceDrop24h = ((agg24h._max.observedPrice - currentPrice) / agg24h._max.observedPrice) * 100;
  }

  let priceDrop7d: number | null = null;
  if (currentPrice != null && agg7d._max.observedPrice != null && agg7d._max.observedPrice > currentPrice) {
    priceDrop7d = ((agg7d._max.observedPrice - currentPrice) / agg7d._max.observedPrice) * 100;
  }

  let priceDropVsAverage: number | null = null;
  if (currentPrice != null && rollingAverage30d != null && rollingAverage30d > 0) {
    priceDropVsAverage = ((rollingAverage30d - currentPrice) / rollingAverage30d) * 100;
  }

  // Volatility: standard deviation of recent prices / mean
  let volatilityScore: number | null = null;
  if (recentSnapshots.length >= 3) {
    const prices = recentSnapshots.map(s => s.observedPrice);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
    volatilityScore = mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100 * 100) / 100 : 0;
  }

  // Trend direction
  let trendDirection: PriceIntelligence['trendDirection'] = 'unknown';
  if (recentSnapshots.length >= 3) {
    const oldest = recentSnapshots[recentSnapshots.length - 1].observedPrice;
    const newest = recentSnapshots[0].observedPrice;
    const diff = ((newest - oldest) / oldest) * 100;
    if (diff < -2) trendDirection = 'falling';
    else if (diff > 2) trendDirection = 'rising';
    else trendDirection = 'stable';
  }

  // Last meaningful drop
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

  // Flags
  const isNewAllTimeLow = currentPrice != null && historicalLowest != null && currentPrice <= historicalLowest;
  const isBelowHistoricalAverage = priceDropVsAverage != null && priceDropVsAverage > DEAL_THRESHOLDS.BELOW_AVG_PERCENT;
  const isUnusualDrop = priceDrop7d != null && priceDrop7d > DEAL_THRESHOLDS.SIGNIFICANT_DROP_PERCENT;

  // Market position
  let marketPosition: PriceIntelligence['marketPosition'] = 'unknown';
  if (currentPrice != null && rollingAverage30d != null && rollingAverage30d > 0) {
    const ratio = currentPrice / rollingAverage30d;
    if (ratio <= 0.92) marketPosition = 'cheapest';
    else if (ratio <= 0.97) marketPosition = 'below_avg';
    else if (ratio <= 1.03) marketPosition = 'average';
    else if (ratio <= 1.08) marketPosition = 'above_avg';
    else marketPosition = 'expensive';
  }

  return {
    latestPrice: currentPrice,
    previousPrice,
    historicalLowest,
    historicalHighest,
    rollingAverage7d,
    rollingAverage30d,
    minPrice24h: agg24h._min.observedPrice,
    minPrice7d: agg7d._min.observedPrice,
    minPrice30d: agg30d._min.observedPrice,
    maxPrice30d: agg30d._max.observedPrice,
    priceDrop24h: priceDrop24h != null ? Math.round(priceDrop24h * 10) / 10 : null,
    priceDrop7d: priceDrop7d != null ? Math.round(priceDrop7d * 10) / 10 : null,
    priceDropVsAverage: priceDropVsAverage != null ? Math.round(priceDropVsAverage * 10) / 10 : null,
    volatilityScore,
    trendDirection,
    lastMeaningfulDropPercent,
    marketPosition,
    isNewAllTimeLow,
    isBelowHistoricalAverage,
    isUnusualDrop,
    snapshotCount,
  };
}

/**
 * Detect suspicious discounts by checking for recent price spikes.
 * If a retailer inflated the price shortly before "discounting" it,
 * the discount is fake.
 */
export async function detectSuspiciousDiscount(
  listingId: string,
  currentPrice: number,
  previousPrice: number | null,
): Promise<{ isSuspicious: boolean; reason: string | null }> {
  if (!previousPrice || currentPrice >= previousPrice) {
    return { isSuspicious: false, reason: null };
  }

  const windowMs = DEAL_THRESHOLDS.SUSPICIOUS_WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs);

  // Get price history in the suspicious window
  const recentHistory = await prisma.priceSnapshot.findMany({
    where: { listingId, observedAt: { gte: windowStart } },
    orderBy: { observedAt: 'asc' },
    select: { observedPrice: true, observedAt: true },
  });

  if (recentHistory.length < 3) {
    return { isSuspicious: false, reason: null };
  }

  // Pattern: price was stable → spiked up → "discounted" back
  const prices = recentHistory.map(s => s.observedPrice);
  const maxInWindow = Math.max(...prices);
  const minBeforeSpike = Math.min(...prices.slice(0, Math.max(1, prices.length - 2)));

  // Check if there was a spike and then a "discount"
  const spikePercent = minBeforeSpike > 0 ? ((maxInWindow - minBeforeSpike) / minBeforeSpike) * 100 : 0;
  const discountFromSpike = maxInWindow > 0 ? ((maxInWindow - currentPrice) / maxInWindow) * 100 : 0;

  if (
    spikePercent > DEAL_THRESHOLDS.SUSPICIOUS_SPIKE_PERCENT &&
    discountFromSpike > DEAL_THRESHOLDS.NOTABLE_DROP_PERCENT &&
    currentPrice >= minBeforeSpike * 0.97 // price is roughly back to normal
  ) {
    return {
      isSuspicious: true,
      reason: `Son ${DEAL_THRESHOLDS.SUSPICIOUS_WINDOW_HOURS}s içinde fiyat %${Math.round(spikePercent)} yükseltilip geri indirilmiş`,
    };
  }

  // Check for very high volatility in short window (manipulative pricing)
  if (recentHistory.length >= 4) {
    const range = maxInWindow - Math.min(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const rangePercent = avg > 0 ? (range / avg) * 100 : 0;
    if (rangePercent > 20) {
      return {
        isSuspicious: true,
        reason: `Kısa sürede %${Math.round(rangePercent)} fiyat dalgalanması — fiyat manipülasyonu olabilir`,
      };
    }
  }

  return { isSuspicious: false, reason: null };
}
