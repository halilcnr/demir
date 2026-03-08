'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Server, CheckCircle2, XCircle, Clock } from 'lucide-react';

import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatRelativeDate } from '@repo/shared';
import type { SyncStatusResponse } from '@repo/shared';

export default function SyncPage() {
  const { data, isLoading, error, refetch } = useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => fetch('/api/sync/status').then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (isLoading) return <CardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState />;

  const job = data.lastJob;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Senkronizasyon</h1>
        <p className="text-xs text-gray-400">Worker Railway üzerinde çalışır</p>
      </div>

      {/* Last Job Stats */}
      {job ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              title="Durum"
              value={
                job.status === 'COMPLETED'
                  ? 'Tamamlandı'
                  : job.status === 'RUNNING'
                    ? 'Çalışıyor'
                    : job.status === 'FAILED'
                      ? 'Başarısız'
                      : job.status
              }
              icon={
                job.status === 'COMPLETED' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : job.status === 'RUNNING' ? (
                  <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )
              }
            />
            <StatCard
              title="Taranan Ürün"
              value={job.itemsScanned}
              icon={<Server className="h-5 w-5" />}
            />
            <StatCard
              title="Eşleşen Ürün"
              value={job.itemsMatched}
            />
            <StatCard
              title="Tespit Edilen Fırsat"
              value={job.dealsFound}
            />
          </div>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-gray-900">
              Son İş Detayları
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500">Başlangıç</p>
                <p className="text-sm text-gray-900">
                  {job.startedAt ? formatRelativeDate(job.startedAt) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Bitiş</p>
                <p className="text-sm text-gray-900">
                  {job.finishedAt ? formatRelativeDate(job.finishedAt) : '—'}
                </p>
              </div>
              {job.errors && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-red-500">Hatalar</p>
                  <p className="mt-1 rounded-lg bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
                    {job.errors}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={<Clock className="h-10 w-10 text-gray-300" />}
          title="Henüz senkronizasyon yapılmadı"
          description="Worker servisi başladığında ilk senkronizasyon otomatik başlayacak."
        />
      )}

      {/* Retailers */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Mağaza Durumları
        </h2>
        {data.retailers.length === 0 ? (
          <EmptyState description="Mağaza bilgisi yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Mağaza
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Durum
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Son Senkronizasyon
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.retailers.map((r) => (
                  <tr key={r.slug} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={r.isActive ? 'success' : 'default'}>
                        {r.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {r.lastSyncedAt ? formatRelativeDate(r.lastSyncedAt) : 'Henüz yok'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
