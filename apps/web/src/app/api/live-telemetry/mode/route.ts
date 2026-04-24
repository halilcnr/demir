/**
 * POST /api/live-telemetry/mode  {"mode":"auto"|"god"|"aggressive"|"balanced"|"safe"}
 *
 * Forwards the requested preset to the worker's /ops/config. The worker then
 * invalidates caches and the AutoTuner picks up the new `activeMode` on its
 * next tick (or immediately, for presets that change concurrency directly).
 */

import { NextResponse } from 'next/server';

const WORKER_URL = (process.env.WORKER_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

const VALID_MODES = new Set(['auto', 'god', 'aggressive', 'balanced', 'safe']);

// Preset bodies for non-auto modes. Auto only flips the mode flag — the
// AutoTuner itself mutates concurrency/delay from there.
const PRESET_BODIES: Record<string, Record<string, unknown>> = {
  safe:       { activeMode: 'safe',       globalConcurrency: 1, requestDelayMinMs: 3000, requestDelayMaxMs: 6000 },
  balanced:   { activeMode: 'balanced',   globalConcurrency: 1, requestDelayMinMs: 1500, requestDelayMaxMs: 3000 },
  aggressive: { activeMode: 'aggressive', globalConcurrency: 2, requestDelayMinMs: 800,  requestDelayMaxMs: 1500 },
  god:        { activeMode: 'god',        globalConcurrency: 3, requestDelayMinMs: 300,  requestDelayMaxMs: 800  },
  auto:       { activeMode: 'auto' },
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
