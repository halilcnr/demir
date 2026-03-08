import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ─── Retailer'lar ─────────────────────────────────────
  const retailers = await Promise.all([
    prisma.retailer.upsert({
      where: { slug: 'hepsiburada' },
      update: {},
      create: {
        name: 'Hepsiburada',
        slug: 'hepsiburada',
        baseUrl: 'https://www.hepsiburada.com',
        logoUrl: '/retailers/hepsiburada.svg',
      },
    }),
    prisma.retailer.upsert({
      where: { slug: 'trendyol' },
      update: {},
      create: {
        name: 'Trendyol',
        slug: 'trendyol',
        baseUrl: 'https://www.trendyol.com',
        logoUrl: '/retailers/trendyol.svg',
      },
    }),
    prisma.retailer.upsert({
      where: { slug: 'n11' },
      update: {},
      create: {
        name: 'N11',
        slug: 'n11',
        baseUrl: 'https://www.n11.com',
        logoUrl: '/retailers/n11.svg',
      },
    }),
    prisma.retailer.upsert({
      where: { slug: 'amazon' },
      update: {},
      create: {
        name: 'Amazon',
        slug: 'amazon',
        baseUrl: 'https://www.amazon.com.tr',
        logoUrl: '/retailers/amazon.svg',
      },
    }),
  ]);

  console.log(`✅ ${retailers.length} retailer oluşturuldu`);

  // ─── iPhone Modelleri ─────────────────────────────────
  const models = [
    { model: 'iPhone 13', variants: ['128GB', '256GB'] },
    { model: 'iPhone 13 Mini', variants: ['128GB', '256GB'] },
    { model: 'iPhone 14', variants: ['128GB', '256GB'] },
    { model: 'iPhone 14 Plus', variants: ['128GB', '256GB'] },
    { model: 'iPhone 14 Pro', variants: ['128GB', '256GB', '512GB', '1TB'] },
    { model: 'iPhone 14 Pro Max', variants: ['128GB', '256GB', '512GB', '1TB'] },
    { model: 'iPhone 15', variants: ['128GB', '256GB'] },
    { model: 'iPhone 15 Plus', variants: ['128GB', '256GB'] },
    { model: 'iPhone 15 Pro', variants: ['128GB', '256GB', '512GB', '1TB'] },
    { model: 'iPhone 15 Pro Max', variants: ['256GB', '512GB', '1TB'] },
    { model: 'iPhone 16', variants: ['128GB', '256GB'] },
    { model: 'iPhone 16 Plus', variants: ['128GB', '256GB'] },
    { model: 'iPhone 16 Pro', variants: ['128GB', '256GB', '512GB', '1TB'] },
    { model: 'iPhone 16 Pro Max', variants: ['256GB', '512GB', '1TB'] },
  ];

  let productCount = 0;

  for (const m of models) {
    for (const storage of m.variants) {
      const slug = `${m.model.toLowerCase().replace(/\s+/g, '-')}-${storage.toLowerCase()}`;
      await prisma.product.upsert({
        where: { slug },
        update: {},
        create: {
          brand: 'Apple',
          model: m.model,
          storage,
          slug,
        },
      });
      productCount++;
    }
  }

  console.log(`✅ ${productCount} ürün oluşturuldu`);

  // ─── Mock Listing & Price Data ────────────────────────
  const products = await prisma.product.findMany({ take: 5 });
  const allRetailers = await prisma.retailer.findMany();

  for (const product of products) {
    for (const retailer of allRetailers) {
      const basePrice = 30000 + Math.random() * 40000;
      const price = Math.round(basePrice / 100) * 100;

      const listing = await prisma.productListing.upsert({
        where: {
          productId_retailerId: {
            productId: product.id,
            retailerId: retailer.id,
          },
        },
        update: { currentPrice: price },
        create: {
          productId: product.id,
          retailerId: retailer.id,
          externalUrl: `${retailer.baseUrl}/search?q=${encodeURIComponent(product.model + ' ' + product.storage)}`,
          currentPrice: price,
          lowestPrice: price - 2000,
          highestPrice: price + 5000,
          inStock: true,
          lastSyncedAt: new Date(),
        },
      });

      // Son 30 gün için mock fiyat geçmişi
      for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const variation = price + (Math.random() - 0.5) * 4000;
        const dayPrice = Math.round(variation / 100) * 100;

        await prisma.priceHistory.create({
          data: {
            listingId: listing.id,
            price: dayPrice,
            recordedAt: date,
          },
        });
      }
    }
  }

  console.log('✅ Mock listing ve fiyat geçmişi oluşturuldu');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
