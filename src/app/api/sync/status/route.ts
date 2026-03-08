import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Son sync durumu ve retailer bazlı sync bilgisi */
export async function GET() {
  const [lastJob, retailers] = await Promise.all([
    prisma.syncJob.findFirst({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.retailer.findMany({
      include: {
        listings: {
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
          select: { lastSeenAt: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    lastJob: lastJob
      ? {
          id: lastJob.id,
          status: lastJob.status,
          startedAt: lastJob.startedAt?.toISOString() ?? null,
          finishedAt: lastJob.finishedAt?.toISOString() ?? null,
          itemsScanned: lastJob.itemsScanned,
          itemsMatched: lastJob.itemsMatched,
          dealsFound: lastJob.dealsFound,
          errors: lastJob.errors,
        }
      : null,
    retailers: retailers.map((r) => ({
      name: r.name,
      slug: r.slug,
      isActive: r.isActive,
      lastSyncedAt: r.listings[0]?.lastSeenAt?.toISOString() ?? null,
    })),
  });
}
