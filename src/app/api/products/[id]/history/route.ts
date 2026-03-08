import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10)));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      listings: {
        include: {
          retailer: true,
          priceHistory: {
            where: { recordedAt: { gte: since } },
            orderBy: { recordedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  // Retailer bazlı fiyat geçmişi
  const historyByRetailer = product.listings.map((listing) => ({
    retailer: listing.retailer.name,
    retailerSlug: listing.retailer.slug,
    data: listing.priceHistory.map((h) => ({
      date: h.recordedAt.toISOString(),
      price: h.price,
      previousPrice: h.previousPrice,
      changePercent: h.changePercent,
    })),
  }));

  // Flat format (grafik için)
  const flatHistory = product.listings.flatMap((listing) =>
    listing.priceHistory.map((h) => ({
      date: h.recordedAt.toISOString(),
      price: h.price,
      retailer: listing.retailer.name,
    }))
  );

  return NextResponse.json({
    productId: product.id,
    model: product.model,
    storage: product.storage,
    days,
    historyByRetailer,
    flatHistory,
  });
}
