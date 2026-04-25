/**
 * POST /api/live-telemetry/mode  {"mode":"auto"|"god"|"aggressive"|"balanced"|"safe"|"pause"}
 *
 * Forwards the requested preset to the worker's /ops/config. The worker then
 * invalidates caches and the AutoTuner picks up the new `activeMode` on its
 * next tick (or immediately, for presets that change concurrency directly).
 *
 * Tüm MODE_PRESETS alanları (jitterPercent, cooldownMultiplier, blockCooldownMinutes,
 * maxRetries, syncInterval*) buradan gönderilir — eski sürümde sadece 4 alan
 * gidiyordu, "god" gerçek god değildi. Pause: özel mod, motoru dondur ama
 * telemetri toplamaya devam et.
 */

import { NextResponse } from 'next/server';

const WORKER_URL = (process.env.WORKER_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

const VALID_MODES = new Set(['auto', 'god', 'aggressive', 'balanced', 'safe', 'pause']);

// Preset bodies — tüm WorkerConfig alanları dolu. AutoTuner overlay'leri (auto modunda)
// concurrency/delay'i dinamik değiştirir; pause hiçbir şey değiştirmez.
const PRESET_BODIES: Record<string, Record<string, unknown>> = {
  safe: {
    activeMode: 'safe',
    globalConcurrency: 1,
    providerConcurrency: 1,
    requestDelayMinMs: 3000,
    requestDelayMaxMs: 6000,
    jitterPercent: 40,
    maxRetries: 1,
    cooldownMultiplier: 2.0,
    blockCooldownMinutes: 15,
    syncIntervalMinMs: 300_000,
    syncIntervalMaxMs: 3_600_000,
  },
  balanced: {
    activeMode: 'balanced',
    globalConcurrency: 1,
    providerConcurrency: 1,
    requestDelayMinMs: 1500,
    requestDelayMaxMs: 3000,
    jitterPercent: 30,
    maxRetries: 2,
    cooldownMultiplier: 1.5,
    blockCooldownMinutes: 10,
    syncIntervalMinMs: 60_000,
    syncIntervalMaxMs: 3_600_000,
  },
  aggressive: {
    activeMode: 'aggressive',
    globalConcurrency: 2,
    providerConcurrency: 1,
    requestDelayMinMs: 800,
    requestDelayMaxMs: 1500,
    jitterPercent: 25,
    maxRetries: 2,
    cooldownMultiplier: 1.3,
    blockCooldownMinutes: 5,
    syncIntervalMinMs: 30_000,
    syncIntervalMaxMs: 900_000,
  },
  god: {
    activeMode: 'god',
    globalConcurrency: 3,
    providerConcurrency: 2,
    requestDelayMinMs: 300,
    requestDelayMaxMs: 800,
    jitterPercent: 20,
    maxRetries: 3,
    cooldownMultiplier: 1.2,
    blockCooldownMinutes: 3,
    syncIntervalMinMs: 15_000,
    syncIntervalMaxMs: 300_000,
  },
  auto: {
    activeMode: 'auto',
    providerConcurrency: 1,
    jitterPercent: 25,
    maxRetries: 2,
    cooldownMultiplier: 1.4,
    blockCooldownMinutes: 5,
    syncIntervalMinMs: 30_000,
    syncIntervalMaxMs: 600_000,
    // Not: globalConcurrency / requestDelay* gönderilmiyor — AutoTuner
    // mevcut değerden başlayıp dinamik adapt eder.
  },
  pause: {
    activeMode: 'pause',
    // Sadece bayrak — diğer alanlar değişmez.
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? '').toLowerCase();
    if (!VALID_MODES.has(mode)) {
      return NextResponse.json({ ok: false, error: 'invalid mode' }, { status: 400 });
    }

    const workerRes = await fetch(`${WORKER_URL}/ops/config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(TRIGGER_SECRET ? { Authorization: `Bearer ${TRIGGER_SECRET}` } : {}),
      },
      body: JSON.stringify(PRESET_BODIES[mode]),
      signal: AbortSignal.timeout(5_000),
    });

    const payload = await workerRes.json().catch(() => ({}));
    return NextResponse.json({ ok: workerRes.ok, mode, worker: payload }, { status: workerRes.status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
