import { prisma, calculateChangePercent } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';
import { getProviders, getProvider } from './providers';
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
  resetCycleState,
  isBlockedThisCycle,
  isInCooldown,
  applyCooldown,
  recordSuccess,
  recordFailure,
  recordBlocked,
} from './provider-health';
import { clearSyncLogs, addSyncLog, finishSyncLogs, updateSyncProgress, logScrapeAttempt, logDiscoveryAttempt } from './sync-logger';
import type { ScrapeStatus } from './sync-logger';
import { queryFallbackSourcesDetailed } from './discovery';
import { notifySmartDeal } from './services/telegram';
import { recordPriceSnapshot } from './services/smart-snapshot';
import { recordMetricEvent, recordCircuitSuccess, recordCircuitFailure, isCircuitOpen, incrementProviderCounter } from './metrics-collector';
import { getAdaptiveDelay } from './provider-queue';

/**
 * NOTE: runSync() is the LEGACY sync function used only for manual triggers
 * (e.g., single-variant sync from the dashboard).
 * The scheduler now uses the distributed task queue (task-queue.ts + task-worker.ts).
 */

/**
 * Tüm retailer'lardan veya belirli bir retailer'dan fiyat güncellemesi yapar.
 * Varyant bazlı round-robin: her varyant için tüm sağlayıcılara bakılır,
 * böylece aynı sağlayıcıya arka arkaya çok fazla istek gönderilmez.
 *
 * variantId verilirse sadece o varyantın listing'leri senkronize edilir.
 */
export async function runSync(retailerSlug?: string, variantId?: string) {
  const startMs = Date.now();
  resetCycleState();
  clearSyncLogs();
  addSyncLog({ type: 'info', message: variantId ? 'Varyant senkronizasyonu başlatılıyor...' : 'Senkronizasyon başlatılıyor...' });

  const syncJob = await prisma.syncJob.create({
    data: {
      retailerId: retailerSlug
        ? (await prisma.retailer.findUnique({ where: { slug: retailerSlug } }))?.id
        : undefined,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  let itemsScanned = 0;
  let itemsMatched = 0;
  let dealsFound = 0;
  let successCount = 0;
  let failureCount = 0;
  let blockedCount = 0;
  let lastErrorMessage: string | null = null;
  const errorLog: string[] = [];

  try {
    // Build provider map
    const providerList = retailerSlug
      ? [getProvider(retailerSlug)].filter(Boolean)
      : getProviders();
    const providerMap = new Map<string, ReturnType<typeof getProvider>>();
    for (const p of providerList) {
      if (p) providerMap.set(p.retailerSlug, p);
    }

    // ── Varyant bazlı round-robin: tüm listing'leri çek, varyanta göre grupla ──
    console.log('[sync] Varyant bazlı round-robin senkronizasyon başlıyor...');

    const allListings = await prisma.listing.findMany({
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

    type ListingWithRelations = (typeof allListings)[number];

    // Group by variant
    const variantGroups = new Map<string, ListingWithRelations[]>();
    for (const listing of allListings) {
      if (!variantGroups.has(listing.variantId)) {
        variantGroups.set(listing.variantId, []);
      }
      variantGroups.get(listing.variantId)!.push(listing);
    }

    console.log(`[sync] ${variantGroups.size} varyant, ${allListings.length} listing bulundu`);
    addSyncLog({ type: 'info', message: `${variantGroups.size} varyant, ${allListings.length} listing bulundu` });

    // Set up live progress tracking
    updateSyncProgress({
      running: true,
      totalListings: allListings.length,
      processedListings: 0,
      successCount: 0,
      failureCount: 0,
      blockedCount: 0,
      progress: 0,
      currentRetailer: null,
      currentVariant: null,
      step: 'starting',
      startedAt: new Date().toISOString(),
    });

    // Process variant by variant (round-robin across providers)
    for (const [, listings] of variantGroups) {
      const variant = listings[0].variant;
      const variantLabel = `${variant.family.name} ${variant.color} ${variant.storageGb}GB`;

      addSyncLog({ type: 'progress', variant: variantLabel, message: `${variantLabel} araştırılıyor...` });
      console.log(`[sync] 📱 ${variantLabel} (${listings.length} mağaza)`);

      for (const listing of listings) {
        const slug = listing.retailer.slug;
        const provider = providerMap.get(slug);
        if (!provider) continue;

        // Update live progress
        const processed = successCount + failureCount + blockedCount;
        updateSyncProgress({
          running: true,
          totalListings: allListings.length,
          processedListings: processed,
          successCount,
          failureCount,
          blockedCount,
          progress: allListings.length > 0 ? Math.round((processed / allListings.length) * 100) : 0,
          currentRetailer: slug,
          currentVariant: variantLabel,
          step: 'scraping',
          startedAt: new Date(startMs).toISOString(),
        });

        // Skip if blocked this cycle
        if (isBlockedThisCycle(slug)) {
          addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} engellendi, atlanıyor` });
          logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'skipped_blocked', error: 'blocked this cycle' });
          continue;
        }

        // Skip if in cooldown (anti-bot pacing)
        if (isInCooldown(slug)) {
          addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} soğuma süresinde, atlanıyor` });
          logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'skipped_cooldown', error: 'cooldown active' });
          continue;
        }

        // Skip if circuit breaker is open
        if (isCircuitOpen(slug)) {
          addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} devre kesici açık, atlanıyor` });
          logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'skipped_blocked', error: 'circuit breaker open' });
          continue;
        }

        try {
          // Skip search/browse URLs
          if (listing.productUrl.includes('/search?q=') || listing.productUrl.includes('/ara?q=') || listing.productUrl.includes('/arama?q=') || listing.productUrl.includes('/s?k=') || listing.productUrl.includes('/sr?q=')) {
            continue;
          }

          const scrapeStartMs = Date.now();
          const result = await provider.scrapeProductPage(listing.productUrl);
          itemsScanned++;

          if (result) {
            const meta = (result as ScrapedProduct & { _meta?: Record<string, unknown> })._meta;
            if (meta?.wasFallbackUsed) {
              console.log(`[sync] ${slug} used fallback strategy "${meta.strategyUsed}" (${meta.responseTimeMs}ms, confidence: ${meta.parseConfidence})`);
            }

            const previousPrice = listing.currentPrice ?? null;

            await prisma.listing.update({
              where: { id: listing.id },
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
                discoverySource: 'direct',
              },
            });

            await recordPriceSnapshot({
              listingId: listing.id,
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

            const deal = await detectDeal({
              listingId: listing.id,
              variantId: listing.variantId,
              retailerId: listing.retailerId,
              currentPrice: result.price,
              previousPrice,
              lowestPrice: listing.lowestPrice ?? result.price,
              highestPrice: listing.highestPrice ?? result.price,
              retailerSlug: result.retailerSlug,
            });

            const isDeal = deal !== null && deal.score >= 30;
            await prisma.listing.update({
              where: { id: listing.id },
              data: { isDeal, dealScore: deal?.score ?? null },
            });

            if (previousPrice && previousPrice !== result.price) {
              await checkAlertRules(
                listing.variantId,
                listing.id,
                result.price,
                previousPrice,
                result.retailerSlug,
              );
            }

            // ── Telegram: intelligent deal alert (price drop or first observation) ──
            if (!previousPrice || result.price < previousPrice) {
              try {
                await notifySmartDeal({
                  listingId: listing.id,
                  variantId: listing.variantId,
                  variantLabel,
                  retailerName: listing.retailer.name,
                  retailerSlug: slug,
                  productUrl: listing.productUrl,
                  newPrice: result.price,
                  oldPrice: previousPrice ?? null,
                  discoveredAt: scrapeStartMs,
                });
              } catch (tgErr) {
                console.error('[telegram] Notification error (non-fatal):', tgErr instanceof Error ? tgErr.message : tgErr);
              }
            }

            itemsMatched++;
            successCount++;
            await recordSuccess(slug);
            if (isDeal) dealsFound++;

            const stratUsed = (meta?.strategyUsed as string) ?? 'unknown';
            const respTime = (meta?.responseTimeMs as number) ?? 0;
            const confidence = (meta?.parseConfidence as 'high' | 'medium' | 'low') ?? undefined;

            // Record metrics
            recordCircuitSuccess(slug);
            recordMetricEvent(slug, 'success', respTime);
            incrementProviderCounter(slug, 'successCount');
            console.log(`[sync] ✓ ${slug} — ${result.rawTitle} → ${result.price} TL (${stratUsed}, ${respTime}ms, ${confidence ?? 'n/a'})`);
            addSyncLog({ type: 'success', retailer: slug, variant: variantLabel, message: `${slug} → ${result.price.toLocaleString('tr-TR')} TL`, price: result.price, strategy: stratUsed, responseTimeMs: respTime });
            logScrapeAttempt({ retailer: slug, variant: variantLabel, strategy: stratUsed, status: 'success', responseTimeMs: respTime, price: result.price, confidence });
          } else {
            console.warn(`[sync] ✗ ${slug} — scrape returned null for ${listing.productUrl}`);
            addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} — direkt veri alınamadı, fallback deneniyor...` });

            // ── Fallback discovery ──
            try {
              const fallback = await queryFallbackSourcesDetailed(
                variant.family.name,
                variant.storageGb,
                variant.color
              );

              const discoveryForRetailer = fallback.results.find(d => d.retailerSlug === slug);
              if (discoveryForRetailer && discoveryForRetailer.productUrl !== listing.productUrl && discoveryForRetailer.confidence >= 0.55) {
                console.log(`[sync] 🔍 Fallback found: ${discoveryForRetailer.source} → ${discoveryForRetailer.retailerSlug} (confidence: ${discoveryForRetailer.confidence.toFixed(2)})`);
                addSyncLog({ type: 'info', retailer: slug, variant: variantLabel, message: `${discoveryForRetailer.source} üzerinden yeni URL bulundu (güven: ${(discoveryForRetailer.confidence * 100).toFixed(0)}%)` });

                // Update listing URL and discovery metadata
                await prisma.listing.update({
                  where: { id: listing.id },
                  data: {
                    productUrl: discoveryForRetailer.productUrl,
                    resolvedViaFallback: true,
                    discoverySource: discoveryForRetailer.source,
                    discoveryConfidence: discoveryForRetailer.confidence,
                    lastResolvedAt: new Date(),
                    lastResolvedBySource: discoveryForRetailer.source,
                    lastResolvedRetailerUrl: discoveryForRetailer.productUrl,
                  },
                });

                // Retry with new URL
                const retryResult = await provider.scrapeProductPage(discoveryForRetailer.productUrl);
                if (retryResult && retryResult.price > 0) {
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
                    strategyUsed: discoveryForRetailer.source,
                    parseConfidence: discoveryForRetailer.confidence,
                  });
                  itemsMatched++;
                  successCount++;
                  await recordSuccess(slug);
                  console.log(`[sync] ✓ ${slug} (fallback via ${discoveryForRetailer.source}) — ${retryResult.price} TL`);
                  addSyncLog({ type: 'success', retailer: slug, variant: variantLabel, message: `${slug} (fallback) → ${retryResult.price.toLocaleString('tr-TR')} TL`, price: retryResult.price });

                  // ── Telegram: intelligent deal alert (fallback) ──
                  if (!previousPrice || retryResult.price < previousPrice) {
                    try {
                      await notifySmartDeal({
                        listingId: listing.id,
                        variantId: listing.variantId,
                        variantLabel,
                        retailerName: listing.retailer.name,
                        retailerSlug: slug,
                        productUrl: discoveryForRetailer.productUrl,
                        newPrice: retryResult.price,
                        oldPrice: previousPrice ?? null,
                        discoveredAt: scrapeStartMs,
                      });
                    } catch (tgErr) {
                      console.error('[telegram] Notification error (non-fatal):', tgErr instanceof Error ? tgErr.message : tgErr);
                    }
                  }

                  const fallbackDelay = await getAdaptiveDelay();
                  await new Promise((r) => setTimeout(r, fallbackDelay));
                  continue;
                } else {
                  console.warn(`[sync] Fallback URL scrape returned empty for ${slug}: ${discoveryForRetailer.productUrl}`);
                  // Track fallback failure
                  await prisma.listing.update({
                    where: { id: listing.id },
                    data: { lastFallbackFailureAt: new Date() },
                  });
                }
              } else if (fallback.results.length > 0 && !discoveryForRetailer) {
                console.log(`[sync] 🔍 Fallback found results but none for ${slug}: ${fallback.results.map(r => r.retailerSlug).join(', ')}`);
                addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `Fallback'te ${slug} bulunamadı (${fallback.results.length} başka mağaza bulundu)` });
                await prisma.listing.update({
                  where: { id: listing.id },
                  data: { lastFallbackFailureAt: new Date() },
                });
              } else {
                // No results at all from fallback
                await prisma.listing.update({
                  where: { id: listing.id },
                  data: { lastFallbackFailureAt: new Date() },
                });
              }
            } catch (fbErr) {
              console.warn(`[sync] Fallback discovery error for ${variantLabel}:`, fbErr instanceof Error ? fbErr.message : fbErr);
              await prisma.listing.update({
                where: { id: listing.id },
                data: { lastFallbackFailureAt: new Date() },
              }).catch(() => {});
            }

            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — veri alınamadı` });
          }

          const iterDelay = await getAdaptiveDelay();
          await new Promise((r) => setTimeout(r, iterDelay));
        } catch (err) {
          itemsScanned++;

          if (err instanceof ProviderBlockedError) {
            blockedCount++;
            console.error(`[sync] ${slug} provider blocked (HTTP 403)`);
            await recordBlocked(slug);
            recordCircuitFailure(slug);
            recordMetricEvent(slug, 'blocked', 0);
            incrementProviderCounter(slug, 'blockedCount');
            logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'blocked', httpStatus: 403 });

            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastBlockedAt: new Date(), lastFailureAt: new Date() },
            });

            errorLog.push(`${slug}: provider blocked (HTTP 403)`);
            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} engellendi (403)`, blocked: true });
            lastErrorMessage = err.message;
            // Don't break — continue to other providers for this variant
            continue;
          }

          if (err instanceof RateLimitedError) {
            console.warn(`[sync] ${slug} rate limited (HTTP 429) — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
            applyCooldown(slug, 'rate_limit', err.retryAfterMs);
            recordCircuitFailure(slug);
            recordMetricEvent(slug, 'rate_limited', 0);
            incrementProviderCounter(slug, 'rateLimitCount');
            logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'rate_limited', httpStatus: 429 });
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastFailureAt: new Date() },
            });
            errorLog.push(`${slug}: rate limited (429) — ${listing.productUrl}`);
            addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} hız limiti (429)` });
            // Use cooldown system instead of hardcoded wait
            continue;
          }

          if (err instanceof ListingNotFoundError) {
            console.warn(`[sync] ${slug} listing not found (HTTP 404) — ${listing.productUrl}`);
            await prisma.listing.update({
              where: { id: listing.id },
              data: {
                isActive: false,
                lastFailureAt: new Date(),
              },
            });
            failureCount++;
            errorLog.push(`${slug}: listing removed (404) — ${listing.productUrl}`);
            addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} — ürün bulunamadı (404)` });
            continue;
          }

          if (err instanceof InvalidListingError) {
            console.warn(`[sync] ${slug} invalid listing — ${listing.productUrl}`);
            await prisma.listing.update({
              where: { id: listing.id },
              data: { isActive: false, lastFailureAt: new Date() },
            });
            failureCount++;
            logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'invalid_listing', error: err.message });
            continue;
          }

          if (err instanceof ParseError || err instanceof StrategyExhaustedError) {
            console.error(`[sync] ${slug} parse/strategy failed — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
            const errStatus: ScrapeStatus = err instanceof StrategyExhaustedError ? 'retry_exhausted' : 'parse_fail';
            logScrapeAttempt({ retailer: slug, variant: variantLabel, status: errStatus, error: err.message });
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastFailureAt: new Date() },
            });
            if (err instanceof StrategyExhaustedError) {
              errorLog.push(`${slug}: all strategies failed — ${listing.productUrl}`);
            } else {
              errorLog.push(`${slug}: parse failed — ${listing.productUrl}`);
            }
            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — ayrıştırma hatası` });
            continue;
          }

          if (err instanceof RetryableProviderError) {
            console.error(`[sync] ${slug} server error (HTTP ${err.statusCode}) — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
            logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'server_error', httpStatus: err.statusCode });
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastFailureAt: new Date() },
            });
            errorLog.push(`${slug}: server error (${err.statusCode}) — ${listing.productUrl}`);
            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — sunucu hatası (${err.statusCode})` });
            continue;
          }

          if (err instanceof RetryableNetworkError) {
            console.error(`[sync] ${slug} network error (${err.reason}) — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
            logScrapeAttempt({ retailer: slug, variant: variantLabel, status: 'network_error', error: err.reason });
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastFailureAt: new Date() },
            });
            errorLog.push(`${slug}: network error (${err.reason}) — ${listing.productUrl}`);
            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — ağ hatası` });
            continue;
          }

          // Unknown errors
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[sync] ${slug} unexpected error — ${listing.productUrl}:`, msg);
          failureCount++;
          await recordFailure(slug);
          await prisma.listing.update({
            where: { id: listing.id },
            data: { lastFailureAt: new Date() },
          });
          errorLog.push(`${slug}: unexpected error — ${listing.productUrl}`);
          addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — beklenmeyen hata` });
        }
      }
    }

    const durationMs = Date.now() - startMs;
    finishSyncLogs();
    updateSyncProgress({
      running: false,
      progress: 100,
      step: 'completed',
      processedListings: successCount + failureCount + blockedCount,
      successCount,
      failureCount,
      blockedCount,
      currentRetailer: null,
      currentVariant: null,
    });

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        itemsScanned,
        itemsMatched,
        dealsFound,
        successCount,
        failureCount,
        blockedCount,
        durationMs,
        lastErrorMessage,
        errors: errorLog.length > 0 ? JSON.stringify(errorLog) : null,
      },
    });

    const summaryMsg = `Tamamlandı (${(durationMs / 1000).toFixed(1)}s): ${successCount} başarılı, ${failureCount} hata, ${blockedCount} engel`;
    console.log(`[sync] ${summaryMsg}`);
    addSyncLog({ type: 'info', message: summaryMsg });

    return { jobId: syncJob.id, itemsScanned, itemsMatched, dealsFound };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    lastErrorMessage = error instanceof Error ? error.message : 'Unknown error';
    finishSyncLogs();
    addSyncLog({ type: 'error', message: `Sync başarısız: ${lastErrorMessage}` });

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        itemsScanned,
        itemsMatched,
        dealsFound,
        successCount,
        failureCount,
        blockedCount,
        durationMs,
        lastErrorMessage,
        errors: errorLog.length > 0 ? JSON.stringify(errorLog) : lastErrorMessage,
      },
    });
    throw error;
  }
}

async function upsertListing(
  result: ScrapedProduct,
  retailerId: string
): Promise<{ isDeal: boolean } | null> {
  const family = await prisma.productFamily.findFirst({
    where: { name: result.normalizedModel },
  });
  if (!family) return null;

  const variant = await prisma.productVariant.findFirst({
    where: {
      familyId: family.id,
      color: result.normalizedColor,
      storageGb: result.normalizedStorageGb,
    },
  });
  if (!variant) return null;

  const existing = await prisma.listing.findUnique({
    where: {
      variantId_retailerId: {
        variantId: variant.id,
        retailerId,
      },
    },
  });

  const previousPrice = existing?.currentPrice ?? null;

  const listing = await prisma.listing.upsert({
    where: {
      variantId_retailerId: {
        variantId: variant.id,
        retailerId,
      },
    },
    update: {
      retailerProductTitle: result.rawTitle,
      currentPrice: result.price,
      previousPrice: previousPrice,
      lowestPrice: existing?.lowestPrice
        ? Math.min(existing.lowestPrice, result.price)
        : result.price,
      highestPrice: existing?.highestPrice
        ? Math.max(existing.highestPrice, result.price)
        : result.price,
      sellerName: result.sellerName,
      stockStatus: result.stockStatus,
      productUrl: existing?.productUrl && !existing.productUrl.includes('/search?q=') && !existing.productUrl.includes('/ara?q=') && !existing.productUrl.includes('/sr?q=')
        ? existing.productUrl
        : result.productUrl,
      imageUrl: result.imageUrl,
      externalId: result.externalId,
      lastSeenAt: new Date(),
    },
    create: {
      variantId: variant.id,
      retailerId,
      retailerProductTitle: result.rawTitle,
      currentPrice: result.price,
      previousPrice: null,
      lowestPrice: result.price,
      highestPrice: result.price,
      sellerName: result.sellerName,
      stockStatus: result.stockStatus,
      productUrl: result.productUrl,
      imageUrl: result.imageUrl,
      externalId: result.externalId,
      lastSeenAt: new Date(),
    },
  });

  const changePercent = previousPrice
    ? calculateChangePercent(previousPrice, result.price)
    : null;
  const changeAmount = previousPrice ? result.price - previousPrice : null;

  await recordPriceSnapshot({
    listingId: listing.id,
    observedPrice: result.price,
    previousPrice,
    changePercent,
    changeAmount,
  });

  const deal = await detectDeal({
    listingId: listing.id,
    variantId: variant.id,
    currentPrice: result.price,
    previousPrice,
    lowestPrice: listing.lowestPrice,
    highestPrice: listing.highestPrice,
    retailerSlug: result.retailerSlug,
    retailerId: listing.retailerId,
  });

  const isDeal = deal !== null && deal.score >= 30;

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      isDeal,
      dealScore: deal?.score ?? null,
    },
  });

  if (previousPrice && previousPrice !== result.price) {
    await checkAlertRules(
      variant.id,
      listing.id,
      result.price,
      previousPrice,
      result.retailerSlug
    );
  }

  return { isDeal };
}
