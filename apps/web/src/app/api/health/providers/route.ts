import { NextResponse } from 'next/server';
import { prisma, deriveProviderStatus } from '@repo/shared';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

/**
 * GET /api/health/providers — provider health status for all retailers
 * Also returns freshness metadata from last listing scrape + discovery source health
 */
export async function GET() {
  // Fetch DB-backed provider info and worker-side in-memory health in parallel
  const [retailers, workerHealth] = await Promise.all([
    prisma.retailer.findMany({
      include: {
        listings: {
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
          select: { lastSeenAt: true, lastSuccessAt: true, lastFailureAt: true, lastBlockedAt: true },
        },
        _count: { select: { listings: true } },
      },
    }),
    fetch(`${WORKER_URL}/provider-health`, { signal: AbortSignal.timeout(3_000) })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),
  ]);

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

  return NextResponse.json({
    providers,
    discoverySources: workerHealth?.discoverySources ?? null,
  });
}
