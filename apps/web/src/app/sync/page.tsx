'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Server, CheckCircle2, XCircle, Clock, Activity, Play, Loader2, AlertTriangle, Shield } from 'lucide-react';

import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatRelativeDate } from '@repo/shared';
import type { SyncStatusResponse } from '@repo/shared';

export default function SyncPage() {
  const [syncState, setSyncState] = useState<'idle' | 'triggering' | 'running' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => fetch('/api/sync/status').then((r) => r.json()),
    refetchInterval: syncState === 'running' ? 5_000 : 30_000,
  });

  const triggerSync = useCallback(async () => {
    setSyncState('triggering');
    setSyncMessage(null);
    try {
      const res = await fetch('/api/sync/run', { method: 'POST' });
      const body = await res.json();

      if (res.status === 409) {
        setSyncState('running');
        setSyncMessage('Sync zaten çalışıyor');
        return;
      }

      if (!res.ok) {
        setSyncState('error');
        setSyncMessage(body.error ?? 'Bilinmeyen hata');
        return;
      }

      setSyncState('running');
      setSyncMessage('Sync başlatıldı — sonuçlar birkaç dakika içinde güncellenir');
      // Poll more frequently while running
      setTimeout(() => {
        refetch();
      }, 3000);
    } catch {
      setSyncState('error');
      setSyncMessage('Worker ile bağlantı kurulamadı');
    }
  }, [refetch]);

  // Auto-detect if job is still running and update sync state
  const isJobRunning = data?.lastJob?.status === 'RUNNING';
  if (isJobRunning && syncState === 'idle') {
    // Job is running (detected from DB), show running state
  }

  if (isLoading) return <CardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState />;

  const job = data.lastJob;

  return (
    <div className="space-y-6 animate-float-in">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Senkronizasyon</h1>
        <div className="flex items-center gap-3">
          {syncMessage && (
            <span className={`text-[11px] ${syncState === 'error' ? 'text-rose-500' : 'text-text-tertiary'}`}>
              {syncMessage}
            </span>
          )}
          <button
            onClick={triggerSync}
            disabled={syncState === 'triggering' || syncState === 'running' || isJobRunning}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            {syncState === 'triggering' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : syncState === 'running' || isJobRunning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {syncState === 'triggering'
              ? 'Başlatılıyor...'
              : syncState === 'running' || isJobRunning
                ? 'Sync Çalışıyor'
                : 'Manuel Sync'}
          </button>
        </div>
      </div>

      {/* Running indicator */}
      {(syncState === 'running' || isJobRunning) && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          <p className="text-[13px] text-primary font-medium">
            Fiyat güncelleme işlemi devam ediyor — veriler otomatik olarak yenilenecek
          </p>
        </div>
      )}

      {/* Last Job Stats */}
      {job ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              title="Durum"
              value={
                isJobRunning
                  ? 'Çalışıyor'
                  : job.status === 'COMPLETED'
                    ? 'Tamamlandı'
                    : job.status === 'FAILED'
                      ? 'Başarısız'
                      : job.status
              }
              accentColor={
                isJobRunning
                  ? '#6366f1'
                  : job.status === 'COMPLETED'
                    ? '#10b981'
                    : '#f43f5e'
              }
              icon={
                isJobRunning ? (
                  <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                ) : job.status === 'COMPLETED' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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

          {/* Detailed stats row */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center gap-2.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Başarılı</p>
                  <p className="text-lg font-semibold text-text-primary">{job.successCount}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2.5 text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Hatalı</p>
                  <p className="text-lg font-semibold text-text-primary">{job.failureCount}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2.5 text-rose-500">
                <Shield className="h-4 w-4" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Engel</p>
                  <p className="text-lg font-semibold text-text-primary">{job.blockedCount}</p>
                </div>
              </div>
            </Card>
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
                    {job.finishedAt ? formatRelativeDate(job.finishedAt) : isJobRunning ? 'Devam ediyor...' : '—'}
                  </p>
                </div>
                {job.durationMs != null && job.durationMs > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">Süre</p>
                    <p className="text-[13px] text-text-primary font-mono">
                      {(job.durationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                )}
                {job.lastErrorMessage && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500 mb-1">Son Hata</p>
                    <p className="rounded-lg bg-rose-50 border border-rose-100 p-3 text-[13px] text-rose-700">
                      {job.lastErrorMessage}
                    </p>
                  </div>
                )}
                {job.errors && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500 mb-1">Hata Günlüğü</p>
                    <p className="mt-1 rounded-lg bg-rose-50 border border-rose-100 p-3 text-[13px] text-rose-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
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
          description="Worker servisi başladığında ilk senkronizasyon otomatik başlayacak veya yukarıdaki butona tıklayarak manuel başlatabilirsiniz."
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
