import { PrismaClient } from '@prisma/client';
import { PRODUCT_URLS } from './product-urls';
import { SAMSUNG_PRODUCT_URLS } from './samsung-product-urls';

const prisma = new PrismaClient();

const FAMILIES = [
  { name: 'iPhone 17', brand: 'Apple', sortOrder: 1, variants: { storages: [256, 512], colors: ['Black', 'White', 'Fog Blue', 'Lavender', 'Sage'] } },
  { name: 'iPhone 17 Air', brand: 'Apple', sortOrder: 2, variants: { storages: [256, 512], colors: ['Black', 'White', 'Fog Blue', 'Lavender', 'Sage'] } },
  { name: 'iPhone 17 Pro', brand: 'Apple', sortOrder: 3, variants: { storages: [256, 512, 1024], colors: ['Obsidian', 'Silver', 'Cosmic Orange'] } },
  { name: 'iPhone 17 Pro Max', brand: 'Apple', sortOrder: 4, variants: { storages: [256, 512, 1024], colors: ['Obsidian', 'Silver', 'Cosmic Orange'] } },
  { name: 'iPhone 16', brand: 'Apple', sortOrder: 5, variants: { storages: [128, 256, 512], colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'] } },
  { name: 'iPhone 16 Pro', brand: 'Apple', sortOrder: 6, variants: { storages: [128, 256, 512, 1024], colors: ['Natural Titanium', 'Black Titanium', 'White Titanium', 'Desert Titanium'] } },
  { name: 'iPhone 16 Pro Max', brand: 'Apple', sortOrder: 7, variants: { storages: [256, 512, 1024], colors: ['Natural Titanium', 'Black Titanium', 'White Titanium', 'Desert Titanium'] } },
  { name: 'iPhone 15', brand: 'Apple', sortOrder: 8, variants: { storages: [128, 256, 512], colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] } },
  { name: 'iPhone 14', brand: 'Apple', sortOrder: 9, variants: { storages: [128, 256, 512], colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red', 'Yellow'] } },
  { name: 'iPhone 13', brand: 'Apple', sortOrder: 10, variants: { storages: [128, 256, 512], colors: ['Midnight', 'Starlight', 'Blue', 'Pink', 'Green', 'Red'] } },
  // Samsung Galaxy S-series
  { name: 'Galaxy S26 Ultra', brand: 'Samsung', sortOrder: 11, variants: { storages: [256, 512, 1024], colors: ['Titanium Black', 'Titanium Gray', 'Titanium Blue', 'Titanium Silver'] } },
  { name: 'Galaxy S25 Ultra', brand: 'Samsung', sortOrder: 12, variants: { storages: [256, 512, 1024], colors: ['Titanium Black', 'Titanium Gray', 'Titanium Blue', 'Titanium Silverblue'] } },
  { name: 'Galaxy S24 Ultra', brand: 'Samsung', sortOrder: 13, variants: { storages: [256, 512, 1024], colors: ['Titanium Black', 'Titanium Gray', 'Titanium Violet', 'Titanium Yellow'] } },
  // Samsung Galaxy A-series
  { name: 'Galaxy A56', brand: 'Samsung', sortOrder: 14, variants: { storages: [128, 256], colors: ['Black', 'Gray', 'Lilac', 'Green'] } },
  { name: 'Galaxy A36', brand: 'Samsung', sortOrder: 15, variants: { storages: [128, 256], colors: ['Black', 'Navy', 'Lilac', 'Green'] } },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function storageLabel(gb: number): string {
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
}

async function waitForDb(maxRetries = 5): Promise<void> {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Veritabanı bağlantısı başarılı');
      return;
    } catch (err) {
      console.warn(`⏳ DB bağlantı denemesi ${i}/${maxRetries} başarısız, ${5 * i}s bekleniyor...`);
      if (i === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 5000 * i));
    }
  }
}

async function main() {
  // ─── Neon compute'u uyandır ─────────────────────────
  await waitForDb();

  // Tüm işlemler upsert — mevcut veriler (fiyat geçmişi, alertler vb.) korunur.
  // Sıfırdan başlatmak istersen: pnpm db:seed -- --reset
  const forceReset = process.argv.includes('--reset');

  if (forceReset) {
    console.log('🗑️  --reset bayrağı algılandı, tüm veriler siliniyor...');
    await prisma.alertEvent.deleteMany();
    await prisma.alertRule.deleteMany();
    await prisma.priceSnapshot.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.syncJob.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.productFamily.deleteMany();
    await prisma.retailer.deleteMany();
    console.log('✅ Tüm veriler silindi, sıfırdan oluşturuluyor...');
  } else {
    console.log('🔄 Mevcut veriler korunarak güncelleniyor (sıfırlamak için: pnpm db:seed -- --reset)');
  }

  // ─── Retailer'lar ─────────────────────────────────────
  const retailers = await Promise.all([
    prisma.retailer.upsert({
      where: { slug: 'hepsiburada' },
      update: {},
      create: { name: 'Hepsiburada', slug: 'hepsiburada', baseUrl: 'https://www.hepsiburada.com', logoUrl: '/retailers/hepsiburada.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'trendyol' },
      update: {},
      create: { name: 'Trendyol', slug: 'trendyol', baseUrl: 'https://www.trendyol.com', logoUrl: '/retailers/trendyol.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'n11' },
      update: {},
      create: { name: 'N11', slug: 'n11', baseUrl: 'https://www.n11.com', logoUrl: '/retailers/n11.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'amazon' },
      update: {},
      create: { name: 'Amazon', slug: 'amazon', baseUrl: 'https://www.amazon.com.tr', logoUrl: '/retailers/amazon.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'pazarama' },
      update: {},
      create: { name: 'Pazarama', slug: 'pazarama', baseUrl: 'https://www.pazarama.com', logoUrl: '/retailers/pazarama.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'idefix' },
      update: { isActive: false },
      create: { name: 'İdefix', slug: 'idefix', baseUrl: 'https://www.idefix.com', logoUrl: '/retailers/idefix.svg', isActive: false },
    }),
    prisma.retailer.upsert({
      where: { slug: 'mediamarkt' },
      update: {},
      create: { name: 'MediaMarkt', slug: 'mediamarkt', baseUrl: 'https://www.mediamarkt.com.tr', logoUrl: '/retailers/mediamarkt.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'a101' },
      update: {},
      create: { name: 'A101', slug: 'a101', baseUrl: 'https://www.a101.com.tr', logoUrl: '/retailers/a101.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'migros' },
      update: {},
      create: { name: 'Migros', slug: 'migros', baseUrl: 'https://www.migros.com.tr', logoUrl: '/retailers/migros.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'bim' },
      update: {},
      create: { name: 'BİM', slug: 'bim', baseUrl: 'https://www.bim.com.tr', logoUrl: '/retailers/bim.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'sok' },
      update: {},
      create: { name: 'ŞOK', slug: 'sok', baseUrl: 'https://www.sokmarket.com.tr', logoUrl: '/retailers/sok.svg' },
    }),
    prisma.retailer.upsert({
      where: { slug: 'beymen' },
      update: {},
      create: { name: 'Beymen', slug: 'beymen', baseUrl: 'https://www.beymen.com', logoUrl: '/retailers/beymen.svg' },
    }),
  ]);
  console.log(`✅ ${retailers.length} retailer oluşturuldu`);

  // ─── Product Families & Variants ──────────────────────
  let familyCount = 0;
  let variantCount = 0;

  for (const f of FAMILIES) {
    const brand = f.brand ?? 'Apple';
    const familySlug = slugify(brand === 'Samsung' ? `samsung-${f.name}` : f.name);
    const family = await prisma.productFamily.upsert({
      where: { slug: familySlug },
      update: { sortOrder: f.sortOrder, brand },
      create: { name: f.name, slug: familySlug, brand, sortOrder: f.sortOrder },
    });
    familyCount++;

    for (const storageGb of f.variants.storages) {
      for (const color of f.variants.colors) {
        const normalizedName = `${f.name} ${storageLabel(storageGb)} ${color}`;
        const variantSlug = slugify(brand === 'Samsung' ? `samsung-${normalizedName}` : normalizedName);

        await prisma.productVariant.upsert({
          where: { slug: variantSlug },
          update: {},
          create: {
            familyId: family.id,
            color,
            storageGb,
            normalizedName,
            slug: variantSlug,
          },
        });
        variantCount++;
      }
    }
  }
  console.log(`✅ ${familyCount} aile, ${variantCount} varyant oluşturuldu`);

  // ─── Brand breakdown ──────────────────────────────────
  const appleCount = FAMILIES.filter(f => (f.brand ?? 'Apple') === 'Apple').length;
  const samsungCount = FAMILIES.filter(f => f.brand === 'Samsung').length;
  const appleVariants = FAMILIES.filter(f => (f.brand ?? 'Apple') === 'Apple').reduce((sum, f) => sum + f.variants.storages.length * f.variants.colors.length, 0);
  const samsungVariants = FAMILIES.filter(f => f.brand === 'Samsung').reduce((sum, f) => sum + f.variants.storages.length * f.variants.colors.length, 0);
  console.log(`   📱 Apple: ${appleCount} aile, ${appleVariants} varyant`);
  console.log(`   📱 Samsung: ${samsungCount} aile, ${samsungVariants} varyant`);

  // ─── Manuel URL'lerden Listing'ler ─────────────────────
  // product-urls.ts + samsung-product-urls.ts'deki URL'leri DB'ye yaz
  let manualListingCount = 0;

  const allRetailers = await prisma.retailer.findMany();
  const retailerMap = Object.fromEntries(allRetailers.map(r => [r.slug, r]));

  const allProductUrls: Record<string, Record<string, string>> = {
    ...PRODUCT_URLS,
    ...SAMSUNG_PRODUCT_URLS,
  };

  for (const [variantSlug, urls] of Object.entries(allProductUrls)) {
    const variant = await prisma.productVariant.findUnique({
      where: { slug: variantSlug },
      include: { family: true },
    });
    if (!variant) {
      console.warn(`⚠️  Varyant bulunamadı: ${variantSlug}`);
      continue;
    }

    const brand = variant.family.brand || 'Apple';

    for (const [rSlug, url] of Object.entries(urls)) {
      const retailer = retailerMap[rSlug];
      if (!retailer) {
        console.warn(`⚠️  Retailer bulunamadı: ${rSlug}`);
        continue;
      }

      await prisma.listing.upsert({
        where: {
          variantId_retailerId: {
            variantId: variant.id,
            retailerId: retailer.id,
          },
        },
        update: { productUrl: url },
        create: {
          variantId: variant.id,
          retailerId: retailer.id,
          retailerProductTitle: `${brand} ${variant.normalizedName}`,
          productUrl: url,
          stockStatus: 'UNKNOWN',
          lastSeenAt: null,
        },
      });
      manualListingCount++;
    }
  }
  console.log(`✅ ${manualListingCount} manuel URL listing oluşturuldu`);

  // ─── Listing coverage diagnostics ──────────────────────
  const iphoneUrlCount = Object.keys(PRODUCT_URLS).length;
  const samsungUrlCount = Object.keys(SAMSUNG_PRODUCT_URLS).length;
  console.log(`   🔗 iPhone URL entries: ${iphoneUrlCount}`);
  console.log(`   🔗 Samsung URL entries: ${samsungUrlCount}`);

  // Check for Samsung variants missing from URL files
  const samsungFamilies = FAMILIES.filter(f => f.brand === 'Samsung');
  let missingUrlCount = 0;
  for (const sf of samsungFamilies) {
    for (const storageGb of sf.variants.storages) {
      for (const color of sf.variants.colors) {
        const normalizedName = `${sf.name} ${storageLabel(storageGb)} ${color}`;
        const variantSlug = slugify(`samsung-${normalizedName}`);
        if (!SAMSUNG_PRODUCT_URLS[variantSlug]) {
          console.warn(`   ⚠️  Samsung URL eksik: ${variantSlug}`);
          missingUrlCount++;
        }
      }
    }
  }
  if (missingUrlCount > 0) {
    console.warn(`   ⚠️  ${missingUrlCount} Samsung varyantının URL'si yok — bu varyantlar sync edilmeyecek!`);
  } else {
    console.log(`   ✅ Tüm Samsung varyantlarının URL'si mevcut`);
  }

  // ─── Varsayılan Uygulama Ayarları ─────────────────────
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      notifyDropPercent: 1,
      notifyDropAmount: 100,
      notifyCooldownMinutes: 240,
      notifyAllTimeLow: true,
      notifyEnabled: true,
      notifyMinPrice: null,
      notifyMaxPrice: null,
    },
  });
  console.log('✅ Varsayılan bildirim ayarları oluşturuldu');

  // ─── Varsayılan Worker Konfigürasyonu ─────────────────
  await prisma.workerConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      syncIntervalMinMs: 60000,
      syncIntervalMaxMs: 3600000,
      requestDelayMinMs: 1500,
      requestDelayMaxMs: 3000,
      jitterPercent: 30,
      globalConcurrency: 1,
      providerConcurrency: 1,
      maxRetries: 2,
      cooldownMultiplier: 1.5,
      blockCooldownMinutes: 10,
      activeMode: 'balanced',
    },
  });
  console.log('✅ Varsayılan worker konfigürasyonu oluşturuldu');

  // ─── Provider Metrikleri (tüm retailer'lar) ───────────
  const allRetailerSlugs = await prisma.retailer.findMany({ select: { slug: true } });
  for (const r of allRetailerSlugs) {
    await prisma.providerMetrics.upsert({
      where: { retailerSlug: r.slug },
      update: {},
      create: { retailerSlug: r.slug },
    });
  }
  console.log(`✅ ${allRetailerSlugs.length} provider metrik kaydı oluşturuldu`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
