import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

// Aggregated telemetry across all online workers.
// Railway pattern: single WORKER_URL load-balances across N replicas, so calling
// /telemetry hits a random worker per request. To collect per-worker data we
// fire N parallel calls (N = cluster size) and dedupe by workerId. This isn't
// perfect — the LB may land us on the same worker twice — but at small cluster
// sizes (≤15) 3× overfetch converges.
//
// When we outgrow this, each worker should expose its public URL in its
// heartbeat and we'd call them directly. Punt until we actually hit the limit.

interface WorkerTelemetry {
  workerId: string;
  startedAt: string;
  uptimeSec: number;
  status: string;
  concurrency: number;
  currentTaskId: string | null;
  isProcessing: boolean;
  localCounters: {
    tasksCompleted: number;
    tasksFailed: number;
    tasksSkipped: number;
    avgTaskTimeMs: number;
  };
  rollingLatency: {
    windowMs: number;
    sampleCount: number;
    scrapesPerSec: number;
    p50: number;
    p95: number;
    p99: number;
    successRate: number;
    perProvider: Record<string, { count: number; p50: number; p95: number; successRate: number }>;
  };
  providerQueue: {
    depth: number;
    activeGlobal: number;
    activePerProvider: Record<string, number>;
  };
}

export async function GET() {
  try {
    // How many workers should we ask? Use heartbeat count as the cluster size.
    const cutoff = new Date(Date.now() - 90_000);
    const onlineWorkers = await prisma.workerHeartbeat.count({
      where: { lastHeartbeatAt: { gt: cutoff } },
    });
    const fanout = Math.max(1, Math.min(onlineWorkers * 3, 30));

    const responses = await Promise.allSettled(
      Array.from({ length: fanout }, () =>
        fetch(`${WORKER_URL}/telemetry`, { signal: AbortSignal.timeout(4_000) })
          .then(r => r.ok ? r.json() as Promise<WorkerTelemetry> : null)
          .catch(() => null),
      ),
    );

    // Dedupe by workerId, keep the newest sample per worker
    const byId = new Map<string, WorkerTelemetry>();
    for (const r of responses) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const t = r.value;
      byId.set(t.workerId, t);
    }
    const workers = [...byId.values()];

    // Aggregate rolling latency across all reached workers
    const allP50s = workers.map(w => w.rollingLatency.p50).filter(n => n > 0);
    const allP95s = workers.map(w => w.rollingLatency.p95).filter(n => n > 0);
    const allP99s = workers.map(w => w.rollingLatency.p99).filter(n => n > 0);
    const totalSamples = workers.reduce((s, w) => s + w.rollingLatency.sampleCount, 0);
    const avgSuccessRate = workers.length > 0
      ? workers.reduce((s, w) => s + w.rollingLatency.successRate, 0) / workers.length
      : 0;

    // Throughput across all reached workers — sum of each worker's scrapesPerSec.
    // This is the actual cluster-wide scrape rate (near-real-time, 60s window).
    const clusterScrapesPerSec =
      Math.round(workers.reduce((s, w) => s + w.rollingLatency.scrapesPerSec, 0) * 10) / 10;

    const cluster = {
      onlineWorkers,
      reachedWorkers: workers.length,
      fanout,
      // Conservative aggregation: max of per-worker percentiles (pessimistic)
      latency: {
        sampleCount: totalSamples,
        scrapesPerSec: clusterScrapesPerSec,
        p50: allP50s.length ? Math.max(...allP50s) : 0,
        p95: allP95s.length ? Math.max(...allP95s) : 0,
        p99: allP99s.length ? Math.max(...allP99s) : 0,
        successRate: Math.round(avgSuccessRate * 10) / 10,
      },
      totalProviderQueueDepth: workers.reduce((s, w) => s + w.providerQueue.depth, 0),
      totalActiveRequests: workers.reduce((s, w) => s + w.providerQueue.activeGlobal, 0),
      totalTasksCompleted: workers.reduce((s, w) => s + w.localCounters.tasksCompleted, 0),
      totalTasksFailed: workers.reduce((s, w) => s + w.localCounters.tasksFailed, 0),
    };

    // Merge per-provider stats (weighted by sample count)
    const providerAgg = new Map<string, { count: number; sumP50: number; sumP95: number; okSum: number }>();
    for (const w of workers) {
      for (const [slug, stats] of Object.entries(w.rollingLatency.perProvider)) {
        const cur = providerAgg.get(slug) ?? { count: 0, sumP50: 0, sumP95: 0, okSum: 0 };
        cur.count += stats.count;
        cur.sumP50 += stats.p50 * stats.count;
        cur.sumP95 += stats.p95 * stats.count;
        cur.okSum += (stats.successRate / 100) * stats.count;
        providerAgg.set(slug, cur);
      }
    }
    const perProvider = Object.fromEntries(
      [...providerAgg.entries()].map(([slug, a]) => [slug, {
        count: a.count,
        p50: a.count > 0 ? Math.round(a.sumP50 / a.count) : 0,
        p95: a.count > 0 ? Math.round(a.sumP95 / a.count) : 0,
        successRate: a.count > 0 ? Math.round((a.okSum / a.count) * 1000) / 10 : 0,
      }]),
    );

    return NextResponse.json({
      cluster,
      perProvider,
      workers: workers.map(w => ({
        workerId: w.workerId,
        shortId: w.workerId.slice(0, 12),
        status: w.status,
        concurrency: w.concurrency,
        uptimeSec: w.uptimeSec,
        isProcessing: w.isProcessing,
        currentTaskId: w.currentTaskId,
        latency: w.rollingLatency,
        queue: w.providerQueue,
        counters: w.localCounters,
      })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
