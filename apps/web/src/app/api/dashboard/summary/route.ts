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
    biggestDrops,
    unreadAlerts,
    recentlyUpdated,
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
    prisma.priceSnapshot.findMany({
      where: { observedAt: { gte: oneDayAgo }, changePercent: { lt: -2 } },
      include: {
        listing: {
          include: { variant: { include: { family: true } }, retailer: true },
        },
      },
      orderBy: { changePercent: 'asc' },
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
    prisma.listing.findMany({
      where: { lastSeenAt: { not: null } },
      include: { variant: { include: { family: true } }, retailer: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 5,
    }),
  ]);

  return NextResponse.json({
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
    biggestDrops: biggestDrops.map((s) => ({
      listingId: s.listing.id,
      variantId: s.listing.variant.id,
      familyName: s.listing.variant.family.name,
      variantName: s.listing.variant.normalizedName,
      color: s.listing.variant.color,
      storageGb: s.listing.variant.storageGb,
      retailerName: s.listing.retailer.name,
      retailerSlug: s.listing.retailer.slug,
      currentPrice: s.observedPrice,
      previousPrice: s.previousPrice,
      changePercent: s.changePercent,
      changeAmount: s.changeAmount,
      productUrl: s.listing.productUrl,
      lastSeenAt: s.observedAt.toISOString(),
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
    recentlyUpdated: recentlyUpdated.map((l) => ({
      listingId: l.id,
      variantId: l.variant.id,
      familyName: l.variant.family.name,
      variantName: l.variant.normalizedName,
      color: l.variant.color,
      storageGb: l.variant.storageGb,
      retailerName: l.retailer.name,
      currentPrice: l.currentPrice,
      isDeal: l.isDeal,
      productUrl: l.productUrl,
      lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
    })),
    syncErrors: lastSync?.errors ?? null,
  });
}
