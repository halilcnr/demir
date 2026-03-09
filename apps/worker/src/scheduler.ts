import { runSync } from './sync';
import { prisma } from '@repo/shared';
import { getWorkerConfig } from './worker-config';
import { DistributedLock, INSTANCE_ID } from './distributed-lock';

const STARTUP_DELAY_MS = parseInt(process.env.STARTUP_DELAY_MS ?? '5000', 10);
const LOCK_TTL_MS = 120_000; // 2 minutes — must be longer than max sync duration
const LOCK_RENEW_MS = 30_000; // renew every 30s

const schedulerLock = new DistributedLock('scheduler', LOCK_TTL_MS);

async function randomInterval(): Promise<number> {
  const config = await getWorkerConfig();
  return Math.floor(Math.random() * (config.syncIntervalMaxMs - config.syncIntervalMinMs)) + config.syncIntervalMinMs;
}

let syncRunning = false;
let cycleCount = 0;
let nextIntervalMs = 60000;
let isLeader = false;
let lockRenewTimer: ReturnType<typeof setInterval> | null = null;
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
    isLeader,
  };
}

/**
 * Worker scheduler with distributed leader election.
 * Only the leader instance runs sync cycles.
 * Non-leader replicas stay in standby and try to acquire leadership periodically.
 */
export async function startScheduler(): Promise<void> {
  const config = await getWorkerConfig();
  console.log(`[scheduler] 🚀 Instance ${INSTANCE_ID.slice(0, 8)} starting — mode: ${config.activeMode}, startup delay: ${STARTUP_DELAY_MS}ms`);
  console.log(`[scheduler] ⏰ ${new Date().toISOString()}`);

  // ── Startup delay: let Railway networking stabilize ──
  if (STARTUP_DELAY_MS > 0) {
    console.log(`[scheduler] ⏳ Waiting ${STARTUP_DELAY_MS}ms before first cycle...`);
    await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));
  }

  // Try to become leader
  await tryBecomeLeaderAndRun();
}

async function tryBecomeLeaderAndRun(): Promise<void> {
  const acquired = await schedulerLock.tryAcquire();

  if (acquired) {
    isLeader = true;
    console.log(`[scheduler] 👑 This instance is now the LEADER`);

    // ── Recover stale RUNNING jobs from previous crashes (only leader does this) ──
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

    // Start lock renewal timer
    lockRenewTimer = setInterval(async () => {
      const renewed = await schedulerLock.renew();
      if (!renewed) {
        console.warn(`[scheduler] ⚠️ Lost leadership — stopping sync loop`);
        isLeader = false;
        if (lockRenewTimer) { clearInterval(lockRenewTimer); lockRenewTimer = null; }
        // Fall back to standby mode
        scheduleStandbyCheck();
      }
    }, LOCK_RENEW_MS);

    // Run first sync immediately
    await runSyncSafe();

    // Start the leader sync loop
    scheduleNext();
  } else {
    isLeader = false;
    console.log(`[scheduler] 🔄 Another instance is leader — running as standby (${INSTANCE_ID.slice(0, 8)})`);
    scheduleStandbyCheck();
  }
}

/** Standby replicas try to acquire leadership periodically */
function scheduleStandbyCheck(): void {
  const checkInterval = LOCK_TTL_MS + 10_000; // try after lock could expire
  console.log(`[scheduler] 🕐 Standby check in ${(checkInterval / 1000).toFixed(0)}s`);
  setTimeout(async () => {
    await tryBecomeLeaderAndRun();
  }, checkInterval);
}

function scheduleNext(): void {
  if (!isLeader) return;

  randomInterval().then(interval => {
    nextIntervalMs = interval;
    console.log(`[scheduler] 🎲 Next sync in ${(nextIntervalMs / 1000 / 60).toFixed(1)} min`);
    setTimeout(async () => {
      if (!isLeader) {
        console.log(`[scheduler] No longer leader, skipping sync cycle`);
        return;
      }
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
