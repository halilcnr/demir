import { prisma } from '@repo/shared';
import { createResilientInterval } from './backoff';

// ─── Circuit Breaker States ─────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number | null;
  halfOpenAttempts: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 5;    // Open after N consecutive failures
const CIRCUIT_WINDOW_MS = 5 * 60_000;  // 5 min rolling window
const CIRCUIT_OPEN_DURATION_MS = 3 * 60_000; // Stay open for 3 min
const CIRCUIT_HALF_OPEN_MAX = 2;       // Max test requests in half-open

const circuits = new Map<string, CircuitBreakerEntry>();

function getCircuit(slug: string): CircuitBreakerEntry {
  if (!circuits.has(slug)) {
    circuits.set(slug, {
      state: 'closed',
      failureCount: 0,
      lastFailureAt: 0,
      openedAt: null,
      halfOpenAttempts: 0,
    });
  }
  return circuits.get(slug)!;
}

export function getCircuitState(slug: string): CircuitState {
  const c = getCircuit(slug);
  
  // Auto-transition from open to half_open after timeout
  if (c.state === 'open' && c.openedAt && (Date.now() - c.openedAt) >= CIRCUIT_OPEN_DURATION_MS) {
    c.state = 'half_open';
    c.halfOpenAttempts = 0;
    console.log(`[circuit-breaker] ${slug}: OPEN → HALF_OPEN (testing)`);
  }

  return c.state;
}

export function recordCircuitSuccess(slug: string): void {
  const c = getCircuit(slug);
  if (c.state === 'half_open') {
    c.state = 'closed';
    c.failureCount = 0;
    c.openedAt = null;
    console.log(`[circuit-breaker] ${slug}: HALF_OPEN → CLOSED (recovered)`);
  } else if (c.state === 'closed') {
    c.failureCount = 0;
  }
}

export function recordCircuitFailure(slug: string): void {
  const c = getCircuit(slug);
  const now = Date.now();

  // Reset count if outside window
  if (now - c.lastFailureAt > CIRCUIT_WINDOW_MS) {
    c.failureCount = 0;
  }

  c.failureCount++;
  c.lastFailureAt = now;

  if (c.state === 'half_open') {
    c.halfOpenAttempts++;
    if (c.halfOpenAttempts >= CIRCUIT_HALF_OPEN_MAX) {
      c.state = 'open';
      c.openedAt = now;
      console.log(`[circuit-breaker] ${slug}: HALF_OPEN → OPEN (still failing)`);
    }
  } else if (c.state === 'closed' && c.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    c.state = 'open';
    c.openedAt = now;
    console.log(`[circuit-breaker] ${slug}: CLOSED → OPEN (threshold reached: ${c.failureCount} failures in window)`);
  }
}

export function isCircuitOpen(slug: string): boolean {
  return getCircuitState(slug) === 'open';
}

export function getAllCircuitStates(): Record<string, { state: CircuitState; failureCount: number }> {
  const result: Record<string, { state: CircuitState; failureCount: number }> = {};
  for (const [slug, c] of circuits) {
    result[slug] = { state: getCircuitState(slug), failureCount: c.failureCount };
  }
  return result;
}

// ─── Metrics Collector ──────────────────────────────────────────

interface MetricEvent {
  timestamp: number;
  type: 'success' | 'failure' | 'blocked' | 'rate_limited' | 'timeout';
  responseTimeMs: number;
}

// Rolling window per provider (last 5 min)
const metricsWindow = new Map<string, MetricEvent[]>();
const METRICS_WINDOW_MS = 5 * 60_000;

function getMetrics(slug: string): MetricEvent[] {
  if (!metricsWindow.has(slug)) {
    metricsWindow.set(slug, []);
  }
  return metricsWindow.get(slug)!;
}

function pruneOld(events: MetricEvent[]): MetricEvent[] {
  const cutoff = Date.now() - METRICS_WINDOW_MS;
  return events.filter(e => e.timestamp > cutoff);
}

export function recordMetricEvent(slug: string, type: MetricEvent['type'], responseTimeMs: number): void {
  const events = getMetrics(slug);
  events.push({ timestamp: Date.now(), type, responseTimeMs });
  // Prune old events periodically
  if (events.length > 200) {
    metricsWindow.set(slug, pruneOld(events));
  }
}

export interface ProviderLiveMetrics {
  slug: string;
  totalRequests5m: number;
  successRate5m: number;
  blockRate5m: number;
  avgLatency5m: number;
  p95Latency5m: number;
  riskScore: number;
  healthScore: number;
  circuitState: CircuitState;
}

export function computeProviderMetrics(slug: string): ProviderLiveMetrics {
  const raw = pruneOld(getMetrics(slug));
  metricsWindow.set(slug, raw);

  const total = raw.length;
  if (total === 0) {
    return {
      slug,
      totalRequests5m: 0,
      successRate5m: 100,
      blockRate5m: 0,
      avgLatency5m: 0,
      p95Latency5m: 0,
      riskScore: 0,
      healthScore: 100,
      circuitState: getCircuitState(slug),
    };
  }

  const successes = raw.filter(e => e.type === 'success').length;
  const blocked = raw.filter(e => e.type === 'blocked').length;
  const rateLimited = raw.filter(e => e.type === 'rate_limited').length;

  const successRate = (successes / total) * 100;
  const blockRate = ((blocked + rateLimited) / total) * 100;

  const latencies = raw.map(e => e.responseTimeMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] ?? avgLatency;

  // Risk score: 0-100
  // Formula: (0.4 * 4xxRate) + (0.3 * latencyTrend) + (0.3 * failureRate)
  const fourXxRate = blockRate / 100;
  const latencyNormalized = Math.min(avgLatency / 10000, 1); // Normalize to 0-1 (10s max)
  const failureRate = 1 - (successRate / 100);
  const riskScore = Math.round(((0.4 * fourXxRate) + (0.3 * latencyNormalized) + (0.3 * failureRate)) * 100);

  // Health score: inverse of risk
  const healthScore = Math.max(0, 100 - riskScore);

  return {
    slug,
    totalRequests5m: total,
    successRate5m: Math.round(successRate * 10) / 10,
    blockRate5m: Math.round(blockRate * 10) / 10,
    avgLatency5m: Math.round(avgLatency),
    p95Latency5m: Math.round(p95Latency),
    riskScore: Math.min(100, riskScore),
    healthScore: Math.max(0, healthScore),
    circuitState: getCircuitState(slug),
  };
}

export function getAllProviderLiveMetrics(): ProviderLiveMetrics[] {
  const slugs = new Set([...metricsWindow.keys(), ...circuits.keys()]);
  return [...slugs].map(slug => computeProviderMetrics(slug));
}

// ─── Persist Metrics to DB (called periodically) ────────────────

export async function persistMetricsToDB(): Promise<void> {
  const allMetrics = getAllProviderLiveMetrics();
  for (const m of allMetrics) {
    try {
      await prisma.providerMetrics.upsert({
        where: { retailerSlug: m.slug },
        create: {
          retailerSlug: m.slug,
          successRate5m: m.successRate5m,
          blockRate5m: m.blockRate5m,
          avgLatency5m: m.avgLatency5m,
          healthScore: m.healthScore,
          riskScore: m.riskScore,
          circuitState: m.circuitState,
        },
        update: {
          successRate5m: m.successRate5m,
          blockRate5m: m.blockRate5m,
          avgLatency5m: m.avgLatency5m,
          healthScore: m.healthScore,
          riskScore: m.riskScore,
          circuitState: m.circuitState,
          lastResponseTimeMs: m.avgLatency5m,
        },
      });
    } catch (err) {
      // Non-fatal; metrics are also available in-memory.
      // But log it so we know about DB degradation.
      console.error(`[metrics] Failed to persist metrics for ${m.slug}:`, err instanceof Error ? err.message : err);
    }
  }
}

// ─── Batched Provider Counter (in-memory → periodic DB flush) ───

type CounterField = 'successCount' | 'failureCount' | 'blockedCount' | 'rateLimitCount' | 'timeoutCount';

const pendingCounters = new Map<string, Map<CounterField, number>>();
const COUNTER_FLUSH_INTERVAL_MS = 15_000; // flush every 15s

/** Increment a provider counter in memory (0 DB calls). */
export function incrementProviderCounter(slug: string, field: CounterField): void {
  let slugCounters = pendingCounters.get(slug);
  if (!slugCounters) {
    slugCounters = new Map();
    pendingCounters.set(slug, slugCounters);
  }
  slugCounters.set(field, (slugCounters.get(field) ?? 0) + 1);
}

/** Flush pending counters to DB (called periodically). */
async function flushProviderCounters(): Promise<void> {
  if (pendingCounters.size === 0) return;

  const snapshot = new Map(pendingCounters);
  pendingCounters.clear();

  for (const [slug, fields] of snapshot) {
    const updates: Record<string, { increment: number }> = {};
    let totalIncrement = 0;
    for (const [field, count] of fields) {
      updates[field] = { increment: count };
      totalIncrement += count;
    }
    updates['totalRequests'] = { increment: totalIncrement };

    try {
      await prisma.providerMetrics.upsert({
        where: { retailerSlug: slug },
        create: {
          retailerSlug: slug,
          totalRequests: totalIncrement,
          ...Object.fromEntries([...fields].map(([f, c]) => [f, c])),
        },
        update: updates,
      });
    } catch (err) {
      // Non-fatal — counters are approximate, but log the error
      console.error(`[metrics] Failed to flush counters for ${slug}:`, err instanceof Error ? err.message : err);
    }
  }
}

// Start the flush timer with exponential backoff
createResilientInterval(
  'counter-flush',
  () => flushProviderCounters(),
  COUNTER_FLUSH_INTERVAL_MS,
);

// ─── Risk Level Helpers ─────────────────────────────────────────

export type RiskLevel = 'safe' | 'balanced' | 'aggressive' | 'risky' | 'very_risky';

export function getRiskLevel(score: number): RiskLevel {
  if (score < 15) return 'safe';
  if (score < 35) return 'balanced';
  if (score < 55) return 'aggressive';
  if (score < 75) return 'risky';
  return 'very_risky';
}

export function computeGlobalRiskScore(metrics: ProviderLiveMetrics[]): number {
  if (metrics.length === 0) return 0;
  const avgRisk = metrics.reduce((sum, m) => sum + m.riskScore, 0) / metrics.length;
  const maxRisk = Math.max(...metrics.map(m => m.riskScore));
  // Weighted: 60% average, 40% worst provider
  return Math.round(avgRisk * 0.6 + maxRisk * 0.4);
}
