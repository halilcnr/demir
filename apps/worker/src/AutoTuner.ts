/**
 * Phase 10 — Autonomous AIMD Engine (Faz 2).
 *
 * Runs on a single leader (DistributedLock("autotuner")). Every 30s it pulls
 * the cluster's rolling telemetry, classifies the state and nudges
 * `globalConcurrency` + `requestDelayMinMs` accordingly.
 *
 * State machine:
 *   CRUISING       — normal, accumulating clean streak
 *   OVERCLOCKING   — additive increase fired this tick
 *   THROTTLING     — multiplicative decrease fired this tick
 *   STARVED        — telemetry gap (sampleCount < threshold) — neither overclock nor brake
 *   DISABLED       — non-auto mode
 *   PAUSED         — auto mode but explicitly frozen (mode='pause' or external freeze)
 *
 * Additive Increase (Overclock):
 *   errorRate == 0 AND p95 < OVERCLOCK_P95_MS for 2 consecutive ticks
 *     → concurrency += 2, delayMin -= 100ms
 *     → cleanStreak decays by 1 (not reset to 0) so successive overclocks
 *       only need 1 more clean tick → ~30s instead of 60s acceleration.
 *
 * Multiplicative Decrease (Emergency Brake):
 *   any 429/403/503 error OR p95 > BRAKE_P95_MS
 *     → concurrency = floor(concurrency / 2), delayMin *= 2
 *
 * Persistence (Faz 2):
 *   Every tick is written to AutoTunerHistory (DB) so leader restarts don't
 *   lose retrospective data. Used by /api/live-telemetry?since=... range queries.
 */

import { prisma } from '@repo/shared';
import { DistributedLock, INSTANCE_ID } from './distributed-lock';
import { getAIMDTelemetry, getAIMDTelemetryByProvider, type AIMDTelemetry, type ProviderAIMDTelemetry } from './telemetry';
import { getWorkerConfig, invalidateConfigCache, type WorkerSettings } from './worker-config';
import { getClusterAvgTrust } from './services/trust-score';
import { getRecentMuteRate } from './services/price-seal';

// ─── Tuning bounds (hard safety rails) ──────────────────────────

export const BOUNDS = {
  concurrency: { min: 1, max: 40 },
  delayMinMs:  { min: 100, max: 10_000 },
};

// ─── AIMD thresholds ─────────────────────────────────────────────

const OVERCLOCK_P95_MS = 1500;
const OVERCLOCK_STREAK_REQUIRED = 2;
const BRAKE_P95_MS = 5000;
const STARVATION_SAMPLE_THRESHOLD = 10;

const TUNER_LOCK_TTL_MS = 90_000;   // survives a missed tick
const TICK_INTERVAL_MS  = 30_000;
const HISTORY_MAX       = 120;      // 2 hours of minutely points (in-memory)

// ─── Engine state machine ───────────────────────────────────────

export type EngineState =
  | 'CRUISING'
  | 'OVERCLOCKING'
  | 'THROTTLING'
  | 'STARVED'
  | 'DEGRADED'        // V5: mute-rate spike → likely scraper bug, hold tuning
  | 'DISABLED'
  | 'PAUSED';

// V5: mute-rate sinyali
const DEGRADED_MUTE_PER_HOUR = 12;        // ≥12 new mutes in last 1h → DEGRADED
const TRUST_DERATE_FLOOR = 0.6;           // never derate below 60% of base concurrency

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
  /** Per-provider sinyal (Faz 2) — AIMD kararlarına henüz girmiyor, sadece UI'a sunuluyor. */
  perProvider: ProviderAIMDTelemetry[];
  /** Time-in-state (Faz 2) — bu state'e en son ne zaman girdik */
  stateEnteredAt: number | null;
  /** Leader churn (Faz 2) — son leader değişimi */
  lastLeaderChangeAt: number | null;
  /** V5: avg retailer trustScore at last tick — drives effective concurrency */
  avgTrustScore: number;
  /** V5: derate factor applied to base concurrency (1.0 = no derate) */
  trustDerateFactor: number;
  /** V5: new MuteEvent count in last 1h — input to DEGRADED detection */
  recentMutesPerHour: number;
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
  perProvider: [],
  stateEnteredAt: null,
  lastLeaderChangeAt: null,
  avgTrustScore: 100,
  trustDerateFactor: 1.0,
  recentMutesPerHour: 0,
};

const tunerLock = new DistributedLock('autotuner', TUNER_LOCK_TTL_MS);

export function getTunerState(): TunerState & { bounds: typeof BOUNDS } {
  return { ...tuner, history: [...tuner.history], bounds: BOUNDS };
}

// ─── Core AIMD decision ──────────────────────────────────────────

type Decision =
  | { kind: 'cruise' }
  | { kind: 'overclock'; newConcurrency: number; newDelayMin: number }
  | { kind: 'brake'; newConcurrency: number; newDelayMin: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

type Classification = 'brake' | 'overclock' | 'cruise' | 'starved';

function classify(t: AIMDTelemetry, cleanStreak: number): Classification {
  // Starvation: telemetri sessiz, motor körlüğe gitmesin
  if (t.sampleCount < STARVATION_SAMPLE_THRESHOLD) {
    return 'starved';
  }

  const hardErrors = t.errors429 + t.errors403 + t.errors503;
  const latencyBad = t.p95LatencyMs > BRAKE_P95_MS;
  if (hardErrors > 0 || latencyBad) return 'brake';

  const cleanNow =
    t.errorRate === 0 &&
    t.p95LatencyMs > 0 &&
    t.p95LatencyMs < OVERCLOCK_P95_MS;

  if (cleanNow && cleanStreak + 1 >= OVERCLOCK_STREAK_REQUIRED) return 'overclock';
  return 'cruise';
}

function decide(cfg: WorkerSettings, t: AIMDTelemetry, cleanStreak: number): Decision {
  const cls = classify(t, cleanStreak);

  if (cls === 'brake') {
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

  if (cls === 'overclock') {
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
  tuner.perProvider = getAIMDTelemetryByProvider();

  // V5: pull retailer trust + mute-rate signals (cached, cheap).
  const [avgTrust, muteRate] = await Promise.all([
    getClusterAvgTrust().catch(() => 100),
    getRecentMuteRate().catch(() => ({ ratePerHour: 0, newMutes: 0, totalListings: 0, mutedListings: 0 })),
  ]);
  tuner.avgTrustScore = avgTrust;
  tuner.recentMutesPerHour = muteRate.ratePerHour;
  // Derate factor: trustScore=100 → 1.0, trustScore=60 → 0.6 (floor).
  // Çöp retailer scrape budget yemesin diye base concurrency'yi düşürür.
  tuner.trustDerateFactor = Math.max(TRUST_DERATE_FLOOR, avgTrust / 100);

  // Track state transitions for time-in-state metric
  const previousState = tuner.state;

  // Non-auto modes: observe only, don't tune.
  if (cfg.activeMode === 'pause') {
    tuner.state = 'PAUSED';
    await pushHistory(t, cfg, tuner.state, null);
    return;
  }
  if (cfg.activeMode !== 'auto') {
    tuner.state = 'DISABLED';
    await pushHistory(t, cfg, tuner.state, null);
    return;
  }

  // V5: DEGRADED — ani mute-rate spike = scraper bug ihtimali yüksek.
  // AIMD bu state'te tuning değişikliği yapmaz; admin müdahalesi bekler.
  if (muteRate.ratePerHour >= DEGRADED_MUTE_PER_HOUR) {
    tuner.state = 'DEGRADED';
    tuner.lastAction = `DEGRADED — ${muteRate.newMutes} new mutes/hour (≥${DEGRADED_MUTE_PER_HOUR}). Tuning paused, investigate parser.`;
    if (previousState !== 'DEGRADED') {
      console.warn(`[auto-tuner] 🚧 ${tuner.lastAction}`);
    }
    if (tuner.state !== previousState) tuner.stateEnteredAt = Date.now();
    await pushHistory(t, cfg, tuner.state, tuner.lastAction);
    return;
  }

  const decision = decide(cfg, t, tuner.cleanStreak);

  if (decision.kind === 'brake') {
    tuner.state = 'THROTTLING';
    tuner.cleanStreak = 0;
    // V5: derate doesn't kick in on brake — we WANT the floor.
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
    // Decay streak by 1 (keep momentum) instead of resetting to 0.
    // Sonuç: peş peşe overclock için 1 ek temiz tick yeterli (~30s yerine 60s).
    tuner.cleanStreak = Math.max(0, tuner.cleanStreak - 1);
    // V5: trust-derate the target concurrency. Düşük trust cluster'ında
    // agresif overclock yapma — gereksiz banlanmaya açar.
    const targetConc = clamp(
      Math.round(decision.newConcurrency * tuner.trustDerateFactor),
      BOUNDS.concurrency.min,
      BOUNDS.concurrency.max,
    );
    const updated = await publishConfig(
      { globalConcurrency: targetConc, requestDelayMinMs: decision.newDelayMin },
      cfg,
    );
    tuner.concurrency = updated.globalConcurrency;
    tuner.delayMinMs = updated.requestDelayMinMs;
    tuner.delayMaxMs = updated.requestDelayMaxMs;
    tuner.lastActionAt = Date.now();
    const trustNote = tuner.trustDerateFactor < 0.999
      ? ` [trust-derated ×${tuner.trustDerateFactor.toFixed(2)} — avgTrust=${Math.round(tuner.avgTrustScore)}]`
      : '';
    tuner.lastAction = `OVERCLOCK → conc ${cfg.globalConcurrency}→${updated.globalConcurrency}, delay ${cfg.requestDelayMinMs}→${updated.requestDelayMinMs}ms${trustNote}`;
    console.log(`[auto-tuner] 🚀 Status: OVERCLOCKING. Pushing the limits. ${tuner.lastAction} (p95:${t.p95LatencyMs}ms, errRate:${t.errorRate}%)`);
  } else {
    // 'cruise' veya 'starved'. Starvation'ı ayrı state olarak tut.
    const cls = classify(t, tuner.cleanStreak);
    if (cls === 'starved') {
      tuner.state = 'STARVED';
      // Streak resetlenmez — gelen telemetri eski streak'i devam ettirsin
    } else {
      const cleanNow =
        t.errorRate === 0 &&
        t.p95LatencyMs > 0 &&
        t.p95LatencyMs < OVERCLOCK_P95_MS &&
        t.sampleCount >= STARVATION_SAMPLE_THRESHOLD;
      tuner.cleanStreak = cleanNow ? tuner.cleanStreak + 1 : 0;
      tuner.state = 'CRUISING';
    }
  }

  // Time-in-state book-keeping
  if (tuner.state !== previousState) {
    tuner.stateEnteredAt = Date.now();
  } else if (tuner.stateEnteredAt == null) {
    tuner.stateEnteredAt = Date.now();
  }

  await pushHistory(
    t,
    { ...cfg, globalConcurrency: tuner.concurrency, requestDelayMinMs: tuner.delayMinMs },
    tuner.state,
    tuner.lastAction,
  );
}

async function pushHistory(
  t: AIMDTelemetry,
  cfg: WorkerSettings,
  state: EngineState,
  action: string | null,
): Promise<void> {
  const ts = Date.now();
  tuner.history.push({
    ts,
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

  // Faz 2: DB persistence — leader restart'ta history kaybolmasın
  await prisma.autoTunerHistory.create({
    data: {
      ts: new Date(ts),
      state,
      activeMode: cfg.activeMode,
      concurrency: cfg.globalConcurrency,
      delayMinMs: cfg.requestDelayMinMs,
      scrapesPerMin: t.scrapesPerMin,
      p95LatencyMs: t.p95LatencyMs,
      errorRate: t.errorRate,
      errors429: t.errors429,
      errors403: t.errors403,
      errors503: t.errors503,
      sampleCount: t.sampleCount,
      cleanStreak: tuner.cleanStreak,
      action,
      leaderWorkerId: tuner.leader,
    },
  }).catch((err: unknown) => {
    console.warn('[auto-tuner] history persist failed:', err instanceof Error ? err.message : err);
  });
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
      const newLeader = acquired ? INSTANCE_ID : null;
      if (newLeader !== tuner.leader) {
        tuner.lastLeaderChangeAt = Date.now();
      }
      tuner.leader = newLeader;
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
