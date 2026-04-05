/**
 * Samsung-only data cleanup script.
 * Deletes all Samsung price snapshots, analytics, notifications and resets listings.
 * iPhone / Apple data is UNTOUCHED.
 *
 * Usage: npx tsx prisma/cleanup-samsung.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Samsung verileri taranıyor...\n');

  // Step 1: Find all Samsung families
  const samsungFamilies = await prisma.productFamily.findMany({
    where: { brand: 'Samsung' },
    select: { id: true, name: true },
  });

  if (samsungFamilies.length === 0) {
    console.log('❌ Samsung ailesi bulunamadı, çıkılıyor.');
    return;
  }

  const familyIds = samsungFamilies.map(f => f.id);
  console.log(`📱 Samsung aileleri: ${samsungFamilies.map(f => f.name).join(', ')}`);

  // Step 2: Find all Samsung variants
  const samsungVariants = await prisma.productVariant.findMany({
    where: { familyId: { in: familyIds } },
    select: { id: true },
  });
  const variantIds = samsungVariants.map(v => v.id);
  console.log(`   ${variantIds.length} Samsung varyantı bulundu`);

  // Step 3: Find all Samsung listings
  const samsungListings = await prisma.listing.findMany({
    where: { variantId: { in: variantIds } },
    select: { id: true },
  });
  const listingIds = samsungListings.map(l => l.id);
  console.log(`   ${listingIds.length} Samsung listing bulundu`);

  if (listingIds.length === 0) {
    console.log('✅ Temizlenecek Samsung listing yok.');
    return;
  }

  // Step 4: Count what we're about to delete (for confirmation)
  const snapshotCount = await prisma.priceSnapshot.count({
    where: { listingId: { in: listingIds } },
  });
  const analyticsCount = await prisma.variantPriceAnalytics.count({
    where: { variantId: { in: variantIds } },
  });
  const alertEventCount = await prisma.alertEvent.count({
    where: { listingId: { in: listingIds } },
  });
  const dealEventCount = await prisma.dealEvent.count({
    where: { variantId: { in: variantIds } },
  });
  const notifCount = await prisma.notificationLog.count({
    where: { listingId: { in: listingIds } },
  });

  console.log('\n📊 Silinecek veriler:');
  console.log(`   PriceSnapshot:          ${snapshotCount}`);
  console.log(`   VariantPriceAnalytics:  ${analyticsCount}`);
  console.log(`   AlertEvent:             ${alertEventCount}`);
  console.log(`   DealEvent:              ${dealEventCount}`);
  console.log(`   NotificationLog:        ${notifCount}`);
  console.log(`   Listing reset:          ${listingIds.length} (fiyat/stok sıfırlanacak, kayıt silinmeyecek)`);

  // Step 5: Safety check — verify NO Apple data is touched
  const appleListingCheck = await prisma.listing.count({
    where: {
      id: { in: listingIds },
      variant: { family: { brand: { not: 'Samsung' } } },
    },
  });
  if (appleListingCheck > 0) {
    console.error(`\n❌ HATA: ${appleListingCheck} Apple listing Samsung olarak tespit edildi! İptal ediliyor.`);
    return;
  }
  console.log('\n✅ Güvenlik kontrolü geçti — Apple verileri etkilenmeyecek');

  // Step 6: Execute cleanup in a transaction
  console.log('\n🗑️  Samsung verileri temizleniyor...');

  await prisma.$transaction([
    // Delete price snapshots
    prisma.priceSnapshot.deleteMany({
      where: { listingId: { in: listingIds } },
    }),
    // Delete alert events
    prisma.alertEvent.deleteMany({
      where: { listingId: { in: listingIds } },
    }),
    // Delete deal events
    prisma.dealEvent.deleteMany({
      where: { variantId: { in: variantIds } },
    }),
    // Delete notification logs
    prisma.notificationLog.deleteMany({
      where: { listingId: { in: listingIds } },
    }),
    // Delete variant price analytics
    prisma.variantPriceAnalytics.deleteMany({
      where: { variantId: { in: variantIds } },
    }),
    // Reset listing fields (keep the listing record + URL intact)
    prisma.listing.updateMany({
      where: { id: { in: listingIds } },
      data: {
        currentPrice: null,
        previousPrice: null,
        lowestPrice: null,
        highestPrice: null,
        stockStatus: 'UNKNOWN',
        isDeal: false,
        dealScore: null,
        lastSeenAt: null,
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastBlockedAt: null,
        lastNotifiedPrice: null,
        notificationSentAt: null,
        confidenceScore: null,
        parserHealth: null,
      },
    }),
  ]);

  console.log('\n✅ Samsung verileri temizlendi!');
  console.log('   - Tüm Samsung fiyat geçmişi silindi');
  console.log('   - Tüm Samsung listing\'ler sıfırlandı (URL\'ler korundu)');
  console.log('   - Tüm Samsung bildirimleri / alert olayları silindi');
  console.log('   - iPhone/Apple verileri DOKUNULMADI');
  console.log('\n🔄 Worker yeniden başlatıldığında Samsung ürünleri sıfırdan scrape edilecek.');
}

main()
  .catch((e) => {
    console.error('❌ Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
