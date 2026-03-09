import { runSync } from './sync';
import { prisma } from '@repo/shared';
import { getWorkerConfig } from './worker-config';
import { DistributedLock, INSTANCE_ID } from './distributed-lock';

const STARTUP_DELAY_MS = parseInt(process.env.STARTUP_DELAY_MS ?? '5000', 10);

// Lock only for one-time startup cleanup (stale jobs)
const cleanupLock = new DistributedLock('sync-cleanup', 30_000);

async function randomInterval(): Promise<number> {
  const config = await getWorkerConfig();
  return Math.floor(Math.random() * (config.syncIntervalMaxMs - config.syncIntervalMinMs)) + config.syncIntervalMinMs;
}

let syncRunning = false;
let cycleCount = 0;
let nextIntervalMs = 60000;
let lastSyncResult: { success: boolean; elapsed: number; result?: Record<string, unknown>; error?: string } | null = null;

export function getSchedulerState() {
  return {
    syncRunning,
    cycleCount,
    lastSyncResult,
    intervalMs: nextIntervalMs,
    intervalRange: { min: 60000, max: 3600000 },
    startupDelayMs: STARTUP_DELAY_MS,
    instanceId: INSTANCE_ID,
    isLeader: true, // In parallel mode, every instance is a worker
  };
}

/**
 * Parallel worker scheduler.
 * ALL replicas run sync cycles independently.
 * Work is split via atomic listing claiming in sync.ts — each listing is only
 * scraped by one replica per cycle. More replicas = faster cycles.
 */
export async function startScheduler(): Promise<void> {
  const config = await getWorkerConfig();
  console.log(`[scheduler] 🚀 Instance ${INSTANCE_ID.slice(0, 8)} starting — mode: ${config.activeMode}`);
  console.log(`[scheduler] ⏰ ${new Date().toISOString()}`);

  // ── Startup delay + random jitter to stagger replicas ──
  const jitter = Math.floor(Math.random() * 10_000); // 0–10s random jitter
  const totalDelay = STARTUP_DELAY_MS + jitter;
  if (totalDelay > 0) {
    console.log(`[scheduler] ⏳ Waiting ${totalDelay}ms before first sync (${STARTUP_DELAY_MS}ms base + ${jitter}ms jitter)...`);
    await new Promise((r) => setTimeout(r, totalDelay));
  }

  // ── One-time stale job cleanup (first instance to start does this) ──
  if (await cleanupLock.tryAcquire()) {
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
        console.log(`[scheduler] ♻️ Recovered ${staleJobs.count} stale RUNNING job(s)`);
      }
    } catch (err) {
      console.warn('[scheduler] Could not recover stale jobs:', err instanceof Error ? err.message : err);
    }
    await cleanupLock.release();
  }

  // ── All replicas run sync cycles ──
  await runSyncSafe();
  scheduleNext();
}

function scheduleNext(): void {
  randomInterval().then(interval => {
    nextIntervalMs = interval;
    console.log(`[scheduler] 🎲 [${INSTANCE_ID.slice(0, 8)}] Next sync in ${(nextIntervalMs / 1000 / 60).toFixed(1)} min`);
    setTimeout(async () => {
      await runSyncSafe();
      scheduleNext();
    }, nextIntervalMs);
  });
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
