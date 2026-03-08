import { prisma } from '@/lib/db';
import { getProviders, getProvider } from '@/lib/providers';
import { calculateChangePercent, slugify } from '@/lib/utils';
import type { ScrapedProduct } from '@/types';

/**
 * Tüm retailer'lardan veya belirli bir retailer'dan fiyat güncellemesi yapar.
 * SyncJob kaydı oluşturur, provider'lardan veri çeker, DB'ye yazar, alarm kontrolü yapar.
 */
export async function runSync(retailerSlug?: string) {
  // SyncJob oluştur
  const syncJob = await prisma.syncJob.create({
    data: {
      retailerId: retailerSlug
        ? (await prisma.retailer.findUnique({ where: { slug: retailerSlug } }))?.id
        : undefined,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  let itemsFound = 0;
  let itemsUpdated = 0;

  try {
    const providers = retailerSlug ? [getProvider(retailerSlug)].filter(Boolean) : getProviders();

    // Her product için her provider'dan arama yap
    const products = await prisma.product.findMany({ where: { isActive: true } });

    for (const provider of providers) {
      if (!provider) continue;

      const retailer = await prisma.retailer.findUnique({
        where: { slug: provider.retailerSlug },
      });
      if (!retailer || !retailer.isActive) continue;

      // Benzersiz search query'leri oluştur (model bazlı)
      const uniqueQueries = [...new Set(products.map((p) => `${p.model} ${p.storage}`))];

      for (const query of uniqueQueries) {
        try {
          const results = await provider.search(query);
          itemsFound += results.length;

          for (const result of results) {
            const updated = await upsertListing(result, retailer.id);
            if (updated) itemsUpdated++;
          }

          // Rate limiting
          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          console.error(`[sync] ${provider.retailerSlug} - "${query}" hatası:`, err);
        }
      }
    }

    // SyncJob tamamlandı
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        itemsFound,
        itemsUpdated,
      },
    });

    return { jobId: syncJob.id, itemsFound, itemsUpdated };
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        itemsFound,
        itemsUpdated,
      },
    });
    throw error;
  }
}

async function upsertListing(result: ScrapedProduct, retailerId: string): Promise<boolean> {
  // Ürünü bul veya oluştur
  const productSlug = slugify(`${result.model} ${result.storage}`);
  let product = await prisma.product.findUnique({ where: { slug: productSlug } });

  if (!product) {
    product = await prisma.product.create({
      data: {
        brand: 'Apple',
        model: result.model,
        storage: result.storage,
        color: result.color,
        slug: productSlug,
      },
    });
  }

  // Mevcut listing bul
  const existing = await prisma.productListing.findUnique({
    where: {
      productId_retailerId: {
        productId: product.id,
        retailerId,
      },
    },
  });

  const previousPrice = existing?.currentPrice ?? null;

  // Listing upsert
  const listing = await prisma.productListing.upsert({
    where: {
      productId_retailerId: {
        productId: product.id,
        retailerId,
      },
    },
    update: {
      currentPrice: result.price,
      lowestPrice: existing?.lowestPrice
        ? Math.min(existing.lowestPrice, result.price)
        : result.price,
      highestPrice: existing?.highestPrice
        ? Math.max(existing.highestPrice, result.price)
        : result.price,
      seller: result.seller,
      inStock: result.inStock,
      lastSyncedAt: new Date(),
      externalUrl: result.url,
    },
    create: {
      productId: product.id,
      retailerId,
      externalUrl: result.url,
      currentPrice: result.price,
      lowestPrice: result.price,
      highestPrice: result.price,
      seller: result.seller,
      inStock: result.inStock,
      lastSyncedAt: new Date(),
    },
  });

  // Fiyat geçmişi kaydet
  const changePercent = previousPrice
    ? calculateChangePercent(previousPrice, result.price)
    : null;

  await prisma.priceHistory.create({
    data: {
      listingId: listing.id,
      price: result.price,
      previousPrice,
      changePercent,
    },
  });

  // Alarm kontrolü
  if (previousPrice && previousPrice !== result.price) {
    await checkAlerts(product.id, listing.id, previousPrice, result.price);
  }

  return true;
}

async function checkAlerts(
  productId: string,
  listingId: string,
  oldPrice: number,
  newPrice: number
) {
  const rules = await prisma.alertRule.findMany({
    where: { productId, isActive: true },
    include: { product: true },
  });

  for (const rule of rules) {
    let shouldTrigger = false;
    let message = '';

    switch (rule.type) {
      case 'PRICE_DROP_PERCENT': {
        const drop = calculateChangePercent(oldPrice, newPrice);
        if (drop < 0 && Math.abs(drop) >= (rule.threshold ?? 5)) {
          shouldTrigger = true;
          message = `${rule.product.model} ${rule.product.storage} fiyatı %${Math.abs(drop).toFixed(1)} düştü! ${oldPrice.toLocaleString('tr-TR')} ₺ → ${newPrice.toLocaleString('tr-TR')} ₺`;
        }
        break;
      }
      case 'PRICE_BELOW': {
        if (rule.threshold && newPrice <= rule.threshold) {
          shouldTrigger = true;
          message = `${rule.product.model} ${rule.product.storage} hedef fiyatın (${rule.threshold.toLocaleString('tr-TR')} ₺) altına düştü: ${newPrice.toLocaleString('tr-TR')} ₺`;
        }
        break;
      }
      case 'NEW_LOWEST': {
        const listing = await prisma.productListing.findFirst({
          where: { id: listingId },
        });
        if (listing && listing.lowestPrice !== null && newPrice <= listing.lowestPrice) {
          shouldTrigger = true;
          message = `${rule.product.model} ${rule.product.storage} için yeni en düşük fiyat: ${newPrice.toLocaleString('tr-TR')} ₺`;
        }
        break;
      }
    }

    if (shouldTrigger) {
      await prisma.alertEvent.create({
        data: {
          alertRuleId: rule.id,
          listingId,
          message,
          oldPrice,
          newPrice,
          channel: 'IN_APP',
        },
      });

      await prisma.alertRule.update({
        where: { id: rule.id },
        data: { lastTriggered: new Date() },
      });
    }
  }
}
