import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';
import type { SystemHealthInfo, HealthStatus } from '@repo/shared';

const WORKER_HEALTHY_MS = 20 * 60 * 1000; // 20 min
const WORKER_WARNING_MS = 60 * 60 * 1000; // 1 hour
const SYNC_HEALTHY_MS = 30 * 60 * 1000;
const SYNC_WARNING_MS = 2 * 60 * 60 * 1000;

/** GET /api/health/system — aggregate system health */
export async function GET() {
  const [lastJob, retailerCount, variantCount, listingsWithPrice] = await Promise.all([
    prisma.syncJob.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.retailer.count(),
    prisma.productVariant.count(),
    prisma.listing.count({ where: { currentPrice: { not: null } } }),
  ]);

  // Frontend — always healthy if this endpoint responds
  const frontend: SystemHealthInfo['frontend'] = {
    status: 'healthy',
    detail: 'Frontend aktif ve çalışıyor',
  };

  // Database — if we got this far, DB is accessible
  const database: SystemHealthInfo['database'] = {
    status: retailerCount > 0 && variantCount > 0 ? 'healthy' : 'warning',
    detail:
      retailerCount > 0 && variantCount > 0
        ? `${variantCount} varyant, ${listingsWithPrice} fiyatlı listing`
        : 'Veritabanı erişilebilir fakat veri eksik',
  };

  // Worker — based on most recent sync job
  let worker: SystemHealthInfo['worker'];
  if (!lastJob) {
    worker = { status: 'warning', detail: 'Henüz senkronizasyon yapılmamış' };
  } else {
    const elapsed = Date.now() - (lastJob.finishedAt ?? lastJob.createdAt).getTime();
    if (elapsed < WORKER_HEALTHY_MS) {
      worker = { status: 'healthy', detail: 'Worker aktif' };
    } else if (elapsed < WORKER_WARNING_MS) {
      worker = { status: 'warning', detail: 'Worker gecikmeli çalışıyor' };
    } else {
      worker = { status: 'degraded', detail: 'Worker uzun süredir yanıt vermiyor' };
    }
  }

  // Sync engine — based on success/failure ratio and timing
  let syncEngine: SystemHealthInfo['syncEngine'];
  if (!lastJob) {
    syncEngine = { status: 'warning', detail: 'Henüz senkronizasyon yok' };
  } else {
    const elapsed = Date.now() - (lastJob.finishedAt ?? lastJob.createdAt).getTime();
    const failRate = lastJob.itemsScanned > 0
      ? lastJob.failureCount / lastJob.itemsScanned
      : 0;

    let status: HealthStatus = 'healthy';
    let detail = `Son: ${lastJob.successCount} başarılı, ${lastJob.failureCount} hata`;

    if (lastJob.status === 'FAILED') {
      status = 'error';
      detail = lastJob.lastErrorMessage ?? 'Senkronizasyon başarısız oldu';
    } else if (failRate > 0.5) {
      status = 'degraded';
      detail = `Yüksek hata oranı: %${Math.round(failRate * 100)}`;
    } else if (elapsed > SYNC_WARNING_MS) {
      status = 'warning';
      detail = 'Senkronizasyon gecikmiş';
    } else if (failRate > 0.2) {
      status = 'warning';
    }

    syncEngine = { status, detail };
  }

  const result: SystemHealthInfo = { frontend, worker, database, syncEngine };
  return NextResponse.json(result);
}
