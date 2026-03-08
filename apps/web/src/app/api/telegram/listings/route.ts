import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? '';

    const listings = await prisma.listing.findMany({
      where: {
        isActive: true,
        currentPrice: { not: null },
        ...(search
          ? {
              OR: [
                { variant: { normalizedName: { contains: search, mode: 'insensitive' } } },
                { retailer: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        variant: { include: { family: true } },
        retailer: { select: { name: true, slug: true } },
      },
      orderBy: [
        { variant: { family: { sortOrder: 'asc' } } },
        { variant: { storageGb: 'asc' } },
      ],
      take: 20,
    });

    const results = listings.map(l => ({
      id: l.id,
      label: `${l.variant.family.name} ${l.variant.color} ${l.variant.storageGb}GB — ${l.retailer.name}`,
      retailer: l.retailer.name,
      currentPrice: l.currentPrice,
      previousPrice: l.previousPrice,
      lowestPrice: l.lowestPrice,
    }));

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
