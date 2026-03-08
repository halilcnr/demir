'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Server, CheckCircle2, XCircle, Clock, Activity } from 'lucide-react';

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
    <div className="space-y-6 animate-float-in">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Senkronizasyon</h1>
        <p className="text-[11px] text-text-tertiary">Worker Railway üzerinde çalışır</p>
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
              accentColor={
                job.status === 'COMPLETED'
                  ? '#10b981'
                  : job.status === 'RUNNING'
                    ? '#6366f1'
                    : '#f43f5e'
              }
              icon={
                job.status === 'COMPLETED' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : job.status === 'RUNNING' ? (
                  <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-500" />
                )
              }
            />
            <StatCard
              title="Taranan Ürün"
              value={job.itemsScanned}
              accentColor="#06b6d4"
              icon={<Server className="h-4 w-4" />}
            />
            <StatCard
              title="Eşleşen Ürün"
              value={job.itemsMatched}
              accentColor="#f59e0b"
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
              title="Tespit Edilen Fırsat"
              value={job.dealsFound}
              accentColor="#6366f1"
            />
          </div>

          <Card>
            <div className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary to-violet-500" />
              <h2 className="mb-4 text-sm font-semibold text-text-primary pt-2">
                Son İş Detayları
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">Başlangıç</p>
                  <p className="text-[13px] text-text-primary">
                    {job.startedAt ? formatRelativeDate(job.startedAt) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">Bitiş</p>
                  <p className="text-[13px] text-text-primary">
                    {job.finishedAt ? formatRelativeDate(job.finishedAt) : '—'}
                  </p>
                </div>
                {job.errors && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500 mb-1">Hatalar</p>
                    <p className="mt-1 rounded-lg bg-rose-50 border border-rose-100 p-3 text-[13px] text-rose-700 whitespace-pre-wrap">
                      {job.errors}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={<Clock className="h-10 w-10 text-text-tertiary" />}
          title="Henüz senkronizasyon yapılmadı"
          description="Worker servisi başladığında ilk senkronizasyon otomatik başlayacak."
        />
      )}

      {/* Retailers */}
      <Card>
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-sky-500" />
          <h2 className="mb-4 text-sm font-semibold text-text-primary pt-2">
            Mağaza Durumları
          </h2>
          {data.retailers.length === 0 ? (
            <EmptyState description="Mağaza bilgisi yok" />
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-full">
                <thead>
                  <tr className="border-y border-border-light bg-surface-secondary">
                    <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Mağaza
                    </th>
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Durum
                    </th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Son Senkronizasyon
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {data.retailers.map((r) => (
                    <tr key={r.slug} className="group hover:bg-surface-secondary transition-colors">
                      <td className="px-5 py-3 text-[13px] font-medium text-text-primary">
                        {r.name}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Badge variant={r.isActive ? 'success' : 'default'} size="sm" dot>
                          {r.isActive ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] text-text-tertiary">
                        {r.lastSyncedAt ? formatRelativeDate(r.lastSyncedAt) : 'Henüz yok'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
