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
  recordSuccess,
  recordFailure,
  recordBlocked,
} from './provider-health';
import { clearSyncLogs, addSyncLog, finishSyncLogs } from './sync-logger';
import { queryFallbackSources } from './discovery';

/**
 * Tüm retailer'lardan veya belirli bir retailer'dan fiyat güncellemesi yapar.
 * Varyant bazlı round-robin: her varyant için tüm sağlayıcılara bakılır,
 * böylece aynı sağlayıcıya arka arkaya çok fazla istek gönderilmez.
 */
export async function runSync(retailerSlug?: string) {
  const startMs = Date.now();
  resetCycleState();
  clearSyncLogs();
  addSyncLog({ type: 'info', message: 'Senkronizasyon başlatılıyor...' });

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

        // Skip if blocked this cycle
        if (isBlockedThisCycle(slug)) {
          addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} engellendi, atlanıyor` });
          continue;
        }

        try {
          // Skip search/browse URLs
          if (listing.productUrl.includes('/search?q=') || listing.productUrl.includes('/ara?q=') || listing.productUrl.includes('/arama?q=') || listing.productUrl.includes('/s?k=') || listing.productUrl.includes('/sr?q=')) {
            continue;
          }

          // Mark as checked
          await prisma.listing.update({
            where: { id: listing.id },
            data: { lastCheckedAt: new Date() },
          });

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

            await prisma.priceSnapshot.create({
              data: {
                listingId: listing.id,
                observedPrice: result.price,
                previousPrice,
                changePercent: previousPrice
                  ? calculateChangePercent(previousPrice, result.price)
                  : null,
                changeAmount: previousPrice ? result.price - previousPrice : null,
              },
            });

            const deal = await detectDeal({
              listingId: listing.id,
              variantId: listing.variantId,
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

            itemsMatched++;
            successCount++;
            await recordSuccess(slug);
            if (isDeal) dealsFound++;

            console.log(`[sync] ✓ ${slug} — ${result.rawTitle} → ${result.price} TL`);
            addSyncLog({ type: 'success', retailer: slug, variant: variantLabel, message: `${slug} → ${result.price.toLocaleString('tr-TR')} TL`, price: result.price });
          } else {
            console.warn(`[sync] ✗ ${slug} — scrape returned null for ${listing.productUrl}`);
            addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} — direkt veri alınamadı, fallback deneniyor...` });

            // ── Fallback discovery ──
            try {
              const discoveries = await queryFallbackSources(
                variant.family.name,
                variant.storageGb,
                variant.color
              );

              const discoveryForRetailer = discoveries.find(d => d.retailerSlug === slug);
              if (discoveryForRetailer && discoveryForRetailer.productUrl !== listing.productUrl) {
                console.log(`[sync] 🔍 Fallback found: ${discoveryForRetailer.source} → ${discoveryForRetailer.retailerSlug}`);
                addSyncLog({ type: 'info', retailer: slug, variant: variantLabel, message: `${discoveryForRetailer.source} üzerinden yeni URL bulundu` });

                // Update listing URL and try scrape again
                await prisma.listing.update({
                  where: { id: listing.id },
                  data: {
                    productUrl: discoveryForRetailer.productUrl,
                    resolvedViaFallback: true,
                    discoverySource: discoveryForRetailer.source,
                    discoveryConfidence: discoveryForRetailer.confidence,
                    lastResolvedAt: new Date(),
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
                  await prisma.priceSnapshot.create({
                    data: {
                      listingId: listing.id,
                      observedPrice: retryResult.price,
                      previousPrice,
                      changePercent: previousPrice ? calculateChangePercent(previousPrice, retryResult.price) : null,
                      changeAmount: previousPrice ? retryResult.price - previousPrice : null,
                    },
                  });
                  itemsMatched++;
                  successCount++;
                  await recordSuccess(slug);
                  console.log(`[sync] ✓ ${slug} (fallback) — ${retryResult.price} TL`);
                  addSyncLog({ type: 'success', retailer: slug, variant: variantLabel, message: `${slug} (fallback) → ${retryResult.price.toLocaleString('tr-TR')} TL`, price: retryResult.price });
                  await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1000)));
                  continue;
                }
              }
            } catch (fbErr) {
              console.warn(`[sync] Fallback discovery error for ${variantLabel}:`, fbErr instanceof Error ? fbErr.message : fbErr);
            }

            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} — veri alınamadı` });
          }

          await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1000)));
        } catch (err) {
          itemsScanned++;

          if (err instanceof ProviderBlockedError) {
            blockedCount++;
            console.error(`[sync] ${slug} provider blocked (HTTP 403)`);
            await recordBlocked(slug);

            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastBlockedAt: new Date(), lastFailureAt: new Date() },
            });

            errorLog.push(`${slug}: provider blocked (HTTP 403)`);
            addSyncLog({ type: 'error', retailer: slug, variant: variantLabel, message: `${slug} engellendi (403)` });
            lastErrorMessage = err.message;
            // Don't break — continue to other providers for this variant
            continue;
          }

          if (err instanceof RateLimitedError) {
            console.warn(`[sync] ${slug} rate limited (HTTP 429) — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastFailureAt: new Date() },
            });
            errorLog.push(`${slug}: rate limited (429) — ${listing.productUrl}`);
            addSyncLog({ type: 'warn', retailer: slug, variant: variantLabel, message: `${slug} hız limiti (429)` });
            if (err.retryAfterMs) {
              await new Promise((r) => setTimeout(r, Math.min(err.retryAfterMs!, 30_000)));
            } else {
              await new Promise((r) => setTimeout(r, 10_000));
            }
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
            continue;
          }

          if (err instanceof ParseError || err instanceof StrategyExhaustedError) {
            console.error(`[sync] ${slug} parse/strategy failed — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
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

  await prisma.priceSnapshot.create({
    data: {
      listingId: listing.id,
      observedPrice: result.price,
      previousPrice,
      changePercent,
      changeAmount,
    },
  });

  const deal = await detectDeal({
    listingId: listing.id,
    variantId: variant.id,
    currentPrice: result.price,
    previousPrice,
    lowestPrice: listing.lowestPrice,
    highestPrice: listing.highestPrice,
    retailerSlug: result.retailerSlug,
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
