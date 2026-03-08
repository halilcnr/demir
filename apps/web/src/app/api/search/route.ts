import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Genel arama: variant, family, listing üzerinde text araması */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ variants: [], families: [] });
  }

  const term = q.trim();

  const [variants, families] = await Promise.all([
    prisma.productVariant.findMany({
      where: {
        OR: [
          { normalizedName: { contains: term, mode: 'insensitive' } },
          { slug: { contains: term, mode: 'insensitive' } },
          { color: { contains: term, mode: 'insensitive' } },
          { family: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
      include: {
        family: { select: { name: true } },
        listings: {
          where: { currentPrice: { not: null }, stockStatus: 'IN_STOCK' },
          include: { retailer: { select: { name: true, slug: true } } },
          orderBy: { currentPrice: 'asc' },
          take: 1,
        },
      },
      take: 10,
    }),
    prisma.productFamily.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      select: { id: true, name: true, _count: { select: { variants: true } } },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    variants: variants.map((v) => ({
      id: v.id,
      familyName: v.family.name,
      normalizedName: v.normalizedName,
      color: v.color,
      storageGb: v.storageGb,
      slug: v.slug,
      minPrice: v.listings[0]?.currentPrice ?? null,
      bestRetailer: v.listings[0]?.retailer?.name ?? null,
    })),
    families: families.map((f) => ({
      id: f.id,
      name: f.name,
      variantCount: f._count.variants,
    })),
  });
}
