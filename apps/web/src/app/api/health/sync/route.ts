import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** GET /api/health/sync — recent sync job health overview */
export async function GET() {
  const [lastJob, recentJobs] = await Promise.all([
    prisma.syncJob.findFirst({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.syncJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    lastJob: lastJob
      ? {
          id: lastJob.id,
          status: lastJob.status,
          startedAt: lastJob.startedAt?.toISOString() ?? null,
          finishedAt: lastJob.finishedAt?.toISOString() ?? null,
          durationMs: lastJob.durationMs,
          itemsScanned: lastJob.itemsScanned,
          itemsMatched: lastJob.itemsMatched,
          dealsFound: lastJob.dealsFound,
          successCount: lastJob.successCount,
          failureCount: lastJob.failureCount,
          blockedCount: lastJob.blockedCount,
          lastErrorMessage: lastJob.lastErrorMessage,
          errors: lastJob.errors,
        }
      : null,
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      status: j.status,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
      durationMs: j.durationMs,
      itemsScanned: j.itemsScanned,
      itemsMatched: j.itemsMatched,
      successCount: j.successCount,
      failureCount: j.failureCount,
      blockedCount: j.blockedCount,
    })),
  });
}
