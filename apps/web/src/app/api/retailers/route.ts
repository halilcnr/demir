import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Tüm retailer listesi */
export async function GET() {
  const retailers = await prisma.retailer.findMany({
    include: {
      _count: { select: { listings: true } },
      listings: {
        orderBy: { lastSeenAt: 'desc' },
        take: 1,
        select: { lastSeenAt: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    retailers.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      baseUrl: r.baseUrl,
      isActive: r.isActive,
      listingCount: r._count.listings,
      lastSyncedAt: r.listings[0]?.lastSeenAt?.toISOString() ?? null,
    }))
  );
}
