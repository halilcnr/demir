/**
 * Worker Identity & Heartbeat System.
 *
 * Each worker instance registers itself in the DB and sends periodic heartbeats.
 * This enables cluster monitoring — we can see how many workers are online,
 * what each one is doing, and detect crashed workers.
 */

import { prisma } from '@repo/shared';
import { hostname } from 'os';
import { randomUUID } from 'crypto';

/** Unique ID for this worker process */
export const WORKER_ID = `${hostname()}-${randomUUID().slice(0, 8)}`;

const HEARTBEAT_INTERVAL_MS = 30_000; // 30s (reduced from 10s to save DB calls)
const WORKER_TIMEOUT_MS = 90_000;     // Consider dead after 90s no heartbeat

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let localTasksCompleted = 0;
let localTasksFailed = 0;
let localTasksSkipped = 0;
let taskTimesMs: number[] = [];
let currentStatus: 'idle' | 'busy' | 'stopping' = 'idle';
let currentTaskId: string | null = null;
let localConcurrency = 5;

/** Register this worker and start heartbeats */
export async function startWorkerIdentity(concurrency: number): Promise<void> {
  localConcurrency = concurrency;

  await prisma.workerHeartbeat.upsert({
    where: { id: WORKER_ID },
    create: {
      id: WORKER_ID,
      hostname: hostname(),
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
      status: 'idle',
      concurrency,
    },
    update: {
      hostname: hostname(),
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
      status: 'idle',
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksSkipped: 0,
      avgTaskTimeMs: 0,
      concurrency,
    },
  });

  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`[worker-id] Registered as ${WORKER_ID} (concurrency: ${concurrency})`);
}

/** Stop heartbeats and mark as stopping */
export async function stopWorkerIdentity(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  await prisma.workerHeartbeat.updateMany({
    where: { id: WORKER_ID },
    data: { status: 'stopping', lastHeartbeatAt: new Date() },
  }).catch(() => {});
}

/** Update heartbeat in DB */
async function sendHeartbeat(): Promise<void> {
  const avgTime = taskTimesMs.length > 0
    ? taskTimesMs.reduce((a, b) => a + b, 0) / taskTimesMs.length
    : 0;

  await prisma.workerHeartbeat.updateMany({
    where: { id: WORKER_ID },
    data: {
      lastHeartbeatAt: new Date(),
      status: currentStatus,
      currentTaskId,
      tasksCompleted: localTasksCompleted,
      tasksFailed: localTasksFailed,
      tasksSkipped: localTasksSkipped,
      avgTaskTimeMs: Math.round(avgTime),
      concurrency: localConcurrency,
    },
  });
}

/** Record a completed task */
export function recordTaskComplete(durationMs: number): void {
  localTasksCompleted++;
  taskTimesMs.push(durationMs);
  if (taskTimesMs.length > 100) taskTimesMs = taskTimesMs.slice(-100);
}

/** Record a failed task */
export function recordTaskFailed(): void {
  localTasksFailed++;
}

/** Record a skipped task */
export function recordTaskSkipped(): void {
  localTasksSkipped++;
}

/** Update worker status */
export function setWorkerStatus(status: 'idle' | 'busy' | 'stopping'): void {
  currentStatus = status;
}

/** Set currently processing task */
export function setCurrentTask(taskId: string | null): void {
  currentTaskId = taskId;
}

/** Get local worker stats */
export function getLocalWorkerStats() {
  const avgTime = taskTimesMs.length > 0
    ? Math.round(taskTimesMs.reduce((a, b) => a + b, 0) / taskTimesMs.length)
    : 0;
  return {
    workerId: WORKER_ID,
    status: currentStatus,
    currentTaskId,
    tasksCompleted: localTasksCompleted,
    tasksFailed: localTasksFailed,
    tasksSkipped: localTasksSkipped,
    avgTaskTimeMs: avgTime,
    concurrency: localConcurrency,
  };
}

/** Get all workers in the cluster */
export async function getClusterWorkers() {
  const cutoff = new Date(Date.now() - WORKER_TIMEOUT_MS);
  const all = await prisma.workerHeartbeat.findMany({
    orderBy: { lastHeartbeatAt: 'desc' },
  });

  return all.map(w => ({
    ...w,
    isAlive: w.lastHeartbeatAt > cutoff,
  }));
}

/** Count online workers */
export async function getOnlineWorkerCount(): Promise<number> {
  const cutoff = new Date(Date.now() - WORKER_TIMEOUT_MS);
  return prisma.workerHeartbeat.count({
    where: { lastHeartbeatAt: { gt: cutoff } },
  });
}

/** Clean up dead worker records older than 1 hour */
export async function cleanupDeadWorkers(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60_000);
  const result = await prisma.workerHeartbeat.deleteMany({
    where: { lastHeartbeatAt: { lt: cutoff } },
  });
  return result.count;
}
