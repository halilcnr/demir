/**
 * Live telemetry — rolling 60s window for p50/p95 scrape latency.
 *
 * Hourly snapshots (scrape-health.ts) are for trend analysis, not for a
 * dashboard that updates every few seconds. This module keeps a small
 * in-memory ring per process so /telemetry can answer "how is it going
 * right now?" without scanning the DB.
 *
 * Cross-worker visibility:
 *   - Each worker exposes its own rolling stats via /telemetry
 *   - The web app calls /telemetry on every online worker (list from
 *     worker-identity heartbeats) and aggregates
 *   - No COUNT(*) on live tables — queue depth comes from DB but against
 *     the (status,priority) index on ScrapeTask which is O(index-range-scan)
 */

interface LatencySample {
  ts: number;       // epoch ms
  latencyMs: number;
  retailerSlug: string;
  ok: boolean;
}

const WINDOW_MS = 60_000;
const MAX_SAMPLES = 2000; // safety cap — typical 60s load is ~100-300 samples
const samples: LatencySample[] = [];

function prune(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (samples.length > 0 && samples[0].ts < cutoff) samples.shift();
  // Safety cap: if a worker gets hammered, keep only the newest MAX_SAMPLES
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function recordScrapeLatency(retailerSlug: string, latencyMs: number, ok: boolean): void {
  samples.push({ ts: Date.now(), latencyMs, retailerSlug, ok });
  prune();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function getRollingLatency(): {
  windowMs: number;
  sampleCount: number;
  scrapesPerSec: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
  perProvider: Record<string, { count: number; p50: number; p95: number; successRate: number }>;
} {
  prune();
  const all = samples.map(s => s.latencyMs).sort((a, b) => a - b);
  const oks = samples.filter(s => s.ok).length;

  const perProvider: Record<string, { count: number; p50: number; p95: number; successRate: number }> = {};
  const byProv = new Map<string, LatencySample[]>();
  for (const s of samples) {
    if (!byProv.has(s.retailerSlug)) byProv.set(s.retailerSlug, []);
    byProv.get(s.retailerSlug)!.push(s);
  }
  for (const [slug, arr] of byProv) {
    const sorted = arr.map(s => s.latencyMs).sort((a, b) => a - b);
    const okCount = arr.filter(s => s.ok).length;
    perProvider[slug] = {
      count: arr.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      successRate: arr.length > 0 ? Math.round((okCount / arr.length) * 1000) / 10 : 0,
    };
  }

  return {
    windowMs: WINDOW_MS,
    sampleCount: samples.length,
    // Rolling throughput: scrapes observed in the last window, per second.
    // One decimal precision — at low volume this is often <1/sec.
    scrapesPerSec: Math.round((samples.length / (WINDOW_MS / 1000)) * 10) / 10,
    p50: percentile(all, 50),
    p95: percentile(all, 95),
    p99: percentile(all, 99),
    successRate: samples.length > 0 ? Math.round((oks / samples.length) * 1000) / 10 : 0,
    perProvider,
  };
}
