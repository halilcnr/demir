'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Server, CheckCircle2, XCircle, Clock, Activity, Play, Loader2, AlertTriangle, Shield, Terminal } from 'lucide-react';

import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatRelativeDate } from '@repo/shared';
import type { SyncStatusResponse } from '@repo/shared';
import { useLiveUpdates } from '@/components/live-updates-context';

interface SyncLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'progress';
  retailer?: string;
  variant?: string;
  message: string;
  price?: number;
}

const LOG_ICONS: Record<SyncLogEntry['type'], string> = {
  info: 'ℹ️',
  success: '✅',
  error: '❌',
  warn: '⚠️',
  progress: '🔍',
};

const LOG_COLORS: Record<SyncLogEntry['type'], string> = {
  info: 'text-blue-400',
  success: 'text-emerald-400',
  error: 'text-rose-400',
  warn: 'text-amber-400',
  progress: 'text-violet-400',
};

export default function SyncPage() {
  const [syncState, setSyncState] = useState<'idle' | 'triggering' | 'running' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logFetchedCount = useRef(0);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [syncingSlug, setSyncingSlug] = useState<string | null>(null);
  const { conditionalInterval } = useLiveUpdates();

  const { data, isLoading, error, refetch } = useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => fetch('/api/sync/status').then((r) => r.json()),
    refetchInterval: conditionalInterval(syncState === 'running', 5_000, 30_000),
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
      logFetchedCount.current = 0;
      setSyncLogs([]);
      // Poll more frequently while running
      setTimeout(() => {
        refetch();
      }, 3000);
    } catch {
      setSyncState('error');
      setSyncMessage('Worker ile bağlantı kurulamadı');
    }
  }, [refetch]);

  const toggleRetailer = useCallback(async (slug: string) => {
    setTogglingSlug(slug);
    try {
      const res = await fetch(`/api/retailers/${encodeURIComponent(slug)}`, { method: 'PATCH' });
      if (res.ok) refetch();
    } catch { /* ignore */ }
    setTogglingSlug(null);
  }, [refetch]);

  const syncRetailer = useCallback(async (slug: string) => {
    setSyncingSlug(slug);
    try {
      await fetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerSlug: slug }),
      });
    } catch { /* ignore */ }
    setSyncingSlug(null);
  }, []);

  // Auto-detect if job is still running and update sync state
  const isJobRunning = data?.lastJob?.status === 'RUNNING';
  if (isJobRunning && syncState === 'idle') {
    // Job is running (detected from DB), show running state
  }

  // Poll sync logs when sync is running
  const isRunning = syncState === 'running' || isJobRunning;
  useQuery({
    queryKey: ['sync-logs', logFetchedCount.current],
    queryFn: async () => {
      const res = await fetch(`/api/sync/logs?since=${logFetchedCount.current}`);
      const data = await res.json();
      if (data.logs?.length > 0) {
        setSyncLogs((prev) => [...prev, ...data.logs]);
        logFetchedCount.current = data.total;
      }
      if (!data.running && syncState === 'running') {
        setSyncState('idle');
        setSyncMessage('Sync tamamlandı');
        refetch();
      }
      return data;
    },
    refetchInterval: conditionalInterval(isRunning, 2_000, false),
    enabled: isRunning || syncLogs.length > 0,
  });

  // Auto-scroll log panel
  useEffect(() => {
    if (logEndRef.current && isRunning) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [syncLogs.length, isRunning]);

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

      {/* Live Sync Logs */}
      {syncLogs.length > 0 && (
        <Card>
          <div className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-cyan-500" />
            <div className="flex items-center justify-between pt-2 mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-text-primary">Canlı Sync Günlüğü</h2>
                {isRunning && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
              <span className="text-[11px] text-text-tertiary">{syncLogs.length} kayıt</span>
            </div>
            <div className="rounded-lg bg-gray-950 p-3 max-h-80 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5">
              {syncLogs.map((log, i) => {
                const time = new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-gray-600 shrink-0 select-none">{time}</span>
                    <span className="shrink-0">{LOG_ICONS[log.type]}</span>
                    {log.retailer && (
                      <span className="text-cyan-400 shrink-0 font-semibold">[{log.retailer}]</span>
                    )}
                    <span className={LOG_COLORS[log.type]}>{log.message}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </Card>
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
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Son Senkronizasyon
                    </th>
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Aç / Kapat
                    </th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      İşlem
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
                      <td className="px-5 py-3 text-center text-[13px] text-text-tertiary">
                        {r.lastSyncedAt ? formatRelativeDate(r.lastSyncedAt) : 'Henüz yok'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={() => toggleRetailer(r.slug)}
                          disabled={togglingSlug === r.slug}
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: r.isActive ? '#10b981' : '#d1d5db' }}
                          title={r.isActive ? `${r.name} kapat` : `${r.name} aç`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                              r.isActive ? 'translate-x-[18px]' : 'translate-x-[2px]'
                            }`}
                          />
                          {togglingSlug === r.slug && (
                            <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => syncRetailer(r.slug)}
                          disabled={syncingSlug === r.slug || !r.isActive}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition-all hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
                          title={!r.isActive ? 'Mağaza pasif' : `${r.name} senkronize et`}
                        >
                          {syncingSlug === r.slug ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Sync
                        </button>
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
