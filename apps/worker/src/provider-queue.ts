import { getWorkerConfig } from './worker-config';
import { isCircuitOpen } from './metrics-collector';
import { isBlockedThisCycle, isInCooldown } from './provider-health';

// ─── Provider Queue ─────────────────────────────────────────────
// Manages per-provider and global concurrency to prevent overloading.

interface QueueItem {
  slug: string;
  task: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

// Tracks how many concurrent requests are running per provider
const providerActive = new Map<string, number>();
let globalActive = 0;
const queue: QueueItem[] = [];
let processing = false;

function getProviderActive(slug: string): number {
  return providerActive.get(slug) ?? 0;
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const config = await getWorkerConfig();

    // Find next eligible item
    let idx = -1;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const slug = item.slug;

      // Skip if global concurrency full
      if (globalActive >= config.globalConcurrency) break;

      // Skip if provider concurrency full
      if (getProviderActive(slug) >= config.providerConcurrency) continue;

      // Skip if circuit is open
      if (isCircuitOpen(slug)) continue;

      // Skip if blocked/cooldown
      if (isBlockedThisCycle(slug) || isInCooldown(slug)) continue;

      idx = i;
      break;
    }

    if (idx === -1) {
      // No eligible items; wait a bit and retry
      if (queue.length > 0 && globalActive > 0) {
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
      break;
    }

    const item = queue.splice(idx, 1)[0];
    globalActive++;
    providerActive.set(item.slug, getProviderActive(item.slug) + 1);

    // Execute without waiting (allow parallel)
    item.task()
      .then(() => item.resolve())
      .catch((err) => item.reject(err instanceof Error ? err : new Error(String(err))))
      .finally(() => {
        globalActive--;
        const active = getProviderActive(item.slug) - 1;
        if (active <= 0) {
          providerActive.delete(item.slug);
        } else {
          providerActive.set(item.slug, active);
        }
        // Re-kick processing
        processQueue().catch(() => {});
      });

    // Small yield
    await new Promise(r => setTimeout(r, 10));
  }

  processing = false;
}

/**
 * Enqueue a provider scrape task. Returns a promise that resolves when the task completes.
 * Respects global + per-provider concurrency limits.
 */
export function enqueueProviderTask(slug: string, task: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    queue.push({ slug, task, resolve, reject });
    processQueue().catch(() => {});
  });
}

/** Current queue depth */
export function getQueueDepth(): number {
  return queue.length;
}

/** Currently active requests */
export function getActiveRequests(): { global: number; perProvider: Record<string, number> } {
  const perProvider: Record<string, number> = {};
  for (const [slug, count] of providerActive) {
    perProvider[slug] = count;
  }
  return { global: globalActive, perProvider };
}

/** Clear the queue (e.g. on cycle end) */
export function clearQueue(): void {
  for (const item of queue) {
    item.reject(new Error('Queue cleared'));
  }
  queue.length = 0;
}

// ─── Adaptive Delay ─────────────────────────────────────────────

/**
 * Returns the delay (ms) to wait before next request, based on config + jitter.
 * Mimics human behavior with adaptive randomization.
 */
export async function getAdaptiveDelay(): Promise<number> {
  const config = await getWorkerConfig();
  const base = config.requestDelayMinMs + Math.random() * (config.requestDelayMaxMs - config.requestDelayMinMs);
  const jitter = base * (config.jitterPercent / 100) * (Math.random() * 2 - 1);
  return Math.max(200, Math.round(base + jitter));
}

// ─── Cycle Duration Estimator ───────────────────────────────────

export interface CycleEstimate {
  totalListings: number;
  estimatedDurationMs: number;
  estimatedDurationFormatted: string;
  avgDelayMs: number;
  concurrency: number;
}

export async function estimateCycleDuration(totalListings: number, avgResponseTimeMs: number = 2000): Promise<CycleEstimate> {
  const config = await getWorkerConfig();
  const avgDelay = (config.requestDelayMinMs + config.requestDelayMaxMs) / 2;
  const timePerItem = avgResponseTimeMs + avgDelay;
  const effectiveConcurrency = Math.max(1, config.globalConcurrency);
  const estimatedMs = (totalListings / effectiveConcurrency) * timePerItem;

  const minutes = Math.floor(estimatedMs / 60000);
  const seconds = Math.round((estimatedMs % 60000) / 1000);

  return {
    totalListings,
    estimatedDurationMs: Math.round(estimatedMs),
    estimatedDurationFormatted: minutes > 0 ? `${minutes}dk ${seconds}sn` : `${seconds}sn`,
    avgDelayMs: Math.round(avgDelay),
    concurrency: effectiveConcurrency,
  };
}
