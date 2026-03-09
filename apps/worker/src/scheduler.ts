import { prisma } from '@repo/shared';
import { getWorkerConfig } from './worker-config';
import { DistributedLock } from './distributed-lock';
import { WORKER_ID } from './worker-identity';
import { generateTasks, getActiveSyncJobId, hasPendingTasks, finalizeSyncJob, recoverStaleTasks, cleanupOldTasks, getTaskQueueStats } from './task-queue';
import { processTasksUntilDone, getTaskWorkerState } from './task-worker';
import { resetCycleState } from './provider-health';
import { clearSyncLogs, addSyncLog, finishSyncLogs, updateSyncProgress } from './sync-logger';
import { resetAllConcurrency } from './distributed-rate-limiter';

const STARTUP_DELAY_MS = parseInt(process.env.STARTUP_DELAY_MS ?? '5000', 10);

// Leader lock — only one worker generates tasks per cycle
const taskGenLock = new DistributedLock('task-generator', 120_000);
// Cleanup lock — one-time stale recovery
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
  const tw = getTaskWorkerState();
  return {
    syncRunning: syncRunning || tw.isProcessing,
    cycleCount,
    lastSyncResult,
    intervalMs: nextIntervalMs,
    intervalRange: { min: 60000, max: 3600000 },
    startupDelayMs: STARTUP_DELAY_MS,
    instanceId: WORKER_ID,
    isLeader: true, // All workers participate
  };
}

/**
 * Distributed task-based scheduler.
 *
 * Flow per cycle:
 * 1. One worker (leader via lock) generates tasks for all listings → ScrapeTask table
 * 2. ALL workers poll for pending tasks → claim & process concurrently
 * 3. When all tasks are done, leader finalizes the SyncJob
 *
 * This gives linear scaling: more workers = faster cycles.
 */
export async function startScheduler(): Promise<void> {
  const config = await getWorkerConfig();
  console.log(`[scheduler] 🚀 Worker ${WORKER_ID.slice(0, 12)} starting — mode: ${config.activeMode}`);
  console.log(`[scheduler] ⏰ ${new Date().toISOString()}`);

  // Startup delay + jitter to stagger
  const jitter = Math.floor(Math.random() * 10_000);
  const totalDelay = STARTUP_DELAY_MS + jitter;
  if (totalDelay > 0) {
    console.log(`[scheduler] ⏳ Waiting ${totalDelay}ms (${STARTUP_DELAY_MS}ms + ${jitter}ms jitter)...`);
    await new Promise(r => setTimeout(r, totalDelay));
  }

  // One-time cleanup on first-to-start worker
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
      if (staleJobs.count > 0) console.log(`[scheduler] ♻️ Recovered ${staleJobs.count} stale job(s)`);

      await recoverStaleTasks();
      await resetAllConcurrency();
      await cleanupOldTasks().then(n => { if (n > 0) console.log(`[scheduler] 🗑️ Cleaned ${n} old tasks`); });
    } catch (err) {
      console.warn('[scheduler] Cleanup error:', err instanceof Error ? err.message : err);
    }
    await cleanupLock.release();
  }

  // First cycle
  await runCycle();
  scheduleNext();
}

function scheduleNext(): void {
  randomInterval().then(interval => {
    nextIntervalMs = interval;
    console.log(`[scheduler] 🎲 [${WORKER_ID.slice(0, 12)}] Next sync in ${(nextIntervalMs / 1000 / 60).toFixed(1)} min`);
    setTimeout(async () => {
      await runCycle();
      scheduleNext();
    }, nextIntervalMs);
  });
}

/**
 * Run one sync cycle:
 * - If no active sync job → try to become leader and generate tasks
 * - If active sync job with pending tasks → process them
 * - If all done → finalize
 */
async function runCycle(): Promise<void> {
  if (syncRunning) {
    console.warn('[scheduler] ⚠️ Cycle already running, skipping');
    return;
  }

  syncRunning = true;
  cycleCount++;
  const cycle = cycleCount;
  const startTime = Date.now();
  console.log(`[scheduler] ── Cycle #${cycle} ── ${new Date().toISOString()}`);

  resetCycleState();
  clearSyncLogs();

  try {
    // Check if there's already an active sync job with tasks
    let syncJobId = await getActiveSyncJobId();

    if (!syncJobId) {
      // No active job — try to generate tasks (only one worker does this)
      if (await taskGenLock.tryAcquire()) {
        // Double-check after acquiring lock (another worker may have just created a job)
        syncJobId = await getActiveSyncJobId();
        if (!syncJobId) {
          addSyncLog({ type: 'info', message: 'Yeni sync döngüsü başlatılıyor...' });
          const { syncJobId: newJobId, taskCount } = await generateTasks();
          syncJobId = newJobId;
          console.log(`[scheduler] 📋 Generated ${taskCount} tasks (job: ${syncJobId.slice(0, 8)})`);
          addSyncLog({ type: 'info', message: `${taskCount} görev oluşturuldu` });
        }
        await taskGenLock.release();
      } else {
        // Another worker is generating tasks — wait a moment then check again
        await new Promise(r => setTimeout(r, 3000));
        syncJobId = await getActiveSyncJobId();
      }
    }

    if (!syncJobId) {
      console.log(`[scheduler] No sync job to process`);
      lastSyncResult = { success: true, elapsed: 0 };
      syncRunning = false;
      return;
    }

    // Process tasks from the queue
    const result = await processTasksUntilDone(syncJobId);

    const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
    lastSyncResult = {
      success: true,
      elapsed,
      result: result as unknown as Record<string, unknown>,
    };

    // Check if all tasks are done — if so, finalize the sync job
    const stillPending = await hasPendingTasks();
    if (!stillPending) {
      // Try to be the one to finalize
      const finLock = new DistributedLock(`finalize-${syncJobId.slice(0, 8)}`, 30_000);
      if (await finLock.tryAcquire()) {
        // Verify job is still RUNNING (not already finalized by another worker)
        const job = await prisma.syncJob.findUnique({ where: { id: syncJobId }, select: { status: true } });
        if (job?.status === 'RUNNING') {
          await finalizeSyncJob(syncJobId);
          finishSyncLogs();
          updateSyncProgress({ running: false, progress: 100, step: 'completed', processedListings: 0, successCount: 0, failureCount: 0, blockedCount: 0, currentRetailer: null, currentVariant: null });
        }
        await finLock.release();
      }
    }

    console.log(
      `[scheduler] ✅ Cycle #${cycle} done (${elapsed}s): ` +
      `${result.succeeded} OK, ${result.failed} fail, ${result.skipped} skip`
    );
  } catch (err) {
    const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
    const msg = err instanceof Error ? err.message : String(err);
    lastSyncResult = { success: false, elapsed, error: msg };
    console.error(`[scheduler] ❌ Cycle #${cycle} failed (${elapsed}s):`, msg);
  } finally {
    syncRunning = false;
  }
}
