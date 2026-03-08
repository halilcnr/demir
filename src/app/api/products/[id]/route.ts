import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
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

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const prices = product.listings
    .filter((l) => l.currentPrice !== null)
    .map((l) => l.currentPrice as number);

  return NextResponse.json({
    id: product.id,
    brand: product.brand,
    model: product.model,
    storage: product.storage,
    color: product.color,
    slug: product.slug,
    imageUrl: product.imageUrl,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    avgPrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    listings: product.listings.map((l) => ({
      id: l.id,
      retailerName: l.retailer.name,
      retailerSlug: l.retailer.slug,
      currentPrice: l.currentPrice,
      lowestPrice: l.lowestPrice,
      highestPrice: l.highestPrice,
      seller: l.seller,
      inStock: l.inStock,
      externalUrl: l.externalUrl,
      lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    })),
    alertRules: product.alertRules.map((r) => ({
      id: r.id,
      type: r.type,
      threshold: r.threshold,
      isActive: r.isActive,
      lastTriggered: r.lastTriggered?.toISOString() ?? null,
    })),
  });
}
