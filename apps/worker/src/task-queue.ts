/**
 * Distributed Task Queue.
 *
 * Manages the lifecycle of scrape tasks:
 * - generateTasks(): Creates tasks for all active listings at the start of a sync cycle
 * - claimTasks(): Workers pull available tasks using atomic DB updates (like SELECT FOR UPDATE SKIP LOCKED)
 * - completeTask() / failTask() / skipTask(): Mark task outcomes
 * - recoverStaleTasks(): Re-queue tasks stuck in IN_PROGRESS beyond a timeout
 *
 * Provider-safe rotation: Tasks are claimed round-robin across providers to avoid
 * hitting the same retailer consecutively.
 */

import { prisma } from '@repo/shared';
import { WORKER_ID } from './worker-identity';

const TASK_LOCK_TIMEOUT_MS = 5 * 60_000; // 5 minutes — tasks stuck longer are recoverable

/**
 * Generate scrape tasks for all active listings.
 * Called by one worker (leader) at the start of each sync cycle.
 * Returns the syncJobId.
 */
export async function generateTasks(
  retailerSlug?: string,
  variantId?: string,
): Promise<{ syncJobId: string; taskCount: number }> {
  const listings = await prisma.listing.findMany({
    where: {
      isActive: true,
      productUrl: { not: '' },
      ...(retailerSlug ? { retailer: { slug: retailerSlug } } : {}),
      ...(variantId ? { variantId } : {}),
      retailer: { isActive: true },
    },
    include: {
      variant: { include: { family: true } },
      retailer: true,
    },
    orderBy: [
      { variant: { family: { sortOrder: 'asc' } } },
      { variant: { storageGb: 'asc' } },
    ],
  });

  // Filter out search/browse URLs
  const validListings = listings.filter(l =>
    !l.productUrl.includes('/search?q=') &&
    !l.productUrl.includes('/ara?q=') &&
    !l.productUrl.includes('/arama?q=') &&
    !l.productUrl.includes('/s?k=') &&
    !l.productUrl.includes('/sr?q=')
  );

  const syncJob = await prisma.syncJob.create({
    data: {
      retailerId: retailerSlug
        ? (await prisma.retailer.findUnique({ where: { slug: retailerSlug } }))?.id
        : undefined,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  if (validListings.length === 0) {
    return { syncJobId: syncJob.id, taskCount: 0 };
  }

  // Provider-safe rotation: interleave retailers so tasks alternate providers
  // Group by retailer slug, then round-robin pick one from each group
  const byProvider = new Map<string, typeof validListings>();
  for (const l of validListings) {
    const slug = l.retailer.slug;
    if (!byProvider.has(slug)) byProvider.set(slug, []);
    byProvider.get(slug)!.push(l);
  }

  const rotated: typeof validListings = [];
  const providerQueues = [...byProvider.values()];
  let idx = 0;
  while (rotated.length < validListings.length) {
    for (const q of providerQueues) {
      if (idx < q.length) {
        rotated.push(q[idx]);
      }
    }
    idx++;
  }

  // Batch insert tasks with priority (higher priority = dequeued first)
  const taskData = rotated.map((l, i) => ({
    syncJobId: syncJob.id,
    listingId: l.id,
    retailerSlug: l.retailer.slug,
    variantLabel: `${l.variant.family.name} ${l.variant.color} ${l.variant.storageGb}GB`,
    productUrl: l.productUrl,
    priority: rotated.length - i, // First items get highest priority
  }));

  // Insert in batches of 500
  for (let i = 0; i < taskData.length; i += 500) {
    await prisma.scrapeTask.createMany({
      data: taskData.slice(i, i + 500),
    });
  }

  console.log(`[task-queue] Generated ${taskData.length} tasks for syncJob ${syncJob.id}`);
  return { syncJobId: syncJob.id, taskCount: taskData.length };
}

/**
 * Claim a batch of tasks for this worker.
 * Uses atomic updateMany to prevent two workers from claiming the same task.
 * Returns tasks with provider rotation built in.
 */
export async function claimTasks(batchSize: number): Promise<ClaimedTask[]> {
  const now = new Date();

  // Find available PENDING tasks, ordered by priority DESC (provider-rotated order)
  const available = await prisma.scrapeTask.findMany({
    where: { status: 'PENDING' },
    orderBy: { priority: 'desc' },
    take: batchSize * 3, // Overfetch to have choices after provider filtering
    select: { id: true, retailerSlug: true },
  });

  if (available.length === 0) return [];

  // Provider-aware selection: pick tasks that spread across providers
  const selected: string[] = [];
  const providerCounts = new Map<string, number>();

  for (const task of available) {
    if (selected.length >= batchSize) break;
    const count = providerCounts.get(task.retailerSlug) ?? 0;
    // Prefer providers with fewer tasks already selected
    if (count < Math.ceil(batchSize / 3)) {
      selected.push(task.id);
      providerCounts.set(task.retailerSlug, count + 1);
    }
  }

  // Fill remaining slots if we didn't reach batchSize
  if (selected.length < batchSize) {
    for (const task of available) {
      if (selected.length >= batchSize) break;
      if (!selected.includes(task.id)) {
        selected.push(task.id);
      }
    }
  }

  if (selected.length === 0) return [];

  // Bulk claim: try to claim all selected tasks in one shot, then fetch claimed ones
  const claimed: ClaimedTask[] = [];

  // Atomically claim all selected tasks that are still PENDING
  for (const taskId of selected) {
    const result = await prisma.scrapeTask.updateMany({
      where: { id: taskId, status: 'PENDING' },
      data: {
        status: 'IN_PROGRESS',
        lockedBy: WORKER_ID,
        lockedAt: now,
      },
    });
    if (result.count > 0) {
      claimed.push({ id: taskId } as ClaimedTask); // placeholder
    }
  }

  if (claimed.length === 0) return [];

  // Single bulk fetch for all claimed task data (instead of N individual findUnique)
  const claimedIds = claimed.map(c => c.id);
  const fullTasks = await prisma.scrapeTask.findMany({
    where: { id: { in: claimedIds } },
    select: {
      id: true,
      syncJobId: true,
      listingId: true,
      retailerSlug: true,
      variantLabel: true,
      productUrl: true,
    },
  });

  return fullTasks.map(task => ({
    id: task.id,
    syncJobId: task.syncJobId,
    listingId: task.listingId,
    retailerSlug: task.retailerSlug,
    variantLabel: task.variantLabel,
    productUrl: task.productUrl,
  }));
}

export interface ClaimedTask {
  id: string;
  syncJobId: string;
  listingId: string;
  retailerSlug: string;
  variantLabel: string;
  productUrl: string;
}

/** Mark a task as successfully completed */
export async function completeTask(
  taskId: string,
  result: { price?: number; responseTimeMs?: number },
): Promise<void> {
  await prisma.scrapeTask.updateMany({
    where: { id: taskId, lockedBy: WORKER_ID },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      resultPrice: result.price ?? null,
      resultStatus: 'success',
      responseTimeMs: result.responseTimeMs ?? null,
    },
  });
}

/** Mark a task as failed */
export async function failTask(
  taskId: string,
  error: string,
  resultStatus: string = 'failure',
): Promise<void> {
  await prisma.scrapeTask.updateMany({
    where: { id: taskId, lockedBy: WORKER_ID },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      resultStatus,
      errorMessage: error.slice(0, 500),
    },
  });
}

/** Mark a task as skipped (e.g. circuit breaker open, rate limited) */
export async function skipTask(taskId: string, reason: string): Promise<void> {
  await prisma.scrapeTask.updateMany({
    where: { id: taskId, lockedBy: WORKER_ID },
    data: {
      status: 'SKIPPED',
      completedAt: new Date(),
      resultStatus: 'skipped',
      errorMessage: reason.slice(0, 500),
    },
  });
}

/**
 * Recover tasks stuck in IN_PROGRESS beyond the lock timeout.
 * These are from crashed workers. Reset them to PENDING.
 */
export async function recoverStaleTasks(): Promise<number> {
  const threshold = new Date(Date.now() - TASK_LOCK_TIMEOUT_MS);
  const result = await prisma.scrapeTask.updateMany({
    where: {
      status: 'IN_PROGRESS',
      lockedAt: { lt: threshold },
    },
    data: {
      status: 'PENDING',
      lockedBy: null,
      lockedAt: null,
    },
  });

  if (result.count > 0) {
    console.log(`[task-queue] Recovered ${result.count} stale tasks`);
  }

  return result.count;
}

/** Get task queue statistics for a sync job */
export async function getTaskQueueStats(syncJobId?: string) {
  const where = syncJobId ? { syncJobId } : {};

  const groups = await prisma.scrapeTask.groupBy({
    by: ['status'],
    where,
    _count: true,
  });

  const counts: Record<string, number> = {};
  for (const g of groups) {
    counts[g.status] = g._count;
  }

  const pending = counts['PENDING'] ?? 0;
  const inProgress = counts['IN_PROGRESS'] ?? 0;
  const completed = counts['COMPLETED'] ?? 0;
  const failed = counts['FAILED'] ?? 0;
  const skipped = counts['SKIPPED'] ?? 0;

  return {
    pending,
    inProgress,
    completed,
    failed,
    skipped,
    total: pending + inProgress + completed + failed + skipped,
  };
}

/** Get the currently active sync job ID (latest RUNNING) */
export async function getActiveSyncJobId(): Promise<string | null> {
  const job = await prisma.syncJob.findFirst({
    where: { status: 'RUNNING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return job?.id ?? null;
}

/** Check if there are any pending tasks in the current sync */
export async function hasPendingTasks(): Promise<boolean> {
  const jobId = await getActiveSyncJobId();
  if (!jobId) return false;
  const count = await prisma.scrapeTask.count({
    where: { syncJobId: jobId, status: 'PENDING' },
  });
  return count > 0;
}

/** Finalize a sync job — aggregate task results and update the SyncJob record */
export async function finalizeSyncJob(syncJobId: string): Promise<void> {
  const stats = await getTaskQueueStats(syncJobId);

  const startJob = await prisma.syncJob.findUnique({
    where: { id: syncJobId },
    select: { startedAt: true },
  });

  const durationMs = startJob?.startedAt
    ? Date.now() - startJob.startedAt.getTime()
    : null;

  await prisma.syncJob.update({
    where: { id: syncJobId },
    data: {
      status: 'COMPLETED',
      finishedAt: new Date(),
      itemsScanned: stats.completed + stats.failed,
      itemsMatched: stats.completed,
      successCount: stats.completed,
      failureCount: stats.failed,
      blockedCount: stats.skipped,
      durationMs,
    },
  });

  console.log(
    `[task-queue] SyncJob ${syncJobId} finalized: ` +
    `${stats.completed} completed, ${stats.failed} failed, ${stats.skipped} skipped`
  );
}

/** Clean up old operational records to prevent table bloat.
 *  - ScrapeTask: 48h (operational, high volume ~25K/day)
 *  - SyncJob:    30d (completed/failed only)
 *  - DealEvent:  90d
 *  - NotificationLog: 30d
 *  - AlertEvent: 90d (read only; unread kept indefinitely)
 *  ⚠️ PriceSnapshot is NEVER deleted — sacred price history.
 */
export async function cleanupOldTasks(): Promise<number> {
  const now = Date.now();
  const hrs48  = new Date(now - 48 * 60 * 60_000);
  const days30 = new Date(now - 30 * 24 * 60 * 60_000);
  const days90 = new Date(now - 90 * 24 * 60 * 60_000);

  const [tasks, syncJobs, deals, notifs, alerts] = await Promise.all([
    prisma.scrapeTask.deleteMany({ where: { createdAt: { lt: hrs48 } } }),
    prisma.syncJob.deleteMany({
      where: { status: { in: ['COMPLETED', 'FAILED'] }, createdAt: { lt: days30 } },
    }),
    prisma.dealEvent.deleteMany({ where: { detectedAt: { lt: days90 } } }),
    prisma.notificationLog.deleteMany({ where: { createdAt: { lt: days30 } } }),
    prisma.alertEvent.deleteMany({ where: { isRead: true, triggeredAt: { lt: days90 } } }),
  ]);

  const total = tasks.count + syncJobs.count + deals.count + notifs.count + alerts.count;
  if (total > 0) {
    console.log(
      `[cleanup] 🗑️ Removed: ${tasks.count} tasks, ${syncJobs.count} syncJobs, ` +
      `${deals.count} dealEvents, ${notifs.count} notifLogs, ${alerts.count} alertEvents`
    );
  }
  return total;
}

// ─── Emergency Scrape Queue ─────────────────────────────────────
// Rate limit: max 10 emergency scrapes per hour globally
const EMERGENCY_SCRAPE_MAX_PER_HOUR = 10;
const EMERGENCY_PRIORITY = 99999;

let emergencyScrapeCount = 0;
let emergencyScrapeWindowStart = Date.now();

/**
 * Enqueue high-priority scrape tasks for stale blocker listings.
 * These are BAYAT listings whose old price might undercut a real deal —
 * they need immediate verification.
 */
export async function enqueueEmergencyScrape(listingIds: string[]): Promise<number> {
  if (listingIds.length === 0) return 0;

  // Rate limit reset per hour window
  const now = Date.now();
  if (now - emergencyScrapeWindowStart > 60 * 60_000) {
    emergencyScrapeCount = 0;
    emergencyScrapeWindowStart = now;
  }

  const remaining = EMERGENCY_SCRAPE_MAX_PER_HOUR - emergencyScrapeCount;
  if (remaining <= 0) {
    console.log(`[task-queue] Emergency scrape rate limit hit (${EMERGENCY_SCRAPE_MAX_PER_HOUR}/h), skipping ${listingIds.length} listings`);
    return 0;
  }

  const toScrape = listingIds.slice(0, remaining);

  // Fetch listing metadata for task creation
  const listings = await prisma.listing.findMany({
    where: { id: { in: toScrape } },
    include: {
      retailer: { select: { slug: true } },
      variant: { include: { family: true } },
    },
  });

  if (listings.length === 0) return 0;

  // Get or create an active sync job
  let syncJobId = await getActiveSyncJobId();
  if (!syncJobId) {
    const job = await prisma.syncJob.create({
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    syncJobId = job.id;
  }

  const taskData = listings.map(l => ({
    syncJobId: syncJobId!,
    listingId: l.id,
    retailerSlug: l.retailer.slug,
    variantLabel: `[EMERGENCY] ${l.variant.family.name} ${l.variant.color} ${l.variant.storageGb}GB`,
    productUrl: l.productUrl,
    priority: EMERGENCY_PRIORITY,
  }));

  await prisma.scrapeTask.createMany({ data: taskData });
  emergencyScrapeCount += taskData.length;

  console.log(`[task-queue] Enqueued ${taskData.length} emergency scrape tasks (${emergencyScrapeCount}/${EMERGENCY_SCRAPE_MAX_PER_HOUR} this hour)`);
  return taskData.length;
}
