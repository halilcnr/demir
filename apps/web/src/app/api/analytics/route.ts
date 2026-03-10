import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

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
 * GET /api/analytics — returns smart deal alerts + variant analytics summary
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
              family: { select: { name: true } },
            },
          },
        },
        orderBy: { dealProbability: 'desc' },
        take: 50,
      }),
    ]);

    const analyticsRows = topAnalytics.map((a) => ({
      variantId: a.variantId,
      variantName: a.variant.normalizedName,
      variantSlug: a.variant.slug,
      familyName: a.variant.family.name,
      lowestCurrentPrice: a.lowestCurrentPrice,
      top3AveragePrice: a.top3AveragePrice,
      marketAveragePrice: a.marketAveragePrice,
      medianPrice: a.medianPrice,
      priceSpread: a.priceSpread,
      allTimeLowest: a.allTimeLowest,
      allTimeHighest: a.allTimeHighest,
      avg7d: a.avg7d,
      avg30d: a.avg30d,
      avg90d: a.avg90d,
      trendDirection: a.trendDirection,
      volatilityScore: a.volatilityScore,
      dealProbability: a.dealProbability,
      activeListingCount: a.activeListingCount,
      cheapestRetailers: [a.bestRetailerName, a.secondBestSlug].filter(Boolean),
      computedAt: a.computedAt.toISOString(),
    }));

    return NextResponse.json({
      deals: workerRes?.deals ?? [],
      analytics: analyticsRows,
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
