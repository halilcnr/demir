import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';
import type { BestByStorageGroup } from '@repo/shared';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const familyFilter = searchParams.get('family');

  // Get all active families with their variants and listings
  const families = await prisma.productFamily.findMany({
    where: {
      isActive: true,
      ...(familyFilter ? { name: familyFilter } : {}),
    },
    include: {
      variants: {
        where: { isActive: true },
        include: {
          listings: {
            where: {
              isActive: true,
              currentPrice: { not: null },
            },
            include: { retailer: true },
            orderBy: { currentPrice: 'asc' },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  // --- Batch historical context: aggregate 30-day lowest for ALL groups in one query ---
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Collect listingIds per group key (familySlug:storageGb)
  const groupListingIds = new Map<string, string[]>();
  const groupsPreData: Array<{
    key: string;
    family: typeof families[number];
    storageGb: number;
    variants: typeof families[number]['variants'];
    allRetailers: BestByStorageGroup['allRetailers'];
    cheapest: BestByStorageGroup['cheapest'];
    secondCheapestPrice: number | null;
    totalPrice: number;
    priceCount: number;
  }> = [];

  for (const family of families) {
    const storageMap = new Map<number, typeof family.variants>();
    for (const variant of family.variants) {
      if (!storageMap.has(variant.storageGb)) {
        storageMap.set(variant.storageGb, []);
      }
      storageMap.get(variant.storageGb)!.push(variant);
    }

    const sortedStorages = [...storageMap.keys()].sort((a, b) => a - b);

    for (const storageGb of sortedStorages) {
      const variants = storageMap.get(storageGb)!;
      const allRetailers: BestByStorageGroup['allRetailers'] = [];
      let cheapest: BestByStorageGroup['cheapest'] = null;
      let totalPrice = 0;
      let priceCount = 0;
      let secondCheapestPrice: number | null = null;

      for (const variant of variants) {
        for (const listing of variant.listings) {
          if (listing.currentPrice == null) continue;

          const entry = {
            variantId: variant.id,
            color: variant.color,
            retailerName: listing.retailer.name,
            retailerSlug: listing.retailer.slug,
            price: listing.currentPrice,
            stockStatus: listing.stockStatus,
            productUrl: listing.productUrl,
            lastSeenAt: listing.lastSeenAt?.toISOString() ?? null,
          };

          allRetailers.push(entry);
          totalPrice += listing.currentPrice;
          priceCount++;

          if (!cheapest || listing.currentPrice < cheapest.price) {
            if (cheapest) secondCheapestPrice = cheapest.price;
            cheapest = {
              variantId: variant.id,
              color: variant.color,
              price: listing.currentPrice,
              retailerName: listing.retailer.name,
              retailerSlug: listing.retailer.slug,
              productUrl: listing.productUrl,
              lastSeenAt: listing.lastSeenAt?.toISOString() ?? null,
            };
          } else if (secondCheapestPrice === null || listing.currentPrice < secondCheapestPrice) {
            secondCheapestPrice = listing.currentPrice;
          }
        }
      }

      allRetailers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

      const key = `${family.slug}:${storageGb}`;
      const listingIds = variants.flatMap(v => v.listings.map(l => l.id));
      groupListingIds.set(key, listingIds);

      groupsPreData.push({
        key, family, storageGb, variants, allRetailers,
        cheapest, secondCheapestPrice, totalPrice, priceCount,
      });
    }
  }

  // Single batch query for all listing IDs across all groups
  const allListingIds = [...groupListingIds.values()].flat();
  const historicalMap = new Map<string, number>();

  if (allListingIds.length > 0) {
    // Use raw query to get min price per listing, then aggregate per group in JS
    const allSnapshots = await prisma.priceSnapshot.groupBy({
      by: ['listingId'],
      where: { listingId: { in: allListingIds }, observedAt: { gte: d30 } },
      _min: { observedPrice: true },
    });

    const listingMinPrice = new Map<string, number>();
    for (const row of allSnapshots) {
      if (row._min.observedPrice != null) {
        listingMinPrice.set(row.listingId, row._min.observedPrice);
      }
    }

    // Aggregate per group
    for (const [key, ids] of groupListingIds) {
      let groupMin: number | null = null;
      for (const id of ids) {
        const p = listingMinPrice.get(id);
        if (p != null && (groupMin === null || p < groupMin)) groupMin = p;
      }
      if (groupMin !== null) historicalMap.set(key, groupMin);
    }
  }

  // Build final groups
  const groups: BestByStorageGroup[] = [];
  for (const g of groupsPreData) {
    const prices = g.allRetailers.filter(r => r.price != null).map(r => r.price!);
    const priceSpread = prices.length >= 2 ? prices[prices.length - 1] - prices[0] : null;
    const averagePrice = g.priceCount > 0 ? Math.round(g.totalPrice / g.priceCount) : null;
    const historicalLowest30d = historicalMap.get(g.key) ?? null;
    const isBestIn30d = g.cheapest != null && historicalLowest30d != null && g.cheapest.price <= historicalLowest30d;

    groups.push({
      familyName: g.family.name,
      familySlug: g.family.slug,
      storageGb: g.storageGb,
      cheapest: g.cheapest,
      allRetailers: g.allRetailers,
      priceInsights: {
        cheapestRetailer: g.cheapest?.retailerName ?? null,
        secondCheapest: g.secondCheapestPrice
          ? g.allRetailers.find(r => r.price === g.secondCheapestPrice)?.retailerName ?? null
          : null,
        priceSpread,
        averagePrice,
        cheapestColor: g.cheapest?.color ?? null,
        historicalLowest30d,
        isBestIn30d,
      },
    });
  }

  const res = NextResponse.json(groups);
  res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res;
}
