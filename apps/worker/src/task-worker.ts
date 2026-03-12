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
import { queryFallbackSourcesDetailed } from './discovery';
import { getWorkerConfig } from './worker-config';
import { recordHealthSuccess, recordHealthFailure } from './services/scrape-health';

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

      // Single listing update (merged: prices + deal status)
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
        },
      });

      // Telegram: intelligent deal alert (price drop or first observation)
      if (!previousPrice || result.price < previousPrice) {
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

      await failTask(taskId, 'scrape returned null');
      await recordFailure(slug);
      recordTaskFailed();
      recordHealthFailure(slug, listingId, 'error');
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
 */
async function tryFallback(
  task: ClaimedTask,
  listing: { id: string; variantId: string; currentPrice: number | null; lowestPrice: number | null; highestPrice: number | null; retailer: { name: string }; variant: { family: { name: string }; color: string; storageGb: number } },
  provider: ReturnType<typeof getProvider>,
): Promise<'success' | 'failure'> {
  if (!provider) return 'failure';

  try {
    const fallback = await queryFallbackSourcesDetailed(
      listing.variant.family.name,
      listing.variant.storageGb,
      listing.variant.color,
    );

    const match = fallback.results.find(d => d.retailerSlug === task.retailerSlug);
    if (!match || match.productUrl === task.productUrl || match.confidence < 0.55) {
      return 'failure';
    }

    // Update listing URL
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        productUrl: match.productUrl,
        resolvedViaFallback: true,
        discoverySource: match.source,
        discoveryConfidence: match.confidence,
        lastResolvedAt: new Date(),
        lastResolvedBySource: match.source,
        lastResolvedRetailerUrl: match.productUrl,
      },
    });

    const fallbackScrapeStartMs = Date.now();
    const retryResult = await provider.scrapeProductPage(match.productUrl);
    if (!retryResult || retryResult.price <= 0) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { lastFallbackFailureAt: new Date() },
      });
      return 'failure';
    }

    const previousPrice = listing.currentPrice ?? null;
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        retailerProductTitle: retryResult.rawTitle,
        currentPrice: retryResult.price,
        previousPrice,
        lowestPrice: listing.lowestPrice ? Math.min(listing.lowestPrice, retryResult.price) : retryResult.price,
        highestPrice: listing.highestPrice ? Math.max(listing.highestPrice, retryResult.price) : retryResult.price,
        stockStatus: retryResult.stockStatus,
        lastSeenAt: new Date(),
        lastSuccessAt: new Date(),
        lastCheckedAt: new Date(),
      },
    });

    await recordPriceSnapshot({
      listingId: listing.id,
      observedPrice: retryResult.price,
      previousPrice,
      currency: 'TRY',
      changePercent: previousPrice ? calculateChangePercent(previousPrice, retryResult.price) : null,
      changeAmount: previousPrice ? retryResult.price - previousPrice : null,
      source: 'fallback',
      strategyUsed: match.source,
      parseConfidence: match.confidence,
    });

    await completeTask(task.id, { price: retryResult.price });
    await recordSuccess(task.retailerSlug);
    recordCircuitSuccess(task.retailerSlug);
    recordTaskComplete(0);

    // Telegram: intelligent deal alert (fallback)
    if (!previousPrice || retryResult.price < previousPrice) {
      await notifySmartDeal({
        listingId: listing.id,
        variantId: listing.variantId,
        variantLabel: task.variantLabel,
        retailerName: listing.retailer.name,
        retailerSlug: task.retailerSlug,
        productUrl: match.productUrl,
        newPrice: retryResult.price,
        oldPrice: previousPrice ?? null,
        discoveredAt: fallbackScrapeStartMs,
      }).catch(() => {});
    }

    addSyncLog({
      type: 'success', retailer: task.retailerSlug, variant: task.variantLabel,
      message: `${task.retailerSlug} (fallback) → ${retryResult.price.toLocaleString('tr-TR')} TL`,
      price: retryResult.price,
    });

    return 'success';
  } catch {
    await prisma.listing.update({
      where: { id: listing.id },
      data: { lastFallbackFailureAt: new Date() },
    }).catch(() => {});
    return 'failure';
  }
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
    return 'failure';
  }

  if (err instanceof ListingNotFoundError) {
    await failTask(taskId, 'not found (404)', 'not_found');
    await prisma.listing.update({ where: { id: listingId }, data: { isActive: false, lastFailureAt: new Date() } }).catch(() => {});
    recordTaskFailed();
    recordHealthFailure(slug, listingId, 'error', 404);
    addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} — ürün bulunamadı (404)` });
    return 'failure';
  }

  if (err instanceof InvalidListingError) {
    await failTask(taskId, 'invalid listing', 'invalid');
    await prisma.listing.update({ where: { id: listingId }, data: { isActive: false, lastFailureAt: new Date() } }).catch(() => {});
    recordTaskFailed();
    return 'failure';
  }

  if (err instanceof ParseError || err instanceof StrategyExhaustedError) {
    await failTask(taskId, err instanceof Error ? err.message : 'parse error', 'parse_fail');
    await recordFailure(slug);
    recordTaskFailed();
    await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — ayrıştırma hatası` });
    return 'failure';
  }

  if (err instanceof RetryableProviderError) {
    await failTask(taskId, `server error (${err.statusCode})`, 'server_error');
    await recordFailure(slug);
    recordTaskFailed();
    await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — sunucu hatası (${err.statusCode})` });
    return 'failure';
  }

  if (err instanceof RetryableNetworkError) {
    await failTask(taskId, `network error (${err.reason})`, 'network_error');
    await recordFailure(slug);
    recordTaskFailed();
    await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
    addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — ağ hatası` });
    return 'failure';
  }

  // Unknown error
  const msg = err instanceof Error ? err.message : String(err);
  await failTask(taskId, msg, 'unknown');
  await recordFailure(slug);
  recordTaskFailed();
  await prisma.listing.update({ where: { id: listingId }, data: { lastFailureAt: new Date() } }).catch(() => {});
  addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — beklenmeyen hata` });
  return 'failure';
}
