/**
 * Phase 10 — Autonomous AIMD Engine.
 *
 * Runs on a single leader (DistributedLock("autotuner")). Every 30s it pulls
 * the cluster's rolling telemetry, classifies the state (CRUISING, OVERCLOCKING,
 * THROTTLING) and nudges `globalConcurrency` + `requestDelayMinMs` accordingly.
 *
 * Additive Increase (Overclock):
 *   errorRate == 0 AND p95 < 1500ms for 2 consecutive ticks
 *     → concurrency += 2, delayMin -= 100ms
 *
 * Multiplicative Decrease (Emergency Brake):
 *   any 429/403/503 error OR p95 > 4000ms
 *     → concurrency = floor(concurrency / 2), delayMin *= 2
 *
 * Only engages when `activeMode === 'auto'`. Other modes (safe/balanced/
 * aggressive/god) get a free pass — the AutoTuner records telemetry but does
 * not mutate config.
 */

import { prisma } from '@repo/shared';
import { DistributedLock, INSTANCE_ID } from './distributed-lock';
import { getAIMDTelemetry, type AIMDTelemetry } from './telemetry';
import { getWorkerConfig, invalidateConfigCache, type WorkerSettings } from './worker-config';

// ─── Tuning bounds (hard safety rails) ──────────────────────────

const BOUNDS = {
  concurrency: { min: 1, max: 40 },
  delayMinMs:  { min: 100, max: 10_000 },
};

// ─── AIMD thresholds ─────────────────────────────────────────────

const OVERCLOCK_P95_MS = 1500;
const OVERCLOCK_STREAK_REQUIRED = 2;
const BRAKE_P95_MS = 5000;

const TUNER_LOCK_TTL_MS = 90_000;   // survives a missed tick
const TICK_INTERVAL_MS  = 30_000;
const HISTORY_MAX       = 120;      // 2 hours of minutely points

// ─── Engine state machine ───────────────────────────────────────

export type EngineState = 'CRUISING' | 'OVERCLOCKING' | 'THROTTLING' | 'DISABLED';

export interface TunerHistoryPoint {
  ts: number;
  state: EngineState;
  concurrency: number;
  delayMinMs: number;
  scrapesPerMin: number;
  p95LatencyMs: number;
  errorRate: number;
  errors429: number;
  errors403: number;
  errors503: number;
}

export interface TunerState {
  state: EngineState;
  leader: string | null;
  activeMode: string;
  concurrency: number;
  delayMinMs: number;
  delayMaxMs: number;
  cleanStreak: number;           // consecutive clean minutes
  lastTickAt: number | null;
  lastActionAt: number | null;
  lastAction: string | null;
  telemetry: AIMDTelemetry | null;
  history: TunerHistoryPoint[];
}

const tuner: TunerState = {
  state: 'DISABLED',
  leader: null,
  activeMode: 'balanced',
  concurrency: 1,
  delayMinMs: 1500,
  delayMaxMs: 3000,
  cleanStreak: 0,
  lastTickAt: null,
  lastActionAt: null,
  lastAction: null,
  telemetry: null,
  history: [],
};

const tunerLock = new DistributedLock('autotuner', TUNER_LOCK_TTL_MS);

export function getTunerState(): TunerState {
  return { ...tuner, history: [...tuner.history] };
}

// ─── Core AIMD decision ──────────────────────────────────────────

type Decision =
  | { kind: 'cruise' }
  | { kind: 'overclock'; newConcurrency: number; newDelayMin: number }
  | { kind: 'brake'; newConcurrency: number; newDelayMin: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function decide(cfg: WorkerSettings, t: AIMDTelemetry, cleanStreak: number): Decision {
  const hardErrors = t.errors429 + t.errors403 + t.errors503;
  const latencyBad = t.p95LatencyMs > BRAKE_P95_MS;

  // Multiplicative Decrease — any tarpit signal wins immediately.
  if (hardErrors > 0 || latencyBad) {
    const newConcurrency = clamp(
      Math.floor(cfg.globalConcurrency / 2),
      BOUNDS.concurrency.min,
      BOUNDS.concurrency.max,
    );
    const newDelayMin = clamp(
      cfg.requestDelayMinMs * 2,
      BOUNDS.delayMinMs.min,
      BOUNDS.delayMinMs.max,
    );
    return { kind: 'brake', newConcurrency, newDelayMin };
  }

  // Additive Increase — needs streak AND samples (don't overclock on silence).
  const cleanNow =
    t.errorRate === 0 &&
    t.p95LatencyMs > 0 &&
    t.p95LatencyMs < OVERCLOCK_P95_MS &&
    t.sampleCount >= 10;

  if (cleanNow && cleanStreak + 1 >= OVERCLOCK_STREAK_REQUIRED) {
    const newConcurrency = clamp(
      cfg.globalConcurrency + 2,
      BOUNDS.concurrency.min,
      BOUNDS.concurrency.max,
    );
    const newDelayMin = clamp(
      cfg.requestDelayMinMs - 100,
      BOUNDS.delayMinMs.min,
      BOUNDS.delayMinMs.max,
    );
    return { kind: 'overclock', newConcurrency, newDelayMin };
  }

  return { kind: 'cruise' };
}

// ─── Publish a new config across the cluster ────────────────────

async function publishConfig(updates: Partial<WorkerSettings>, currentCfg: WorkerSettings): Promise<WorkerSettings> {
  const merged: WorkerSettings = { ...currentCfg, ...updates };

  // Keep delayMax > delayMin automatically.
  if (merged.requestDelayMaxMs < merged.requestDelayMinMs * 1.5) {
    merged.requestDelayMaxMs = Math.round(merged.requestDelayMinMs * 2);
  }

  // Postgres — durable mirror for cold starts.
  await prisma.workerConfig.upsert({
    where: { id: 'default' },
    update: {
      globalConcurrency: merged.globalConcurrency,
      requestDelayMinMs: merged.requestDelayMinMs,
      requestDelayMaxMs: merged.requestDelayMaxMs,
    },
    create: { id: 'default', ...merged },
  }).catch((err) => {
    console.error('[auto-tuner] postgres write failed:', err instanceof Error ? err.message : err);
  });

  // Postgres-only fan-out: each replica picks up the new row within 5s via
  // the worker-config cache TTL. Good enough at cluster size ≤15.
  invalidateConfigCache();
  return merged;
}

// ─── One tick of the engine ─────────────────────────────────────

async function runTick(): Promise<void> {
  tuner.lastTickAt = Date.now();

  const cfg = await getWorkerConfig();
  tuner.activeMode = cfg.activeMode;
  tuner.concurrency = cfg.globalConcurrency;
  tuner.delayMinMs = cfg.requestDelayMinMs;
  tuner.delayMaxMs = cfg.requestDelayMaxMs;

  const t = getAIMDTelemetry();
  tuner.telemetry = t;

  // Non-auto modes: observe only, don't tune.
  if (cfg.activeMode !== 'auto') {
    tuner.state = 'DISABLED';
    pushHistory(t, cfg, tuner.state);
    // (tuner state is served to the UI via the in-memory getTunerState())
    return;
  }

  const decision = decide(cfg, t, tuner.cleanStreak);

  if (decision.kind === 'brake') {
    tuner.state = 'THROTTLING';
    tuner.cleanStreak = 0;
    const updated = await publishConfig(
      { globalConcurrency: decision.newConcurrency, requestDelayMinMs: decision.newDelayMin },
      cfg,
    );
    tuner.concurrency = updated.globalConcurrency;
    tuner.delayMinMs = updated.requestDelayMinMs;
    tuner.delayMaxMs = updated.requestDelayMaxMs;
    tuner.lastActionAt = Date.now();
    tuner.lastAction = `BRAKE → conc ${cfg.globalConcurrency}→${updated.globalConcurrency}, delay ${cfg.requestDelayMinMs}→${updated.requestDelayMinMs}ms`;
    console.log(`[auto-tuner] 🛑 Status: THROTTLING. Tarpit detected. ${tuner.lastAction} (429:${t.errors429} 403:${t.errors403} 503:${t.errors503} p95:${t.p95LatencyMs}ms)`);
  } else if (decision.kind === 'overclock') {
    tuner.state = 'OVERCLOCKING';
    tuner.cleanStreak = 0; // reset after acting so we need another 2 clean ticks
    const updated = await publishConfig(
      { globalConcurrency: decision.newConcurrency, requestDelayMinMs: decision.newDelayMin },
      cfg,
    );
    tuner.concurrency = updated.globalConcurrency;
    tuner.delayMinMs = updated.requestDelayMinMs;
    tuner.delayMaxMs = updated.requestDelayMaxMs;
    tuner.lastActionAt = Date.now();
    tuner.lastAction = `OVERCLOCK → conc ${cfg.globalConcurrency}→${updated.globalConcurrency}, delay ${cfg.requestDelayMinMs}→${updated.requestDelayMinMs}ms`;
    console.log(`[auto-tuner] 🚀 Status: OVERCLOCKING. Pushing the limits. ${tuner.lastAction} (p95:${t.p95LatencyMs}ms, errRate:${t.errorRate}%)`);
  } else {
    // CRUISING — maintain streak counter for future overclock eligibility.
    const cleanNow =
      t.errorRate === 0 &&
      t.p95LatencyMs > 0 &&
      t.p95LatencyMs < OVERCLOCK_P95_MS &&
      t.sampleCount >= 10;
    tuner.cleanStreak = cleanNow ? tuner.cleanStreak + 1 : 0;
    tuner.state = 'CRUISING';
  }

  pushHistory(t, { ...cfg, globalConcurrency: tuner.concurrency, requestDelayMinMs: tuner.delayMinMs }, tuner.state);
}

function pushHistory(t: AIMDTelemetry, cfg: WorkerSettings, state: EngineState): void {
  tuner.history.push({
    ts: Date.now(),
    state,
    concurrency: cfg.globalConcurrency,
    delayMinMs: cfg.requestDelayMinMs,
    scrapesPerMin: t.scrapesPerMin,
    p95LatencyMs: t.p95LatencyMs,
    errorRate: t.errorRate,
    errors429: t.errors429,
    errors403: t.errors403,
    errors503: t.errors503,
  });
  if (tuner.history.length > HISTORY_MAX) tuner.history.shift();
}

// ─── Public bootstrap ────────────────────────────────────────────

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startAutoTuner(): Promise<void> {
  if (running) return;
  running = true;

  const tick = async () => {
    try {
      // Single leader model — only the holder of the lock runs AIMD math.
      const acquired = await tunerLock.tryAcquire();
      tuner.leader = acquired ? INSTANCE_ID : null;
      if (!acquired) return;
      await runTick();
    } catch (err) {
      console.error('[auto-tuner] tick failed:', err instanceof Error ? err.message : err);
    }
  };

  // First tick on a short delay so the worker finishes boot-up first.
  setTimeout(() => { void tick(); }, 5_000);
  timer = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
}

export async function stopAutoTuner(): Promise<void> {
  running = false;
  if (timer) { clearInterval(timer); timer = null; }
  await tunerLock.release().catch(() => {});
}
