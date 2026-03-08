import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** En iyi fırsatlar: en büyük fiyat düşüşleri ve en ucuz ürünler */
export async function GET() {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  // Son 24 saatte en büyük fiyat düşüşleri
  const biggestDrops = await prisma.priceHistory.findMany({
    where: {
      recordedAt: { gte: oneDayAgo },
      changePercent: { lt: 0 },
    },
    include: {
      listing: {
        include: {
          product: true,
          retailer: true,
        },
      },
    },
    orderBy: { changePercent: 'asc' },
    take: 10,
  });

  // En ucuz listing'ler
  const cheapest = await prisma.productListing.findMany({
    where: {
      currentPrice: { not: null },
      inStock: true,
    },
    include: {
      product: true,
      retailer: true,
    },
    orderBy: { currentPrice: 'asc' },
    take: 10,
  });

  return NextResponse.json({
    biggestDrops: biggestDrops.map((h) => ({
      productId: h.listing.product.id,
      productModel: h.listing.product.model,
      storage: h.listing.product.storage,
      retailerName: h.listing.retailer.name,
      currentPrice: h.price,
      previousPrice: h.previousPrice,
      changePercent: h.changePercent,
      url: h.listing.externalUrl,
      recordedAt: h.recordedAt.toISOString(),
    })),
    cheapest: cheapest.map((l) => ({
      productId: l.product.id,
      productModel: l.product.model,
      storage: l.product.storage,
      retailerName: l.retailer.name,
      currentPrice: l.currentPrice,
      lowestPrice: l.lowestPrice,
      url: l.externalUrl,
    })),
  });
}
