import { runSync } from './sync';
import { prisma } from '@repo/shared';

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? '7200000', 10); // Default: 2 saat (aggressive)
const STARTUP_DELAY_MS = parseInt(process.env.STARTUP_DELAY_MS ?? '5000', 10); // Grace period after restart

let syncRunning = false;
let cycleCount = 0;
let lastSyncResult: { success: boolean; elapsed: number; result?: Record<string, unknown>; error?: string } | null = null;

export function getSchedulerState() {
  return {
    syncRunning,
    cycleCount,
    lastSyncResult,
    intervalMs: SYNC_INTERVAL_MS,
    startupDelayMs: STARTUP_DELAY_MS,
  };
}

/**
 * Worker scheduler: Aggressive but safe periodic sync.
 * - Runs first sync after a brief startup delay (restart-safe)
 * - Checks for stale RUNNING jobs from previous crashes and marks them FAILED
 * - Logs startup and recovery events
 */
export async function startScheduler(): Promise<void> {
  console.log(`[scheduler] 🚀 Worker starting — sync interval: ${SYNC_INTERVAL_MS / 1000 / 60} min, startup delay: ${STARTUP_DELAY_MS}ms`);
  console.log(`[scheduler] ⏰ ${new Date().toISOString()}`);

  // ── Recover from previous crash: mark stale RUNNING jobs as FAILED ──
  try {
    const staleJobs = await prisma.syncJob.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        lastErrorMessage: 'Worker restarted — previous sync was interrupted',
      },
    });
    if (staleJobs.count > 0) {
      console.log(`[scheduler] ♻️ Recovered ${staleJobs.count} stale RUNNING job(s) from previous crash`);
    }
  } catch (err) {
    console.warn('[scheduler] Could not recover stale jobs:', err instanceof Error ? err.message : err);
  }

  // ── Startup delay: let Railway networking stabilize ──
  if (STARTUP_DELAY_MS > 0) {
    console.log(`[scheduler] ⏳ Waiting ${STARTUP_DELAY_MS}ms before first sync...`);
    await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));
  }

  // İlk sync'i hemen çalıştır
  await runSyncSafe();

  // Periyodik sync
  setInterval(runSyncSafe, SYNC_INTERVAL_MS);
}

async function runSyncSafe(): Promise<void> {
  if (syncRunning) {
    console.warn('[scheduler] ⚠️ Sync already running, skipping this cycle');
    return;
  }

  syncRunning = true;
  cycleCount++;
  const cycle = cycleCount;
  const startTime = Date.now();
  console.log(`[scheduler] ── Cycle #${cycle} starting ── ${new Date().toISOString()}`);

  try {
    const result = await runSync();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    lastSyncResult = { success: true, elapsed: parseFloat(elapsed), result: result as unknown as Record<string, unknown> };
    console.log(
      `[scheduler] ✅ Cycle #${cycle} completed (${elapsed}s): ` +
      `${result.itemsScanned} scanned, ${result.itemsMatched} matched, ${result.dealsFound} deals`
    );
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = error instanceof Error ? error.message : String(error);
    lastSyncResult = { success: false, elapsed: parseFloat(elapsed), error: msg };
    console.error(`[scheduler] ❌ Cycle #${cycle} failed (${elapsed}s):`, msg);
  } finally {
    syncRunning = false;
  }
}
