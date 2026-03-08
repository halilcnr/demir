import { NextResponse } from 'next/server';
import { prisma, deriveProviderStatus } from '@repo/shared';

/**
 * GET /api/health/providers — provider health status for all retailers
 * Also returns freshness metadata from last listing scrape
 */
export async function GET() {
  const retailers = await prisma.retailer.findMany({
    include: {
      listings: {
        orderBy: { lastSeenAt: 'desc' },
        take: 1,
        select: { lastSeenAt: true, lastSuccessAt: true, lastFailureAt: true, lastBlockedAt: true },
      },
      _count: { select: { listings: true } },
    },
  });

  const providers = retailers.map((r) => {
    const status = deriveProviderStatus(r);
    const lastListing = r.listings[0];
    return {
      slug: r.slug,
      name: r.name,
      isActive: r.isActive,
      status,
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
      lastBlockedAt: r.lastBlockedAt?.toISOString() ?? null,
      consecutiveFailures: r.consecutiveFailures,
      blockedCount: r.blockedCount,
      listingCount: r._count.listings,
      lastListingSeenAt: lastListing?.lastSeenAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ providers });
}
