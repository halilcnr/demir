import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Dashboard özet verileri */
export async function GET() {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const [
    totalProducts,
    totalListings,
    lastSync,
    cheapestListings,
    biggestDrops,
    unreadAlerts,
    recentlyUpdated,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.productListing.count(),
    prisma.syncJob.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    }),
    // En ucuz 5 listing
    prisma.productListing.findMany({
      where: { currentPrice: { not: null }, inStock: true },
      include: { product: true, retailer: true },
      orderBy: { currentPrice: 'asc' },
      take: 5,
    }),
    // Son 24 saat en büyük düşüşler
    prisma.priceHistory.findMany({
      where: { recordedAt: { gte: oneDayAgo }, changePercent: { lt: -2 } },
      include: { listing: { include: { product: true, retailer: true } } },
      orderBy: { changePercent: 'asc' },
      take: 5,
    }),
    // Okunmamış alarm eventleri
    prisma.alertEvent.findMany({
      where: { isRead: false },
      include: { alertRule: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // Son güncellenen ürünler
    prisma.productListing.findMany({
      where: { lastSyncedAt: { not: null } },
      include: { product: true, retailer: true },
      orderBy: { lastSyncedAt: 'desc' },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    totalProducts,
    totalListings,
    lastSyncAt: lastSync?.completedAt?.toISOString() ?? null,
    topDeals: cheapestListings.map((l) => ({
      productId: l.product.id,
      productModel: l.product.model,
      storage: l.product.storage,
      retailerName: l.retailer.name,
      currentPrice: l.currentPrice,
      url: l.externalUrl,
    })),
    biggestDrops: biggestDrops.map((h) => ({
      productId: h.listing.product.id,
      productModel: h.listing.product.model,
      storage: h.listing.product.storage,
      retailerName: h.listing.retailer.name,
      currentPrice: h.price,
      previousPrice: h.previousPrice,
      changePercent: h.changePercent,
      url: h.listing.externalUrl,
    })),
    recentAlerts: unreadAlerts.map((e) => ({
      id: e.id,
      message: e.message,
      productModel: e.alertRule.product.model,
      oldPrice: e.oldPrice,
      newPrice: e.newPrice,
      isRead: e.isRead,
      createdAt: e.createdAt.toISOString(),
    })),
    recentlyUpdated: recentlyUpdated.map((l) => ({
      productId: l.product.id,
      productModel: l.product.model,
      storage: l.product.storage,
      retailerName: l.retailer.name,
      currentPrice: l.currentPrice,
      lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    })),
  });
}
