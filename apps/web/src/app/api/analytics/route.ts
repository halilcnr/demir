import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';
import type { StorageGroupAnalytics } from '@repo/shared';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

/**
 * GET /api/analytics — returns smart deal alerts + color-independent grouped analytics
 */
export async function GET() {
  try {
    // Fetch smart deals from worker and variant analytics from DB in parallel
    const [workerRes, topAnalytics] = await Promise.all([
      fetch(`${WORKER_URL}/analytics`, { signal: AbortSignal.timeout(8_000) })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      prisma.variantPriceAnalytics.findMany({
        where: { activeListingCount: { gte: 2 } },
        include: {
          variant: {
            select: {
              normalizedName: true,
              slug: true,
              color: true,
              storageGb: true,
              family: { select: { name: true, slug: true } },
              listings: {
                where: {
                  isActive: true,
                  currentPrice: { not: null, gt: 0 },
                  stockStatus: { in: ['IN_STOCK', 'LIMITED'] },
                },
                include: { retailer: { select: { name: true, slug: true } } },
                orderBy: { currentPrice: 'asc' },
                take: 3,
              },
            },
          },
        },
        orderBy: { dealProbability: 'desc' },
        take: 100,
      }),
    ]);

    // ── Group by family + storage (color-independent) ──
    const groupMap = new Map<string, {
      familyName: string;
      familySlug: string;
      storageGb: number;
      variants: typeof topAnalytics;
    }>();

    for (const a of topAnalytics) {
      const key = `${a.variant.family.slug}|${a.variant.storageGb}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          familyName: a.variant.family.name,
          familySlug: a.variant.family.slug,
          storageGb: a.variant.storageGb,
          variants: [],
        });
      }
      groupMap.get(key)!.variants.push(a);
    }

    const grouped: StorageGroupAnalytics[] = [];

    for (const [key, group] of groupMap) {
      const { familyName, familySlug, storageGb, variants } = group;

      // Collect all listings across all colors for this storage group
      const allListings: { price: number; color: string; retailerName: string; retailerSlug: string; productUrl: string; variantSlug: string }[] = [];

      for (const v of variants) {
        for (const l of v.variant.listings) {
          if (l.currentPrice != null && l.currentPrice > 0) {
            allListings.push({
              price: l.currentPrice,
              color: v.variant.color,
              retailerName: l.retailer.name,
              retailerSlug: l.retailer.slug,
              productUrl: l.productUrl,
              variantSlug: v.variant.slug,
            });
          }
        }
      }

      if (allListings.length === 0) continue;

      // Sort by price
      allListings.sort((a, b) => a.price - b.price);
      const cheapest = allListings[0];
      const prices = allListings.map(l => l.price);

      // Top 3 average across all colors
      const top3 = prices.slice(0, Math.min(3, prices.length));
      const top3Avg = Math.round(top3.reduce((a, b) => a + b, 0) / top3.length);
      const marketAvg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

      // Aggregate metrics from variant analytics
      let bestAllTimeLow: number | null = null;
      let bestAllTimeHigh: number | null = null;
      let bestAvg30d: number | null = null;
      let totalDealProb = 0;
      let totalVolatility = 0;
      let volCount = 0;
      let trendFalling = 0;
      let trendRising = 0;
      let trendStable = 0;
      let totalActiveListings = 0;

      for (const v of variants) {
        if (v.allTimeLowest != null && (bestAllTimeLow == null || v.allTimeLowest < bestAllTimeLow)) {
          bestAllTimeLow = v.allTimeLowest;
        }
        if (v.allTimeHighest != null && (bestAllTimeHigh == null || v.allTimeHighest > bestAllTimeHigh)) {
          bestAllTimeHigh = v.allTimeHighest;
        }
        if (v.avg30d != null && (bestAvg30d == null || v.avg30d < bestAvg30d)) {
          bestAvg30d = v.avg30d;
        }
        totalDealProb = Math.max(totalDealProb, v.dealProbability ?? 0);
        if (v.volatilityScore != null) {
          totalVolatility += v.volatilityScore;
          volCount++;
        }
        if (v.trendDirection === 'falling') trendFalling++;
        else if (v.trendDirection === 'rising') trendRising++;
        else trendStable++;
        totalActiveListings += v.activeListingCount;
      }

      const trendDirection = trendFalling > trendRising ? 'falling'
        : trendRising > trendFalling ? 'rising' : 'stable';

      const uniqueColors = new Set(variants.map(v => v.variant.color));

      grouped.push({
        groupKey: key,
        familyName,
        familySlug,
        storageGb,
        groupLabel: `${familyName} ${storageGb}GB`,
        cheapestPrice: cheapest.price,
        cheapestColor: cheapest.color,
        cheapestVariantSlug: cheapest.variantSlug,
        cheapestRetailerName: cheapest.retailerName,
        cheapestRetailerSlug: cheapest.retailerSlug,
        cheapestProductUrl: cheapest.productUrl,
        top3AveragePrice: top3Avg,
        marketAveragePrice: marketAvg,
        allTimeLowest: bestAllTimeLow,
        allTimeHighest: bestAllTimeHigh,
        trendDirection,
        volatilityScore: volCount > 0 ? Math.round((totalVolatility / volCount) * 100) / 100 : null,
        dealProbability: totalDealProb,
        activeListingCount: totalActiveListings,
        colorCount: uniqueColors.size,
        priceSpread: Math.round(prices[prices.length - 1] - prices[0]),
        avg30d: bestAvg30d,
        cheapestRetailers: allListings.slice(0, 5).map(l => ({
          name: l.retailerName,
          slug: l.retailerSlug,
          price: l.price,
          color: l.color,
          productUrl: l.productUrl,
        })),
      });
    }

    // Sort by deal probability descending
    grouped.sort((a, b) => b.dealProbability - a.dealProbability);

    return NextResponse.json({
      deals: workerRes?.deals ?? [],
      analytics: grouped,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/analytics — triggers analytics recomputation
 */
export async function POST() {
  try {
    const res = await fetch(`${WORKER_URL}/analytics/compute`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Worker returned error', status: res.status },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Worker unreachable' },
      { status: 503 },
    );
  }
}
