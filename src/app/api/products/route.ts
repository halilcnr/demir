import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') ?? undefined;
  const model = searchParams.get('model') ?? undefined;
  const storage = searchParams.get('storage') ?? undefined;
  const retailer = searchParams.get('retailer') ?? undefined;
  const sort = searchParams.get('sort') ?? 'name';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  const where: Record<string, unknown> = { isActive: true };

  if (search) {
    where.OR = [
      { model: { contains: search, mode: 'insensitive' } },
      { storage: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (model) where.model = { contains: model, mode: 'insensitive' };
  if (storage) where.storage = storage;

  const orderBy: Record<string, string> = {};
  if (sort === 'name') orderBy.model = 'asc';
  else if (sort === 'updated') orderBy.updatedAt = 'desc';
  else orderBy.model = 'asc';

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        listings: {
          include: { retailer: true },
          ...(retailer
            ? { where: { retailer: { slug: retailer } } }
            : {}),
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  // Enrich: min fiyat hesapla, sıralama
  const enriched = products.map((p) => {
    const prices = p.listings
      .filter((l) => l.currentPrice !== null && l.inStock)
      .map((l) => l.currentPrice as number);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;

    return {
      id: p.id,
      brand: p.brand,
      model: p.model,
      storage: p.storage,
      color: p.color,
      slug: p.slug,
      imageUrl: p.imageUrl,
      minPrice,
      listingCount: p.listings.length,
      retailers: p.listings.map((l) => ({
        name: l.retailer.name,
        slug: l.retailer.slug,
        price: l.currentPrice,
        inStock: l.inStock,
      })),
    };
  });

  // Sort by price if requested
  if (sort === 'price_asc') {
    enriched.sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
  } else if (sort === 'price_desc') {
    enriched.sort((a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0));
  }

  return NextResponse.json({
    data: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
