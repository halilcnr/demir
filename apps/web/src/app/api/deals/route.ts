import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Aktif fırsatlar: deal olarak işaretlenmiş listing'ler */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sort = searchParams.get('sort') ?? 'deal_score';
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const deals = await prisma.listing.findMany({
    where: {
      isDeal: true,
      currentPrice: { not: null },
      stockStatus: 'IN_STOCK',
    },
    include: {
      variant: { include: { family: true } },
      retailer: true,
    },
    orderBy: sort === 'price_asc'
      ? { currentPrice: 'asc' }
      : sort === 'price_desc'
        ? { currentPrice: 'desc' }
        : { dealScore: 'desc' },
    take: limit,
  });

  const biggestDrops = await prisma.priceSnapshot.findMany({
    where: {
      observedAt: { gte: oneDayAgo },
      changePercent: { lt: -2 },
    },
    include: {
      listing: {
        include: {
          variant: { include: { family: true } },
          retailer: true,
        },
      },
    },
    orderBy: { changePercent: 'asc' },
    take: 10,
  });

  return NextResponse.json({
    deals: deals.map((l) => ({
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
      lowestPrice: l.lowestPrice,
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
  });
}
