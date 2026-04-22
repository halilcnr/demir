import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';
import type { BestByStorageGroup } from '@repo/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const familyFilter = searchParams.get('family');

  const familyWhere = {
    isActive: true,
    ...(familyFilter ? { name: familyFilter } : {}),
  };

  // V2: flat fetch. No nested includes — two parallel queries, join in memory.
  const [families, listings] = await Promise.all([
    prisma.productFamily.findMany({
      where: familyWhere,
      select: { id: true, name: true, slug: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.listing.findMany({
      where: {
        isActive: true,
        currentPrice: { not: null },
        variant: {
          isActive: true,
          family: familyWhere,
        },
      },
      select: {
        id: true,
        currentPrice: true,
        stockStatus: true,
        productUrl: true,
        lastSeenAt: true,
        variant: {
          select: { id: true, color: true, storageGb: true, familyId: true },
        },
        retailer: { select: { name: true, slug: true } },
      },
      orderBy: { currentPrice: 'asc' },
    }),
  ]);

  // Bucket listings by (familyId, storageGb) — single pass.
  type Bucket = {
    familyId: string;
    storageGb: number;
    listingIds: string[];
    allRetailers: BestByStorageGroup['allRetailers'];
    cheapest: BestByStorageGroup['cheapest'];
    secondCheapestPrice: number | null;
    totalPrice: number;
    priceCount: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const l of listings) {
    if (l.currentPrice == null) continue;
    const bucketKey = `${l.variant.familyId}:${l.variant.storageGb}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        familyId: l.variant.familyId,
        storageGb: l.variant.storageGb,
        listingIds: [],
        allRetailers: [],
        cheapest: null,
        secondCheapestPrice: null,
        totalPrice: 0,
        priceCount: 0,
      };
      buckets.set(bucketKey, bucket);
    }

    bucket.listingIds.push(l.id);
    bucket.allRetailers.push({
      variantId: l.variant.id,
      color: l.variant.color,
      retailerName: l.retailer.name,
      retailerSlug: l.retailer.slug,
      price: l.currentPrice,
      stockStatus: l.stockStatus,
      productUrl: l.productUrl,
      lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
    });
    bucket.totalPrice += l.currentPrice;
    bucket.priceCount++;

    if (!bucket.cheapest || l.currentPrice < bucket.cheapest.price) {
      if (bucket.cheapest) bucket.secondCheapestPrice = bucket.cheapest.price;
      bucket.cheapest = {
        variantId: l.variant.id,
        color: l.variant.color,
        price: l.currentPrice,
        retailerName: l.retailer.name,
        retailerSlug: l.retailer.slug,
        productUrl: l.productUrl,
        lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
      };
    } else if (bucket.secondCheapestPrice === null || l.currentPrice < bucket.secondCheapestPrice) {
      bucket.secondCheapestPrice = l.currentPrice;
    }
  }

  // Single batched 30-day lowest across ALL listings.
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const allListingIds = [...buckets.values()].flatMap((b) => b.listingIds);
  const historicalByListing = new Map<string, number>();

  if (allListingIds.length > 0) {
    const snapshots = await prisma.priceSnapshot.groupBy({
      by: ['listingId'],
      where: { listingId: { in: allListingIds }, observedAt: { gte: d30 } },
      _min: { observedPrice: true },
    });
    for (const row of snapshots) {
      if (row._min.observedPrice != null) {
        historicalByListing.set(row.listingId, row._min.observedPrice);
      }
    }
  }

  // Emit groups in family sortOrder, then storageGb asc.
  const familyOrder = new Map(families.map((f) => [f.id, f] as const));
  const groups: BestByStorageGroup[] = [];

  const sortedBuckets = [...buckets.values()]
    .filter((b) => familyOrder.has(b.familyId))
    .sort((a, b) => {
      const fa = familyOrder.get(a.familyId)!;
      const fb = familyOrder.get(b.familyId)!;
      if (fa.sortOrder !== fb.sortOrder) return fa.sortOrder - fb.sortOrder;
      return a.storageGb - b.storageGb;
    });

  for (const bucket of sortedBuckets) {
    const family = familyOrder.get(bucket.familyId)!;
    bucket.allRetailers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

    let groupHistoricalMin: number | null = null;
    for (const id of bucket.listingIds) {
      const p = historicalByListing.get(id);
      if (p != null && (groupHistoricalMin === null || p < groupHistoricalMin)) {
        groupHistoricalMin = p;
      }
    }

    const prices = bucket.allRetailers.filter((r) => r.price != null).map((r) => r.price!);
    const priceSpread = prices.length >= 2 ? prices[prices.length - 1] - prices[0] : null;
    const averagePrice = bucket.priceCount > 0 ? Math.round(bucket.totalPrice / bucket.priceCount) : null;
    const isBestIn30d =
      bucket.cheapest != null && groupHistoricalMin != null && bucket.cheapest.price <= groupHistoricalMin;

    groups.push({
      familyName: family.name,
      familySlug: family.slug,
      storageGb: bucket.storageGb,
      cheapest: bucket.cheapest,
      allRetailers: bucket.allRetailers,
      priceInsights: {
        cheapestRetailer: bucket.cheapest?.retailerName ?? null,
        secondCheapest: bucket.secondCheapestPrice
          ? bucket.allRetailers.find((r) => r.price === bucket.secondCheapestPrice)?.retailerName ?? null
          : null,
        priceSpread,
        averagePrice,
        cheapestColor: bucket.cheapest?.color ?? null,
        historicalLowest30d: groupHistoricalMin,
        isBestIn30d,
      },
    });
  }

  const res = NextResponse.json(groups);
  res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res;
}
