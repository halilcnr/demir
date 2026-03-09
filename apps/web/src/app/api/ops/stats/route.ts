import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');
const TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

/** GET /api/ops/stats — Full operational stats (config + metrics + risk + progress) */
export async function GET() {
  try {
    // Fetch from worker and DB in parallel
    const [workerStats, clusterStatus, providerMetrics, config, lastJob, listingCount] = await Promise.all([
      fetch(`${WORKER_URL}/ops/stats`, {
        headers: TRIGGER_SECRET ? { 'Authorization': `Bearer ${TRIGGER_SECRET}` } : {},
        signal: AbortSignal.timeout(5_000),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      fetch(`${WORKER_URL}/cluster-status`, {
        signal: AbortSignal.timeout(5_000),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      prisma.providerMetrics.findMany({ orderBy: { retailerSlug: 'asc' } }),
      prisma.workerConfig.findUnique({ where: { id: 'default' } }),
      prisma.syncJob.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.listing.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      // Live from worker (real-time)
      worker: workerStats,
      // DB-persisted metrics (slightly delayed)
      providerMetrics: providerMetrics.map(m => ({
        retailerSlug: m.retailerSlug,
        totalRequests: m.totalRequests,
        successCount: m.successCount,
        failureCount: m.failureCount,
        blockedCount: m.blockedCount,
        rateLimitCount: m.rateLimitCount,
        timeoutCount: m.timeoutCount,
        avgResponseTimeMs: m.avgResponseTimeMs,
        healthScore: m.healthScore,
        riskScore: m.riskScore,
        circuitState: m.circuitState,
        successRate5m: m.successRate5m,
        blockRate5m: m.blockRate5m,
        avgLatency5m: m.avgLatency5m,
        recommendedDelayMs: m.recommendedDelayMs,
        recommendedConcurrency: m.recommendedConcurrency,
        lastSuccessAt: m.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: m.lastFailureAt?.toISOString() ?? null,
        lastBlockedAt: m.lastBlockedAt?.toISOString() ?? null,
      })),
      config: config ?? null,
      lastJob: lastJob ? {
        id: lastJob.id,
        status: lastJob.status,
        startedAt: lastJob.startedAt?.toISOString() ?? null,
        finishedAt: lastJob.finishedAt?.toISOString() ?? null,
        durationMs: lastJob.durationMs,
        itemsScanned: lastJob.itemsScanned,
        itemsMatched: lastJob.itemsMatched,
        successCount: lastJob.successCount,
        failureCount: lastJob.failureCount,
        blockedCount: lastJob.blockedCount,
      } : null,
      totalListings: listingCount,
      cluster: clusterStatus,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

/** PATCH /api/ops/config — Update worker configuration */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    
    const allowed = [
      'syncIntervalMinMs', 'syncIntervalMaxMs', 'requestDelayMinMs',
      'requestDelayMaxMs', 'jitterPercent', 'globalConcurrency',
      'providerConcurrency', 'maxRetries', 'cooldownMultiplier',
      'blockCooldownMinutes', 'activeMode',
    ];

    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    // Update DB
    const result = await prisma.workerConfig.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });

    // Also notify worker to invalidate cache
    fetch(`${WORKER_URL}/ops/config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(TRIGGER_SECRET ? { 'Authorization': `Bearer ${TRIGGER_SECRET}` } : {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(3_000),
    }).catch(() => {});

    return NextResponse.json({ ok: true, config: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request' },
      { status: 400 },
    );
  }
}
