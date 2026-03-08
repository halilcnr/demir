import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

type ProviderStatus = 'healthy' | 'warning' | 'blocked' | 'error' | 'cooldown';

const HEALTHY_WINDOW_MS = 15 * 60 * 1000;
const WARNING_WINDOW_MS = 30 * 60 * 1000;
const FAILURE_THRESHOLD = 5;

function deriveStatus(retailer: {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  consecutiveFailures: number;
}): ProviderStatus {
  const now = Date.now();

  if (
    retailer.lastBlockedAt &&
    (!retailer.lastSuccessAt || retailer.lastBlockedAt > retailer.lastSuccessAt)
  ) {
    return 'blocked';
  }

  if (retailer.consecutiveFailures >= FAILURE_THRESHOLD) {
    return 'error';
  }

  if (retailer.lastSuccessAt && now - retailer.lastSuccessAt.getTime() < HEALTHY_WINDOW_MS) {
    return 'healthy';
  }

  if (retailer.lastSuccessAt && now - retailer.lastSuccessAt.getTime() < WARNING_WINDOW_MS) {
    return 'warning';
  }

  if (!retailer.lastSuccessAt && retailer.consecutiveFailures === 0) {
    return 'warning';
  }

  return 'error';
}

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
    const status = deriveStatus(r);
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
