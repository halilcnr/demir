import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/**
 * GET /api/listings/urls — Tüm listing URL'lerini listele
 * POST /api/listings/urls — Manuel URL ekle/güncelle
 */

export async function GET() {
  const listings = await prisma.listing.findMany({
    where: {
      isActive: true,
      productUrl: { not: '' },
    },
    select: {
      id: true,
      productUrl: true,
      currentPrice: true,
      lastSeenAt: true,
      variant: {
        select: {
          slug: true,
          normalizedName: true,
        },
      },
      retailer: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
    orderBy: [
      { variant: { normalizedName: 'asc' } },
      { retailer: { name: 'asc' } },
    ],
  });

  return NextResponse.json(listings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { variantSlug, retailerSlug, productUrl } = body as {
    variantSlug: string;
    retailerSlug: string;
    productUrl: string;
  };

  if (!variantSlug || !retailerSlug || !productUrl) {
    return NextResponse.json(
      { error: 'variantSlug, retailerSlug ve productUrl gerekli' },
      { status: 400 }
    );
  }

  // Validate URL format
  try {
    new URL(productUrl);
  } catch {
    return NextResponse.json({ error: 'Geçersiz URL formatı' }, { status: 400 });
  }

  const variant = await prisma.productVariant.findUnique({ where: { slug: variantSlug } });
  if (!variant) {
    return NextResponse.json({ error: 'Varyant bulunamadı' }, { status: 404 });
  }

  const retailer = await prisma.retailer.findUnique({ where: { slug: retailerSlug } });
  if (!retailer) {
    return NextResponse.json({ error: 'Retailer bulunamadı' }, { status: 404 });
  }

  const listing = await prisma.listing.upsert({
    where: {
      variantId_retailerId: {
        variantId: variant.id,
        retailerId: retailer.id,
      },
    },
    update: { productUrl },
    create: {
      variantId: variant.id,
      retailerId: retailer.id,
      retailerProductTitle: `Apple ${variant.normalizedName}`,
      productUrl,
      stockStatus: 'UNKNOWN',
    },
  });

  return NextResponse.json({ success: true, listingId: listing.id });
}
