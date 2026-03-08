'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import type { SyncStatusResponse } from '@/types';

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; label: string }> = {
  COMPLETED: { icon: <CheckCircle className="h-4 w-4" />, variant: 'success', label: 'Tamamlandı' },
  FAILED: { icon: <XCircle className="h-4 w-4" />, variant: 'danger', label: 'Başarısız' },
  RUNNING: { icon: <Loader2 className="h-4 w-4 animate-spin" />, variant: 'warning', label: 'Çalışıyor' },
  PENDING: { icon: <Clock className="h-4 w-4" />, variant: 'default', label: 'Bekliyor' },
};

export default function SyncPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => fetch('/api/sync/status').then((r) => r.json()),
    refetchInterval: 10000,
  });

  const runSync = useMutation({
    mutationFn: (retailer?: string) =>
      fetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retailer ? { retailer } : {}),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;

  const lastJob = data?.lastJob;
  const statusConfig = lastJob ? STATUS_CONFIG[lastJob.status] ?? STATUS_CONFIG.PENDING : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">
            Senkronizasyon Yönetimi
          </h2>
        </div>
        <Button
          loading={runSync.isPending}
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => runSync.mutate()}
        >
          Tümünü Senkronize Et
        </Button>
      </div>

      {/* Last Job Stats */}
      {lastJob && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Son Durum"
            value={statusConfig?.label ?? 'Bilinmiyor'}
            icon={statusConfig?.icon}
          />
          <StatCard
            title="Bulunan Ürün"
            value={lastJob.itemsFound}
          />
          <StatCard
            title="Güncellenen"
            value={lastJob.itemsUpdated}
          />
          <StatCard
            title="Son Çalışma"
            value={lastJob.completedAt ? formatRelativeDate(lastJob.completedAt) : 'Devam ediyor'}
          />
        </div>
      )}

      {/* Error message */}
      {lastJob?.errorMessage && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">
            <strong>Hata:</strong> {lastJob.errorMessage}
          </p>
        </Card>
      )}

      {/* Retailer Status */}
      <Card>
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          Mağaza Durumları
        </h3>
        <div className="space-y-3">
          {data?.retailers.map((retailer) => (
            <div
              key={retailer.slug}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{retailer.name}</p>
                <p className="text-xs text-gray-500">
                  Son sync: {retailer.lastSyncedAt
                    ? formatDate(retailer.lastSyncedAt)
                    : 'Henüz yapılmadı'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={retailer.isActive ? 'success' : 'default'}>
                  {retailer.isActive ? 'Aktif' : 'Pasif'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  loading={runSync.isPending}
                  onClick={() => runSync.mutate(retailer.slug)}
                >
                  Senkronize Et
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Cron Info */}
      <Card>
        <h3 className="mb-2 text-base font-semibold text-gray-900">
          Otomatik Senkronizasyon
        </h3>
        <p className="text-sm text-gray-600">
          Vercel Cron Jobs kullanılarak fiyatlar otomatik olarak güncellenir.
          Varsayılan ayar: <strong>her 6 saatte bir</strong>.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Cron endpoint: <code className="rounded bg-gray-100 px-1.5 py-0.5">/api/cron/sync</code>
        </p>
      </Card>
    </div>
  );
}
