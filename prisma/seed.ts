import { PrismaClient } from '@prisma/client';
import { PRODUCT_URLS } from './product-urls';

const prisma = new PrismaClient();

const FAMILIES = [
  { name: 'iPhone 13', sortOrder: 1, variants: { storages: [128, 256], colors: ['Midnight', 'Starlight', 'Blue', 'Pink', 'Green', 'Red'] } },
  { name: 'iPhone 13 Mini', sortOrder: 2, variants: { storages: [128, 256], colors: ['Midnight', 'Starlight', 'Blue', 'Pink', 'Green', 'Red'] } },
  { name: 'iPhone 14', sortOrder: 3, variants: { storages: [128, 256], colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red', 'Yellow'] } },
  { name: 'iPhone 14 Plus', sortOrder: 4, variants: { storages: [128, 256], colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red', 'Yellow'] } },
  { name: 'iPhone 14 Pro', sortOrder: 5, variants: { storages: [128, 256, 512, 1024], colors: ['Space Black', 'Silver', 'Gold', 'Deep Purple'] } },
  { name: 'iPhone 14 Pro Max', sortOrder: 6, variants: { storages: [128, 256, 512, 1024], colors: ['Space Black', 'Silver', 'Gold', 'Deep Purple'] } },
  { name: 'iPhone 15', sortOrder: 7, variants: { storages: [128, 256], colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] } },
  { name: 'iPhone 15 Plus', sortOrder: 8, variants: { storages: [128, 256], colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] } },
  { name: 'iPhone 15 Pro', sortOrder: 9, variants: { storages: [128, 256, 512, 1024], colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'] } },
  { name: 'iPhone 15 Pro Max', sortOrder: 10, variants: { storages: [256, 512, 1024], colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'] } },
  { name: 'iPhone 16', sortOrder: 11, variants: { storages: [128, 256, 512], colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'] } },
  { name: 'iPhone 16 Plus', sortOrder: 12, variants: { storages: [128, 256, 512], colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'] } },
  { name: 'iPhone 16 Pro', sortOrder: 13, variants: { storages: [128, 256, 512, 1024], colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium', 'Desert Titanium'] } },
  { name: 'iPhone 16 Pro Max', sortOrder: 14, variants: { storages: [256, 512, 1024], colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium', 'Desert Titanium'] } },
  { name: 'iPhone 17', sortOrder: 15, variants: { storages: [128, 256, 512], colors: ['Black', 'White', 'Green', 'Blue'] } },
  { name: 'iPhone 17 Pro', sortOrder: 16, variants: { storages: [256, 512, 1024], colors: ['Natural Titanium', 'Dark Titanium', 'White Titanium', 'Desert Titanium'] } },
  { name: 'iPhone 17 Pro Max', sortOrder: 17, variants: { storages: [256, 512, 1024], colors: ['Natural Titanium', 'Dark Titanium', 'White Titanium', 'Desert Titanium'] } },
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

async function main() {
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
  ]);
  console.log(`✅ ${retailers.length} retailer oluşturuldu`);

  // ─── Product Families & Variants ──────────────────────
  let familyCount = 0;
  let variantCount = 0;

  for (const f of FAMILIES) {
    const familySlug = slugify(f.name);
    const family = await prisma.productFamily.upsert({
      where: { slug: familySlug },
      update: { sortOrder: f.sortOrder },
      create: { name: f.name, slug: familySlug, sortOrder: f.sortOrder },
    });
    familyCount++;

    for (const storageGb of f.variants.storages) {
      for (const color of f.variants.colors) {
        const normalizedName = `${f.name} ${storageLabel(storageGb)} ${color}`;
        const variantSlug = slugify(normalizedName);

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

  // ─── Manuel URL'lerden Listing'ler ─────────────────────
  // product-urls.ts'deki URL'leri DB'ye yaz
  let manualListingCount = 0;

  const allRetailers = await prisma.retailer.findMany();
  const retailerMap = Object.fromEntries(allRetailers.map(r => [r.slug, r]));

  for (const [variantSlug, urls] of Object.entries(PRODUCT_URLS)) {
    const variant = await prisma.productVariant.findUnique({ where: { slug: variantSlug } });
    if (!variant) {
      console.warn(`⚠️  Varyant bulunamadı: ${variantSlug}`);
      continue;
    }

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
          retailerProductTitle: `Apple ${variant.normalizedName}`,
          productUrl: url,
          stockStatus: 'UNKNOWN',
          lastSeenAt: null,
        },
      });
      manualListingCount++;
    }
  }
  console.log(`✅ ${manualListingCount} manuel URL listing oluşturuldu`);

  // ─── Mock Listings (sadece URL'si olmayan varyantlar için) ──
  const sampleVariants = await prisma.productVariant.findMany({ take: 10 });

  let listingCount = 0;
  for (const variant of sampleVariants) {
    for (const retailer of retailers) {
      // Manuel URL'si varsa atla
      const existing = await prisma.listing.findUnique({
        where: { variantId_retailerId: { variantId: variant.id, retailerId: retailer.id } },
      });
      if (existing && existing.productUrl && !existing.productUrl.includes('/search?q=')) continue;
      const basePrice = 25000 + Math.random() * 55000;
      const price = Math.round(basePrice / 100) * 100;
      const previousPrice = price + Math.round(Math.random() * 3000 / 100) * 100;

      const listing = await prisma.listing.upsert({
        where: {
          variantId_retailerId: {
            variantId: variant.id,
            retailerId: retailer.id,
          },
        },
        update: { currentPrice: price, previousPrice },
        create: {
          variantId: variant.id,
          retailerId: retailer.id,
          retailerProductTitle: `Apple ${variant.normalizedName}`,
          productUrl: `${retailer.baseUrl}/search?q=${encodeURIComponent(variant.normalizedName)}`,
          currentPrice: price,
          previousPrice,
          lowestPrice: price - 2000,
          highestPrice: price + 5000,
          sellerName: retailer.name,
          stockStatus: 'IN_STOCK',
          isDeal: Math.random() > 0.7,
          dealScore: Math.random() > 0.7 ? Math.round(Math.random() * 60 + 40) : null,
          lastSeenAt: new Date(),
        },
      });
      listingCount++;

      // Son 30 gün mock price snapshot
      for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const variation = price + (Math.random() - 0.5) * 6000;
        const dayPrice = Math.round(variation / 100) * 100;
        const prev = i < 30 ? dayPrice + Math.round((Math.random() - 0.3) * 2000 / 100) * 100 : null;

        await prisma.priceSnapshot.create({
          data: {
            listingId: listing.id,
            observedPrice: dayPrice,
            previousPrice: prev,
            changePercent: prev ? ((dayPrice - prev) / prev) * 100 : null,
            changeAmount: prev ? dayPrice - prev : null,
            observedAt: date,
          },
        });
      }
    }
  }
  console.log(`✅ ${listingCount} listing ve fiyat geçmişi oluşturuldu`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
