import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Variant fiyat geçmişi: retailer bazlı ve flat format */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10)));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const variant = await prisma.productVariant.findUnique({
    where: { id },
    include: {
      family: { select: { name: true } },
      listings: {
        include: {
          retailer: true,
          snapshots: {
            where: { observedAt: { gte: since } },
            orderBy: { observedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
  }

  const historyByRetailer = variant.listings.map((listing) => ({
    retailer: listing.retailer.name,
    retailerSlug: listing.retailer.slug,
    data: listing.snapshots.map((s) => ({
      date: s.observedAt.toISOString(),
      price: s.observedPrice,
      previousPrice: s.previousPrice,
      changePercent: s.changePercent,
      changeAmount: s.changeAmount,
    })),
  }));

  const flatHistory = variant.listings.flatMap((listing) =>
    listing.snapshots.map((s) => ({
      date: s.observedAt.toISOString(),
      price: s.observedPrice,
      retailer: listing.retailer.name,
    }))
  );

  return NextResponse.json({
    variantId: variant.id,
    familyName: variant.family.name,
    normalizedName: variant.normalizedName,
    color: variant.color,
    storageGb: variant.storageGb,
    days,
    historyByRetailer,
    flatHistory,
  });
}
