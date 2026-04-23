/**
 * Task Worker — Concurrent task processor.
 *
 * Each worker instance runs this loop continuously during a sync cycle:
 * 1. Claim a batch of tasks from the shared queue
 * 2. Process them concurrently (up to WORKER_CONCURRENCY)
 * 3. Respect provider rate limits and circuit breakers
 * 4. Report results back to the task queue
 *
 * The loop runs until no more PENDING tasks remain.
 */

import { prisma, calculateChangePercent } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';
import { getProvider } from './providers';
import { detectDeal, checkAlertRules } from './deals';
import {
  ProviderBlockedError,
  RetryableProviderError,
  RetryableNetworkError,
  RateLimitedError,
  ListingNotFoundError,
  ParseError,
  InvalidListingError,
  StrategyExhaustedError,
} from './errors';
import {
  isBlockedThisCycle,
  isInCooldown,
  applyCooldown,
  recordSuccess,
  recordFailure,
  recordBlocked,
} from './provider-health';
import { addSyncLog, logScrapeAttempt, updateSyncProgress } from './sync-logger';
import { notifySmartDeal } from './services/telegram';
import { recordPriceSnapshot } from './services/smart-snapshot';
import {
  recordMetricEvent,
  recordCircuitSuccess,
  recordCircuitFailure,
  isCircuitOpen,
  incrementProviderCounter,
} from './metrics-collector';
import { getAdaptiveDelay } from './provider-queue';
import { claimTasks, completeTask, failTask, skipTask, getTaskQueueStats, recoverStaleTasks, type ClaimedTask } from './task-queue';
import { acquireRateSlot, releaseRateSlot } from './distributed-rate-limiter';
import { WORKER_ID, recordTaskComplete, recordTaskFailed, recordTaskSkipped, setWorkerStatus, setCurrentTask } from './worker-identity';
import { getWorkerConfig } from './worker-config';
import { recordHealthSuccess, recordHealthFailure } from './services/scrape-health';
import { handleScrapeFailure, pulseSuccessFields } from './services/pulse-protocol';
import { isShuttingDown } from './shutdown';
import { recordScrapeLatency } from './telemetry';

const DEFAULT_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10);

let isProcessing = false;
let currentSyncJobId: string | null = null;

/** Get processing state */
export function getTaskWorkerState() {
  return {
    isProcessing,
    currentSyncJobId,
    concurrency: DEFAULT_CONCURRENCY,
  };
}

/**
 * Start processing tasks for a given sync job.
 * Runs until all tasks are consumed or no more PENDING tasks exist.
 */
export async function processTasksUntilDone(syncJobId: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  if (isProcessing) {
    console.warn(`[task-worker] Already processing, skipping`);
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  isProcessing = true;
  currentSyncJobId = syncJobId;
  setWorkerStatus('busy');

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const config = await getWorkerConfig();
  const concurrency = Math.max(1, config.globalConcurrency || DEFAULT_CONCURRENCY);

  console.log(`[task-worker] ${WORKER_ID.slice(0, 12)} starting — concurrency: ${concurrency}`);

  try {
    // Recover any stale tasks first
    await recoverStaleTasks();

    let emptyRounds = 0;
    const MAX_EMPTY_ROUNDS = 3; // Fast transition for dual-worker back-to-back cycles

    while (emptyRounds < MAX_EMPTY_ROUNDS) {
      // Stop claiming new work as soon as SIGTERM lands.
      // In-flight batches finish normally; releaseMyClaims() in shutdown
      // takes care of anything still locked to this worker.
      if (isShuttingDown()) {
        console.log('[task-worker] shutdown signaled — stopping claim loop');
        break;
      }

      // Claim a batch of tasks
      const tasks = await claimTasks(concurrency);

      if (tasks.length === 0) {
        emptyRounds++;
        if (emptyRounds < MAX_EMPTY_ROUNDS) {
          // Brief pause before retrying — other worker might still be processing
          await new Promise(r => setTimeout(r, 1000));
        }
        continue;
      }

      emptyRounds = 0;

      // Update progress
      const stats = await getTaskQueueStats(syncJobId);
      updateSyncProgress({
        running: true,
        totalListings: stats.total,
        processedListings: stats.completed + stats.failed + stats.skipped,
        successCount: stats.completed,
        failureCount: stats.failed,
        blockedCount: stats.skipped,
        progress: stats.total > 0
          ? Math.round(((stats.completed + stats.failed + stats.skipped) / stats.total) * 100)
          : 0,
        currentRetailer: tasks[0]?.retailerSlug ?? null,
        currentVariant: tasks[0]?.variantLabel ?? null,
        step: 'scraping',
        startedAt: null,
      });

      // Process batch concurrently
      const results = await Promise.allSettled(
        tasks.map(task => processOneTask(task))
      );

      for (const result of results) {
        totalProcessed++;
        if (result.status === 'fulfilled') {
          if (result.value === 'success') totalSucceeded++;
          else if (result.value === 'skipped') totalSkipped++;
          else totalFailed++;
        } else {
          totalFailed++;
        }
      }
    }
  } finally {
    isProcessing = false;
    currentSyncJobId = null;
    setWorkerStatus('idle');
    setCurrentTask(null);
  }

  console.log(
    `[task-worker] ${WORKER_ID.slice(0, 12)} done: ` +
    `${totalSucceeded} succeeded, ${totalFailed} failed, ${totalSkipped} skipped`
  );

  return {
    processed: totalProcessed,
    succeeded: totalSucceeded,
    failed: totalFailed,
    skipped: totalSkipped,
  };
}

/**
 * Process a single scrape task.
 * Returns 'success', 'failure', or 'skipped'.
 */
async function processOneTask(task: ClaimedTask): Promise<'success' | 'failure' | 'skipped'> {
  const { id: taskId, listingId, retailerSlug: slug, variantLabel, productUrl } = task;
  const startMs = Date.now();

  setCurrentTask(taskId);

  // Check circuit breaker
  if (isCircuitOpen(slug)) {
    await skipTask(taskId, 'circuit breaker open');
    recordTaskSkipped();
    logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'skipped_blocked', error: 'circuit breaker open' });
    return 'skipped';
  }

  // Check provider health
  if (isBlockedThisCycle(slug)) {
    await skipTask(taskId, 'blocked this cycle');
    recordTaskSkipped();
    return 'skipped';
  }

  if (isInCooldown(slug)) {
    await skipTask(taskId, 'cooldown active');
    recordTaskSkipped();
    return 'skipped';
  }

  // Distributed rate limit check
  const hasSlot = acquireRateSlot(slug);
  if (!hasSlot) {
    await skipTask(taskId, 'rate limit exceeded');
    recordTaskSkipped();
    logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'skipped_cooldown', error: 'distributed rate limit' });
    return 'skipped';
  }

  const provider = getProvider(slug);
  if (!provider) {
    releaseRateSlot(slug);
    await skipTask(taskId, 'no provider found');
    recordTaskSkipped();
    return 'skipped';
  }

  try {
    // Apply jitter delay for anti-bot safety
    const delay = await getAdaptiveDelay();
    await new Promise(r => setTimeout(r, delay));

    // Fetch the listing from DB for current state
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        variant: { include: { family: true } },
        retailer: true,
      },
    });

    if (!listing || !listing.isActive) {
      releaseRateSlot(slug);
      await skipTask(taskId, 'listing inactive or not found');
      recordTaskSkipped();
      return 'skipped';
    }

    const result = await provider.scrapeProductPage(productUrl);

    if (result) {
      const meta = (result as ScrapedProduct & { _meta?: Record<string, unknown> })._meta;
      const respTime = (meta?.responseTimeMs as number) ?? (Date.now() - startMs);
      const previousPrice = listing.currentPrice ?? null;

      const priceChanged = previousPrice != null && previousPrice !== result.price;

      // Create price snapshot (smart dedup)
      await recordPriceSnapshot({
        listingId,
        observedPrice: result.price,
        previousPrice,
        currency: 'TRY',
        changePercent: previousPrice
          ? calculateChangePercent(previousPrice, result.price)
          : null,
        changeAmount: previousPrice ? result.price - previousPrice : null,
        source: 'direct',
        strategyUsed: (meta?.strategyUsed as string) ?? null,
        parseConfidence: meta?.parseConfidence
          ? ({ high: 0.95, medium: 0.7, low: 0.4 } as Record<string, number>)[String(meta.parseConfidence)] ?? null
          : null,
      });

      // Deal detection — ONLY when price changed (saves ~14-17 DB calls for ~70% of tasks)
      let isDeal = listing.isDeal ?? false;
      let dealScore = listing.dealScore ?? null;

      if (priceChanged || !previousPrice) {
        const deal = await detectDeal({
          listingId,
          variantId: listing.variantId,
          retailerId: listing.retailerId,
          currentPrice: result.price,
          previousPrice,
          lowestPrice: listing.lowestPrice ?? result.price,
          highestPrice: listing.highestPrice ?? result.price,
          retailerSlug: slug,
        });

        isDeal = deal !== null && deal.score >= 30;
        dealScore = deal?.score ?? null;

        if (priceChanged) {
          await checkAlertRules(listing.variantId, listingId, result.price, previousPrice, slug);
        }
      }

      // ── Community ghost-verify gate ───────────────────────────────
      // If this listing was soft-flagged by ≥3 "STOK YOK" votes, this scrape is
      // the verification attempt. Two outcomes:
      //   IN_STOCK success → clear the flag, listing is real; alerts allowed.
      //   anything else    → keep the flag, suppress deal alert this cycle.
      const wasGhosted = listing.ghostUntil != null && listing.ghostUntil > new Date();
      const verifiedClean = wasGhosted && result.stockStatus === 'IN_STOCK';
      const verifySuppressed = wasGhosted && !verifiedClean;
      const clearGhostFields = verifiedClean ? { ghostUntil: null, ghostReason: null } : {};
      if (verifiedClean) {
        console.log(`[task-worker] Ghost cleared for ${listingId} — verify succeeded (IN_STOCK @ ${result.price})`);
      } else if (verifySuppressed) {
        console.log(`[task-worker] Ghost held for ${listingId} — stockStatus=${result.stockStatus}, alert suppressed`);
      }

      // Single listing update (merged: prices + deal status + pulse reset + ghost clear)
      // Pulse Protocol: successful scrape resets consecutiveFailures, skipUntilCycle, isFresh=true
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          retailerProductTitle: result.rawTitle,
          currentPrice: result.price,
          previousPrice,
          lowestPrice: listing.lowestPrice
            ? Math.min(listing.lowestPrice, result.price)
            : result.price,
          highestPrice: listing.highestPrice
            ? Math.max(listing.highestPrice, result.price)
            : result.price,
          sellerName: result.sellerName,
          stockStatus: result.stockStatus,
          imageUrl: result.imageUrl,
          externalId: result.externalId,
          lastSeenAt: new Date(),
          lastSuccessAt: new Date(),
          lastCheckedAt: new Date(),
          discoverySource: 'direct',
          isDeal,
          dealScore,
          ...clearGhostFields,
          ...pulseSuccessFields,
        },
      });

      // Telegram: intelligent deal alert (price drop only — first observations skipped)
      // First observations (previousPrice == null) have no history → ATL by definition → not a real deal.
      // Also skip if this scrape was held in the ghost-verify window without confirmation.
      if (!verifySuppressed && previousPrice && result.price < previousPrice) {
        console.log(`[task-worker] Deal trigger: ${variantLabel} @ ${slug} — ${previousPrice} → ${result.price} TL`);
        try {
          await notifySmartDeal({
            listingId,
            variantId: listing.variantId,
            variantLabel,
            retailerName: listing.retailer.name,
            retailerSlug: slug,
            productUrl,
            newPrice: result.price,
            oldPrice: previousPrice ?? null,
            discoveredAt: startMs,
          });
        } catch {
          // Non-fatal
        }
      }

      // Record success
      releaseRateSlot(slug);
      await completeTask(taskId, { price: result.price, responseTimeMs: respTime });
      await recordSuccess(slug);
      recordCircuitSuccess(slug);
      recordMetricEvent(slug, 'success', respTime);
      recordHealthSuccess(slug, listingId, respTime);
      recordScrapeLatency(slug, respTime, true);
      incrementProviderCounter(slug, 'successCount');
      recordTaskComplete(Date.now() - startMs);

      const stratUsed = (meta?.strategyUsed as string) ?? 'unknown';
      addSyncLog({
        type: 'success', retailer: slug, variant: variantLabel,
        message: `${slug} → ${result.price.toLocaleString('tr-TR')} TL`,
        price: result.price, strategy: stratUsed, responseTimeMs: respTime,
      });
      logScrapeAttempt({ retailer: slug, variant: variantLabel, strategy: stratUsed, status: 'success', responseTimeMs: respTime, price: result.price });

      return 'success';
    } else {
      // Null result — try fallback
      releaseRateSlot(slug);
      const fallbackResult = await tryFallback(task, listing, provider);
      if (fallbackResult === 'success') return 'success';

      // Record failure but keep listing active and IN_STOCK —
      // null result means "couldn't parse", not necessarily "out of stock"
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          lastFailureAt: new Date(),
          lastCheckedAt: new Date(),
        },
      }).catch(() => {});
      await handleScrapeFailure(listingId).catch(() => {});

      await failTask(taskId, 'scrape returned null');
      await recordFailure(slug);
      recordTaskFailed();
      recordHealthFailure(slug, listingId, 'error');
      recordScrapeLatency(slug, Date.now() - startMs, false);
      addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — veri alınamadı` });
      return 'failure';
    }
  } catch (err) {
    releaseRateSlot(slug);
    return await handleTaskError(task, err);
  }
}

/**
 * Try fallback discovery when a direct scrape returns null.
 * DISABLED: External discovery sources (akakce, cimri, epey, enuygun)
 * cause unnecessary HTTP traffic, memory usage, and DB writes.
 * All listing URLs are already seeded — fallback adds no value.
 */
async function tryFallback(
  _task: ClaimedTask,
  _listing: { id: string; variantId: string; currentPrice: number | null; lowestPrice: number | null; highestPrice: number | null; retailer: { name: string }; variant: { family: { name: string }; color: string; storageGb: number } },
  _provider: ReturnType<typeof getProvider>,
): Promise<'success' | 'failure'> {
  return 'failure';
}

/**
 * Handle specific error types from scraping.
 */
async function handleTaskError(task: ClaimedTask, err: unknown): Promise<'success' | 'failure' | 'skipped'> {
  const { id: taskId, retailerSlug: slug, variantLabel, listingId } = task;

  if (err instanceof ProviderBlockedError) {
    await failTask(taskId, 'blocked (403)', 'blocked');
    await recordBlocked(slug);
    recordCircuitFailure(slug);
    recordMetricEvent(slug, 'blocked', 0);
    incrementProviderCounter(slug, 'blockedCount');
    recordTaskFailed();
    recordHealthFailure(slug, listingId, 'blocked', 403);
    await prisma.listing.update({ where: { id: listingId }, data: { lastBlockedAt: new Date(), lastFailureAt: new Date() } }).catch(() => {});
    await handleScrapeFailure(listingId).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} engellendi (403)`, blocked: true });
    return 'failure';
  }

  if (err instanceof RateLimitedError) {
    await failTask(taskId, 'rate limited (429)', 'rate_limited');
    await recordFailure(slug);
    applyCooldown(slug, 'rate_limit', err.retryAfterMs);
    recordCircuitFailure(slug);
    recordMetricEvent(slug, 'rate_limited', 0);
    incrementProviderCounter(slug, 'rateLimitCount');
    recordTaskFailed();    recordHealthFailure(slug, listingId, 'blocked', 429);    addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} hız limiti (429)` });
    await handleScrapeFailure(listingId).catch(() => {});
    return 'failure';
  }

  if (err instanceof ListingNotFoundError) {
    await failTask(taskId, 'not found (404)', 'not_found');
    // Soft deactivation: mark OUT_OF_STOCK, recheck every 6h via task-queue filter
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        stockStatus: 'OUT_OF_STOCK',
        lastFailureAt: new Date(),
        lastCheckedAt: new Date(),
      },
    }).catch(() => {});
    await handleScrapeFailure(listingId).catch(() => {});
    recordTaskFailed();
    recordHealthFailure(slug, listingId, 'error', 404);
    addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} — ürün bulunamadı (stok dışı)` });
    return 'failure';
  }

  if (err instanceof InvalidListingError) {
    await failTask(taskId, 'invalid listing', 'invalid');
    await prisma.listing.update({
      where: { id: listingId },
      data: { stockStatus: 'OUT_OF_STOCK', lastFailureAt: new Date(), lastCheckedAt: new Date() },
    }).catch(() => {});
    await handleScrapeFailure(listingId).catch(() => {});
    recordTaskFailed();
    return 'failure';
  }

  if (err instanceof ParseError || err instanceof StrategyExhaustedError) {
    await failTask(taskId, err instanceof Error ? err.message : 'parse error', 'parse_fail');
    await recordFailure(slug);
    recordTaskFailed();
    await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
    await handleScrapeFailure(listingId).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — ayrıştırma hatası` });
    return 'failure';
  }

  if (err instanceof RetryableProviderError) {
    await failTask(taskId, `server error (${err.statusCode})`, 'server_error');
    await recordFailure(slug);
    recordTaskFailed();
    await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
    await handleScrapeFailure(listingId).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — sunucu hatası (${err.statusCode})` });
    return 'failure';
  }

  if (err instanceof RetryableNetworkError) {
    await failTask(taskId, `network error (${err.reason})`, 'network_error');
    await recordFailure(slug);
    recordTaskFailed();
    await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
    await handleScrapeFailure(listingId).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — ağ hatası` });
    return 'failure';
  }

  // Unknown error
  const msg = err instanceof Error ? err.message : String(err);
  await failTask(taskId, msg, 'unknown');
  await recordFailure(slug);
  recordTaskFailed();
  await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
  await handleScrapeFailure(listingId).catch(() => {});
  addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — beklenmeyen hata` });
  return 'failure';
}
