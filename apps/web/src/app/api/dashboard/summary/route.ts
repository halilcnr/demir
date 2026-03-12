import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Dashboard özet verileri: fırsatlar, düşüşler, alertler */
export async function GET() {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const [
    totalFamilies,
    totalVariants,
    totalListings,
    activeDeals,
    last24hDeals,
    lastSync,
    topDeals,
    unreadAlerts,
  ] = await Promise.all([
    prisma.productFamily.count({ where: { isActive: true } }),
    prisma.productVariant.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { isDeal: true } }),
    prisma.listing.count({
      where: { isDeal: true, lastSeenAt: { gte: oneDayAgo } },
    }),
    prisma.syncJob.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { finishedAt: 'desc' },
    }),
    prisma.listing.findMany({
      where: { isDeal: true, currentPrice: { not: null }, stockStatus: 'IN_STOCK' },
      include: { variant: { include: { family: true } }, retailer: true },
      orderBy: { dealScore: 'desc' },
      take: 5,
    }),
    prisma.alertEvent.findMany({
      where: { isRead: false },
      include: {
        alertRule: {
          include: { variant: { include: { family: true } } },
        },
        listing: { include: { retailer: true } },
      },
      orderBy: { triggeredAt: 'desc' },
      take: 10,
    }),
  ]);

  const res = NextResponse.json({
    totalFamilies,
    totalVariants,
    totalListings,
    activeDeals,
    last24hDeals,
    lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
    lastSyncStatus: lastSync?.status ?? null,
    topDeals: topDeals.map((l) => ({
      listingId: l.id,
      variantId: l.variant.id,
      familyName: l.variant.family.name,
      variantName: l.variant.normalizedName,
      color: l.variant.color,
      storageGb: l.variant.storageGb,
      retailerName: l.retailer.name,
      retailerSlug: l.retailer.slug,
      currentPrice: l.currentPrice,
      previousPrice: l.previousPrice,
      dealScore: l.dealScore,
      productUrl: l.productUrl,
      lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
    })),
    cheapestByVariant: [],
    recentAlerts: unreadAlerts.map((e) => ({
      id: e.id,
      alertType: e.alertType,
      triggerReason: e.triggerReason,
      variantName: e.alertRule?.variant?.normalizedName ?? null,
      retailerName: e.listing?.retailer?.name ?? null,
      oldPrice: e.oldPrice,
      newPrice: e.newPrice,
      dropPercent: e.dropPercent,
      isRead: e.isRead,
      triggeredAt: e.triggeredAt.toISOString(),
      productUrl: e.listing?.productUrl ?? null,
    })),
    syncErrors: lastSync?.errors ?? null,
  });
  res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res;
}
