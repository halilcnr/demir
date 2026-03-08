import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Variant detayı: listing'ler, fiyat aralığı, tarihsel zekâ, alert kuralları */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const variant = await prisma.productVariant.findUnique({
    where: { id },
    include: {
      family: { select: { name: true } },
      listings: {
        include: { retailer: true },
        orderBy: { currentPrice: 'asc' },
      },
      alertRules: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
  }

  const prices = variant.listings
    .filter((l) => l.currentPrice !== null)
    .map((l) => l.currentPrice as number);

  const bestListing = variant.listings
    .filter((l) => l.currentPrice !== null && l.stockStatus === 'IN_STOCK')
    .sort((a, b) => (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity))[0];

  // Get historical aggregate from PriceSnapshot across all listings for this variant
  const listingIds = variant.listings.map(l => l.id);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [allTimeAgg, avg30d, recentDealEvents] = await Promise.all([
    prisma.priceSnapshot.aggregate({
      where: { listingId: { in: listingIds } },
      _min: { observedPrice: true },
      _max: { observedPrice: true },
      _avg: { observedPrice: true },
      _count: true,
    }),
    prisma.priceSnapshot.aggregate({
      where: { listingId: { in: listingIds }, observedAt: { gte: d30 } },
      _avg: { observedPrice: true },
    }),
    prisma.dealEvent.findMany({
      where: { variantId: id },
      orderBy: { detectedAt: 'desc' },
      take: 10,
      include: {
        listing: { include: { retailer: true } },
      },
    }),
  ]);

  return NextResponse.json({
    id: variant.id,
    familyId: variant.familyId,
    familyName: variant.family.name,
    color: variant.color,
    storageGb: variant.storageGb,
    normalizedName: variant.normalizedName,
    slug: variant.slug,
    imageUrl: variant.imageUrl,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    avgPrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    bestRetailer: bestListing?.retailer.name ?? null,
    // Historical intelligence
    historicalLowest: allTimeAgg._min.observedPrice,
    historicalHighest: allTimeAgg._max.observedPrice,
    historicalAverage: allTimeAgg._avg.observedPrice ? Math.round(allTimeAgg._avg.observedPrice) : null,
    average30d: avg30d._avg.observedPrice ? Math.round(avg30d._avg.observedPrice) : null,
    snapshotCount: allTimeAgg._count,
    listings: variant.listings.map((l) => ({
      id: l.id,
      retailerName: l.retailer.name,
      retailerSlug: l.retailer.slug,
      retailerProductTitle: l.retailerProductTitle,
      currentPrice: l.currentPrice,
      previousPrice: l.previousPrice,
      lowestPrice: l.lowestPrice,
      highestPrice: l.highestPrice,
      sellerName: l.sellerName,
      stockStatus: l.stockStatus,
      isDeal: l.isDeal,
      dealScore: l.dealScore,
      productUrl: l.productUrl,
      lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
    })),
    alertRules: variant.alertRules.map((r) => ({
      id: r.id,
      type: r.type,
      threshold: r.threshold,
      isActive: r.isActive,
      lastTriggered: r.lastTriggered?.toISOString() ?? null,
    })),
    dealEvents: recentDealEvents.map((d) => ({
      id: d.id,
      eventType: d.eventType,
      oldPrice: d.oldPrice,
      newPrice: d.newPrice,
      dropAmount: d.dropAmount,
      dropPercent: d.dropPercent,
      severity: d.severity,
      isNewAllTimeLow: d.isNewAllTimeLow,
      isBelowAverage: d.isBelowAverage,
      isSuspiciousDiscount: d.isSuspiciousDiscount,
      suspiciousReason: d.suspiciousReason,
      retailerName: d.listing.retailer.name,
      detectedAt: d.detectedAt.toISOString(),
    })),
  });
}
