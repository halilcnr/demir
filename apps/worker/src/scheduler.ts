import { runSync } from './sync';

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? '21600000', 10); // Default: 6 saat

/**
 * Worker scheduler: Belirli aralıklarla fiyat sync işlemi çalıştırır.
 * Railway üzerinde sürekli çalışan bir Node.js process olarak dağıtılır.
 */
export async function startScheduler(): Promise<void> {
  console.log(`[scheduler] Başlatıldı. Sync aralığı: ${SYNC_INTERVAL_MS / 1000 / 60} dakika`);

  // İlk sync'i hemen çalıştır
  await runSyncSafe();

  // Periyodik sync
  setInterval(runSyncSafe, SYNC_INTERVAL_MS);
}

async function runSyncSafe(): Promise<void> {
  const startTime = Date.now();
  console.log(`[scheduler] Sync başlatılıyor... ${new Date().toISOString()}`);

  try {
    const result = await runSync();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[scheduler] Sync tamamlandı (${elapsed}s): ` +
      `${result.itemsScanned} taranan, ${result.itemsMatched} eşleşen, ${result.dealsFound} fırsat`
    );
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[scheduler] Sync başarısız (${elapsed}s):`, error);
  }
}
