import { prisma, calculateChangePercent } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';
import { getProviders, getProvider } from './providers';
import { detectDeal, checkAlertRules } from './deals';

/**
 * Tüm retailer'lardan veya belirli bir retailer'dan fiyat güncellemesi yapar.
 * 1) Önce DB'deki mevcut listing URL'lerini doğrudan scrape eder (daha güvenilir)
 * 2) URL'si olmayan varyantlar için arama tabanlı keşif yapar (fallback)
 */
export async function runSync(retailerSlug?: string) {
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

  try {
    const providers = retailerSlug ? [getProvider(retailerSlug)].filter(Boolean) : getProviders();

    // ── Aşama 1: Mevcut URL'lerden doğrudan fiyat çekme ──
    console.log('[sync] Aşama 1: Mevcut listing URL\'lerinden fiyat güncelleniyor...');
    for (const provider of providers) {
      if (!provider) continue;

      const retailer = await prisma.retailer.findUnique({
        where: { slug: provider.retailerSlug },
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

      console.log(`[sync] ${provider.retailerSlug}: ${existingListings.length} mevcut listing bulundu`);

      for (const listing of existingListings) {
        try {
          // URL sahte/search URL ise atla (seed mock verisi)
          if (listing.productUrl.includes('/search?q=') || listing.productUrl.includes('/ara?q=') || listing.productUrl.includes('/arama?q=') || listing.productUrl.includes('/s?k=') || listing.productUrl.includes('/sr?q=')) {
            continue;
          }

          const result = await provider.scrapeProductPage(listing.productUrl);
          itemsScanned++;

          if (result) {
            const matched = await upsertListing(result, retailer.id);
            if (matched) {
              itemsMatched++;
              if (matched.isDeal) dealsFound++;
            }
          }

          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          console.error(`[sync] ${provider.retailerSlug} - URL scrape hatası (${listing.productUrl}):`, err);
        }
      }
    }

    // ── Aşama 2: Arama tabanlı keşif (URL'si olmayanlar için) ──
    console.log('[sync] Aşama 2: Arama tabanlı keşif...');
    const families = await prisma.productFamily.findMany({
      where: { isActive: true },
      select: { name: true },
    });

    for (const provider of providers) {
      if (!provider) continue;

      const retailer = await prisma.retailer.findUnique({
        where: { slug: provider.retailerSlug },
      });
      if (!retailer || !retailer.isActive) continue;

      const uniqueQueries = [...new Set(families.map((f) => f.name))];

      for (const query of uniqueQueries) {
        try {
          const results = await provider.search(query);
          itemsScanned += results.length;

          for (const result of results) {
            const matched = await upsertListing(result, retailer.id);
            if (matched) {
              itemsMatched++;
              if (matched.isDeal) dealsFound++;
            }
          }

          // Rate limiting
          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          console.error(`[sync] ${provider.retailerSlug} - "${query}" hatası:`, err);
        }
      }
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        itemsScanned,
        itemsMatched,
        dealsFound,
      },
    });

    console.log(`[sync] Tamamlandı: ${itemsScanned} taranan, ${itemsMatched} eşleşen, ${dealsFound} fırsat`);
    return { jobId: syncJob.id, itemsScanned, itemsMatched, dealsFound };
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errors: error instanceof Error ? error.message : 'Unknown error',
        itemsScanned,
        itemsMatched,
        dealsFound,
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
      productUrl: result.productUrl,
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
