/**
 * Phase 10 — Live telemetry feed for LiveCommandCenter.
 *
 * Proxies the worker's /auto-tune (AIMD state + history) and aggregates
 * /telemetry across replicas so the UI has a single endpoint to poll.
 * Dashboard polls every 3s — keep this route cheap.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

function normalizeWorkerUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return 'http://localhost:3001';
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

interface WorkerTelemetrySnippet {
  workerId: string;
  concurrency: number;
  rollingLatency: {
    scrapesPerSec: number;
    p95: number;
    successRate: number;
    sampleCount: number;
  };
  aimd?: {
    sampleCount: number;
    scrapesPerMin: number;
    p95LatencyMs: number;
    successRate: number;
    errorRate: number;
    errors429: number;
    errors403: number;
    errors503: number;
    totalErrors: number;
  };
}

interface TunerSnapshot {
  workerId: string;
  state: 'CRUISING' | 'OVERCLOCKING' | 'THROTTLING' | 'DISABLED';
  leader: string | null;
  activeMode: string;
  concurrency: number;
  delayMinMs: number;
  delayMaxMs: number;
  cleanStreak: number;
  lastTickAt: number | null;
  lastActionAt: number | null;
  lastAction: string | null;
  history: Array<{
    ts: number;
    state: string;
    concurrency: number;
    delayMinMs: number;
    scrapesPerMin: number;
    p95LatencyMs: number;
    errorRate: number;
    errors429: number;
    errors403: number;
    errors503: number;
  }>;
}

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 90_000);
    const onlineWorkers = await prisma.workerHeartbeat.count({
      where: { lastHeartbeatAt: { gt: cutoff } },
    });
    const fanout = Math.max(1, Math.min(onlineWorkers * 3, 30));

    // Parallel: fetch /auto-tune (AIMD) and /telemetry (rolling stats) from all replicas
    const pulls = await Promise.allSettled([
      ...Array.from({ length: fanout }, () =>
        fetch(`${WORKER_URL}/auto-tune`, { signal: AbortSignal.timeout(3_000), cache: 'no-store' })
          .then(r => (r.ok ? (r.json() as Promise<TunerSnapshot>) : null))
          .catch(() => null),
      ),
      ...Array.from({ length: fanout }, () =>
        fetch(`${WORKER_URL}/telemetry`, { signal: AbortSignal.timeout(3_000), cache: 'no-store' })
          .then(r => (r.ok ? (r.json() as Promise<WorkerTelemetrySnippet>) : null))
          .catch(() => null),
      ),
    ]);

    const tunerById = new Map<string, TunerSnapshot>();
    const telemetryById = new Map<string, WorkerTelemetrySnippet>();
    for (let i = 0; i < pulls.length; i++) {
      const r = pulls[i];
      if (r.status !== 'fulfilled' || !r.value) continue;
      if (i < fanout) tunerById.set(r.value.workerId, r.value as TunerSnapshot);
      else telemetryById.set(r.value.workerId, r.value as WorkerTelemetrySnippet);
    }

    // The leader's snapshot is the authoritative one for engine state + history.
    const tuners = [...tunerById.values()];
    const leader = tuners.find(t => t.leader && t.leader === t.workerId) ?? tuners[0] ?? null;

    // Cluster-wide concurrency sum — what's actually running on the cluster right now
    const totalConcurrency = [...telemetryById.values()].reduce((s, w) => s + (w.concurrency ?? 0), 0);
    const totalScrapesPerMin = [...telemetryById.values()].reduce(
      (s, w) => s + (w.aimd?.scrapesPerMin ?? Math.round((w.rollingLatency?.scrapesPerSec ?? 0) * 60)),
      0,
    );
    const allP95 = [...telemetryById.values()]
      .map(w => w.aimd?.p95LatencyMs ?? w.rollingLatency?.p95 ?? 0)
      .filter(n => n > 0);
    const clusterP95 = allP95.length ? Math.max(...allP95) : 0;
    const totalErrors = [...telemetryById.values()].reduce(
      (s, w) => s + (w.aimd?.totalErrors ?? 0),
      0,
    );
    const totalSamples = [...telemetryById.values()].reduce(
      (s, w) => s + (w.aimd?.sampleCount ?? w.rollingLatency?.sampleCount ?? 0),
      0,
    );
    const clusterErrorRate = totalSamples > 0
      ? Math.round((totalErrors / totalSamples) * 1000) / 10
      : 0;

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      onlineWorkers,
      reachedWorkers: telemetryById.size,
      engine: leader
        ? {
            state: leader.state,
            activeMode: leader.activeMode,
            cleanStreak: leader.cleanStreak,
            leaderWorkerId: leader.leader,
            lastTickAt: leader.lastTickAt,
            lastActionAt: leader.lastActionAt,
            lastAction: leader.lastAction,
            perWorkerConcurrency: leader.concurrency,
            delayMinMs: leader.delayMinMs,
            delayMaxMs: leader.delayMaxMs,
          }
        : null,
      cluster: {
        totalConcurrency,
        scrapesPerMin: totalScrapesPerMin,
        p95LatencyMs: clusterP95,
        errorRate: clusterErrorRate,
        totalErrors,
        sampleCount: totalSamples,
      },
      history: leader?.history ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
