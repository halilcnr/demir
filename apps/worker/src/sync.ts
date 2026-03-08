import { prisma, calculateChangePercent } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';
import { getProviders, getProvider } from './providers';
import { detectDeal, checkAlertRules } from './deals';
import {
  ProviderBlockedError,
  RetryableProviderError,
  ListingNotFoundError,
  ParseError,
} from './errors';
import {
  resetCycleState,
  isBlockedThisCycle,
  recordSuccess,
  recordFailure,
  recordBlocked,
} from './provider-health';

/**
 * Tüm retailer'lardan veya belirli bir retailer'dan fiyat güncellemesi yapar.
 * 1) Önce DB'deki mevcut listing URL'lerini doğrudan scrape eder (daha güvenilir)
 * 2) URL'si olmayan varyantlar için arama tabanlı keşif yapar (fallback) — şu an devre dışı
 */
export async function runSync(retailerSlug?: string) {
  const startMs = Date.now();
  resetCycleState();

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
    const providers = retailerSlug ? [getProvider(retailerSlug)].filter(Boolean) : getProviders();

    // ── Aşama 1: Mevcut URL'lerden doğrudan fiyat çekme ──
    console.log('[sync] Aşama 1: Mevcut listing URL\'lerinden fiyat güncelleniyor...');

    for (const provider of providers) {
      if (!provider) continue;

      const slug = provider.retailerSlug;

      // Skip if already blocked in this cycle
      if (isBlockedThisCycle(slug)) {
        console.log(`[sync] ${slug} skipped — blocked this cycle`);
        continue;
      }

      const retailer = await prisma.retailer.findUnique({
        where: { slug },
      });
      if (!retailer || !retailer.isActive) continue;

      // Bu retailer'daki URL'si olan aktif listing'leri al
      const existingListings = await prisma.listing.findMany({
        where: {
          retailerId: retailer.id,
          isActive: true,
          productUrl: { not: '' },
        },
        include: {
          variant: { include: { family: true } },
        },
      });

      console.log(`[sync] ${slug}: ${existingListings.length} mevcut listing bulundu`);

      for (const listing of existingListings) {
        // Re-check block status inside listing loop (may have been blocked mid-cycle)
        if (isBlockedThisCycle(slug)) {
          console.log(`[sync] ${slug} blocked mid-cycle, skipping remaining listings`);
          break;
        }

        try {
          // URL sahte/search URL ise atla
          if (listing.productUrl.includes('/search?q=') || listing.productUrl.includes('/ara?q=') || listing.productUrl.includes('/arama?q=') || listing.productUrl.includes('/s?k=') || listing.productUrl.includes('/sr?q=')) {
            continue;
          }

          // Mark as checked regardless of outcome
          await prisma.listing.update({
            where: { id: listing.id },
            data: { lastCheckedAt: new Date() },
          });

          const result = await provider.scrapeProductPage(listing.productUrl);
          itemsScanned++;

          if (result) {
            const matched = await upsertListing(result, retailer.id);
            if (matched) {
              itemsMatched++;
              successCount++;

              // Update listing success timestamp
              await prisma.listing.update({
                where: { id: listing.id },
                data: { lastSuccessAt: new Date() },
              });

              await recordSuccess(slug);

              if (matched.isDeal) dealsFound++;
            }
          }

          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          itemsScanned++;

          if (err instanceof ProviderBlockedError) {
            blockedCount++;
            console.error(`[sync] ${slug} provider blocked (HTTP 403)`);
            await recordBlocked(slug);

            // Update listing blocked timestamp
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastBlockedAt: new Date(), lastFailureAt: new Date() },
            });

            errorLog.push(`${slug}: provider blocked (HTTP 403)`);
            lastErrorMessage = err.message;
            // Break out — skip remaining listings for this provider
            break;
          }

          if (err instanceof ListingNotFoundError) {
            console.warn(`[sync] ${slug} listing not found (HTTP 404) — ${listing.productUrl}`);
            // Mark listing as inactive
            await prisma.listing.update({
              where: { id: listing.id },
              data: {
                isActive: false,
                lastFailureAt: new Date(),
              },
            });
            failureCount++;
            errorLog.push(`${slug}: listing removed (404) — ${listing.productUrl}`);
            continue;
          }

          if (err instanceof ParseError) {
            console.error(`[sync] ${slug} parse failed — ${listing.productUrl}`);
            failureCount++;
            await recordFailure(slug);
            await prisma.listing.update({
              where: { id: listing.id },
              data: { lastFailureAt: new Date() },
            });
            errorLog.push(`${slug}: parse failed — ${listing.productUrl}`);
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
            continue;
          }

          // Network / timeout / unknown errors
          const msg = err instanceof Error ? err.message : String(err);
          const isTimeout = msg.includes('timeout') || msg.includes('abort');
          console.error(`[sync] ${slug} ${isTimeout ? 'timeout' : 'error'} — ${listing.productUrl}:`, msg);
          failureCount++;
          await recordFailure(slug);
          await prisma.listing.update({
            where: { id: listing.id },
            data: { lastFailureAt: new Date() },
          });
          errorLog.push(`${slug}: ${isTimeout ? 'timeout' : 'error'} — ${listing.productUrl}`);
        }
      }
    }

    // ── Aşama 2: Arama tabanlı keşif (şu an devre dışı — park halinde) ──
    // ...

    const durationMs = Date.now() - startMs;

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

    console.log(
      `[sync] Tamamlandı (${(durationMs / 1000).toFixed(1)}s): ` +
      `${itemsScanned} taranan, ${itemsMatched} eşleşen, ${dealsFound} fırsat, ` +
      `${successCount} başarılı, ${failureCount} hata, ${blockedCount} engellendi`
    );
    return { jobId: syncJob.id, itemsScanned, itemsMatched, dealsFound };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    lastErrorMessage = error instanceof Error ? error.message : 'Unknown error';

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
