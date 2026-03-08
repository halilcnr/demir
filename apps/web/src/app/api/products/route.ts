import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Variant listesi — filtre, arama, sıralama, pagination */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') ?? undefined;
  const family = searchParams.get('family') ?? undefined;
  const storage = searchParams.get('storage') ?? undefined;
  const color = searchParams.get('color') ?? undefined;
  const retailer = searchParams.get('retailer') ?? undefined;
  const isDeal = searchParams.get('isDeal');
  const sort = searchParams.get('sort') ?? 'name';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};

  if (search) {
    where.OR = [
      { normalizedName: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { family: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  if (family) where.family = { name: family };
  if (storage) where.storageGb = parseInt(storage, 10) || undefined;
  if (color) where.color = { contains: color, mode: 'insensitive' };

  const orderBy: any = {};
  if (sort === 'name') orderBy.normalizedName = 'asc';
  else if (sort === 'updated') orderBy.updatedAt = 'desc';
  else orderBy.normalizedName = 'asc';

  const listingWhere: any = {};
  if (retailer) listingWhere.retailer = { slug: retailer };
  if (isDeal === 'true') listingWhere.isDeal = true;

  const [variants, total] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      include: {
        family: { select: { name: true } },
        listings: {
          where: Object.keys(listingWhere).length > 0 ? listingWhere : undefined,
          include: { retailer: true },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.productVariant.count({ where }),
  ]);

  const enriched = variants.map((v) => {
    const prices = v.listings
      .filter((l) => l.currentPrice !== null && l.stockStatus === 'IN_STOCK')
      .map((l) => l.currentPrice as number);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    const bestListing = v.listings.find((l) => l.currentPrice === minPrice);
    const anyDeal = v.listings.some((l) => l.isDeal);
    const topDealScore = Math.max(0, ...v.listings.map((l) => l.dealScore ?? 0));

    return {
      id: v.id,
      familyName: v.family.name,
      color: v.color,
      storageGb: v.storageGb,
      normalizedName: v.normalizedName,
      slug: v.slug,
      minPrice,
      bestRetailerName: bestListing?.retailer.name ?? null,
      bestRetailerSlug: bestListing?.retailer.slug ?? null,
      listingCount: v.listings.length,
      isDeal: anyDeal,
      topDealScore: topDealScore > 0 ? topDealScore : null,
      lastSeenAt: v.listings
        .map((l) => l.lastSeenAt)
        .filter(Boolean)
        .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0]
        ?.toISOString() ?? null,
      productUrl: bestListing?.productUrl ?? null,
      retailers: v.listings.map((l) => ({
        name: l.retailer.name,
        slug: l.retailer.slug,
        price: l.currentPrice,
        isDeal: l.isDeal,
        stockStatus: l.stockStatus,
        productUrl: l.productUrl,
      })),
    };
  });

  if (sort === 'price_asc') {
    enriched.sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
  } else if (sort === 'price_desc') {
    enriched.sort((a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0));
  } else if (sort === 'deal_score') {
    enriched.sort((a, b) => (b.topDealScore ?? 0) - (a.topDealScore ?? 0));
  }

  return NextResponse.json({
    data: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
