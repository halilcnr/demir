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

  const groups: BestByStorageGroup[] = [];

  for (const family of families) {
    // Group variants by storage
    const storageMap = new Map<number, typeof family.variants>();
    for (const variant of family.variants) {
      if (!storageMap.has(variant.storageGb)) {
        storageMap.set(variant.storageGb, []);
      }
      storageMap.get(variant.storageGb)!.push(variant);
    }

    // Sort storages ascending
    const sortedStorages = [...storageMap.keys()].sort((a, b) => a - b);

    for (const storageGb of sortedStorages) {
      const variants = storageMap.get(storageGb)!;

      // Collect ALL retailer entries across all colors for this storage
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
            if (cheapest) {
              secondCheapestPrice = cheapest.price;
            }
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

      // Sort retailers by price
      allRetailers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

      const prices = allRetailers.filter(r => r.price != null).map(r => r.price!);
      const priceSpread = prices.length >= 2 ? prices[prices.length - 1] - prices[0] : null;
      const averagePrice = priceCount > 0 ? Math.round(totalPrice / priceCount) : null;

      // Historical context: 30-day lowest for this family+storage
      const variantIds = variants.map(v => v.id);
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const listingIds = variants.flatMap(v => v.listings.map(l => l.id));

      let historicalLowest30d: number | null = null;
      if (listingIds.length > 0) {
        const agg = await prisma.priceSnapshot.aggregate({
          where: { listingId: { in: listingIds }, observedAt: { gte: d30 } },
          _min: { observedPrice: true },
        });
        historicalLowest30d = agg._min.observedPrice;
      }

      const isBestIn30d = cheapest != null && historicalLowest30d != null && cheapest.price <= historicalLowest30d;

      groups.push({
        familyName: family.name,
        familySlug: family.slug,
        storageGb,
        cheapest,
        allRetailers,
        priceInsights: {
          cheapestRetailer: cheapest?.retailerName ?? null,
          secondCheapest: secondCheapestPrice
            ? allRetailers.find(r => r.price === secondCheapestPrice)?.retailerName ?? null
            : null,
          priceSpread,
          averagePrice,
          cheapestColor: cheapest?.color ?? null,
          historicalLowest30d,
          isBestIn30d,
        },
      });
    }
  }

  return NextResponse.json(groups);
}
