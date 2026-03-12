'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Smartphone,
  Store,
  Clock,
  Zap,
  ExternalLink,
  ArrowRight,
  Flame,
  Sparkles,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
} from 'lucide-react';

import { StatCard, Card } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ProviderHealthCard } from '@/components/provider-health-card';
import { SystemHealthCard } from '@/components/system-health-card';
import { useLiveUpdates } from '@/components/live-updates-context';
import { formatPrice, formatRelativeDate } from '@repo/shared';
import type { DashboardSummary, LiveSyncProgress, DealEventItem } from '@repo/shared';
import Link from 'next/link';

export default function DashboardPage() {
  const { enabled: liveEnabled } = useLiveUpdates();
  const { data, isLoading, error, refetch } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => fetch('/api/dashboard/summary').then((r) => r.json()),
  });

  const { data: syncProgress } = useQuery<LiveSyncProgress>({
    queryKey: ['sync-progress'],
    queryFn: () => fetch('/api/sync/progress').then((r) => r.json()),
    refetchInterval: liveEnabled
      ? (query) => (query.state.data?.running ? 5000 : 10000)
      : false,
  });

  const { data: dealEventsData } = useQuery<{ events: DealEventItem[] }>({
    queryKey: ['recent-deal-events'],
    queryFn: () => fetch('/api/deal-events?limit=8').then((r) => r.json()),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState />;

  return (
    <div className="space-y-8 animate-float-in">
      {/* Hero Stats */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-text-primary mb-4">Genel Bakış</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Ürün Aileleri"
            value={data.totalFamilies}
            icon={<Smartphone className="h-4 w-4" />}
            accentColor="#6366f1"
          />
          <StatCard
            title="Toplam Varyant"
            value={data.totalVariants}
            subtitle={`${data.totalListings} listing takipte`}
            icon={<Store className="h-4 w-4" />}
            accentColor="#06b6d4"
          />
          <StatCard
            title="Aktif Fırsatlar"
            value={data.activeDeals}
            subtitle={data.last24hDeals > 0 ? `Son 24s: +${data.last24hDeals} yeni` : undefined}
            icon={<Zap className="h-4 w-4" />}
            accentColor="#f59e0b"
          />
          <StatCard
            title="Son Senkronizasyon"
            value={data.lastSyncAt ? formatRelativeDate(data.lastSyncAt) : 'Henüz yok'}
            subtitle={data.lastSyncStatus ?? undefined}
            icon={<Clock className="h-4 w-4" />}
            accentColor="#10b981"
          />
        </div>
      </div>

      {/* Provider Health */}
      <ProviderHealthCard />

      {/* System Health */}
      <SystemHealthCard />

      {/* Live Sync Activity */}
      {syncProgress && (
        <Card className="relative overflow-hidden">
          <div className={`absolute inset-x-0 top-0 h-[2px] ${syncProgress.running ? 'bg-gradient-to-r from-blue-400 via-cyan-400 to-transparent animate-pulse' : 'bg-gradient-to-r from-slate-300 to-transparent'}`} />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${syncProgress.running ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <Activity className={`h-4 w-4 ${syncProgress.running ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Senkronizasyon Durumu
                </h2>
                <p className="text-[11px] text-text-tertiary">
                  {syncProgress.running ? 'Aktif olarak çalışıyor...' : 'Boşta'}
                </p>
              </div>
            </div>
            {syncProgress.running && (
              <Badge variant="info" size="sm" className="animate-pulse">
                {syncProgress.step}
              </Badge>
            )}
          </div>

          {syncProgress.running ? (
            <div className="space-y-3">
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-text-tertiary">İlerleme</span>
                  <span className="text-xs font-semibold text-text-primary tabular-nums">
                    %{Math.round(syncProgress.progress)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, syncProgress.progress)}%` }}
                  />
                </div>
              </div>

              {/* Current Item */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {syncProgress.currentRetailer && (
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">Mağaza</p>
                    <p className="text-xs font-semibold text-text-primary truncate">{syncProgress.currentRetailer}</p>
                  </div>
                )}
                {syncProgress.currentVariant && (
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">Varyant</p>
                    <p className="text-xs font-semibold text-text-primary truncate">{syncProgress.currentVariant}</p>
                  </div>
                )}
                <div className="rounded-lg bg-surface-secondary p-2.5">
                  <p className="text-[11px] text-text-tertiary">İşlenen</p>
                  <p className="text-xs font-semibold text-text-primary tabular-nums">
                    {syncProgress.processedListings} / {syncProgress.totalListings}
                  </p>
                </div>
                {syncProgress.estimatedRemainingMs != null && syncProgress.estimatedRemainingMs > 0 && (
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">Kalan Süre</p>
                    <p className="text-xs font-semibold text-text-primary tabular-nums">
                      ~{Math.ceil(syncProgress.estimatedRemainingMs / 60000)} dk
                    </p>
                  </div>
                )}
              </div>

              {/* Counters */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {syncProgress.successCount} başarılı
                </span>
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="h-3.5 w-3.5" /> {syncProgress.failureCount} hatalı
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <Shield className="h-3.5 w-3.5" /> {syncProgress.blockedCount} engellendi
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-surface-secondary p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-text-secondary">
                {syncProgress.startedAt
                  ? `Son senkronizasyon: ${formatRelativeDate(syncProgress.startedAt)} — ${syncProgress.successCount} başarılı, ${syncProgress.failureCount} hatalı`
                  : 'Henüz senkronizasyon çalıştırılmadı'}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Deal Intelligence Events */}
      {dealEventsData && dealEventsData.events.length > 0 && (
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-purple-400 via-pink-400 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
                <Zap className="h-4 w-4 text-purple-500" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">
                Son Fırsat Olayları
              </h2>
            </div>
          </div>
          <div className="space-y-2">
            {dealEventsData.events.map((event) => (
              <div
                key={event.id}
                className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                  event.isSuspiciousDiscount
                    ? 'border-amber-200 bg-amber-50/30'
                    : event.isNewAllTimeLow
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-border bg-surface hover:bg-surface-secondary'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-medium text-text-primary truncate">
                      {event.variantName ?? 'Bilinmeyen'}
                    </span>
                    {event.isSuspiciousDiscount && (
                      <Badge variant="warning" size="sm">
                        <AlertTriangle className="h-3 w-3 mr-0.5" /> Şüpheli
                      </Badge>
                    )}
                    {event.isNewAllTimeLow && (
                      <Badge variant="success" size="sm">Tüm Zamanların En Düşüğü</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                    <span>{event.retailerName}</span>
                    <span>·</span>
                    <span className="capitalize">{event.eventType.replace(/_/g, ' ').toLowerCase()}</span>
                    <span>·</span>
                    <span>{formatRelativeDate(event.detectedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {event.newPrice != null && (
                    <span className="text-sm font-bold text-primary tabular-nums">
                      {formatPrice(event.newPrice)}
                    </span>
                  )}
                  {event.dropPercent != null && event.dropPercent > 0 && (
                    <PriceChangeBadge changePercent={-event.dropPercent} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* En İyi Fırsatlar */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-orange-400 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <Flame className="h-4 w-4 text-amber-500" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">
                En İyi Fırsatlar
              </h2>
            </div>
            <Link href="/deals" className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-primary transition-colors">
              Tümü <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.topDeals.length === 0 ? (
            <EmptyState description="Henüz fırsat tespit edilmedi" />
          ) : (
            <div className="space-y-2">
              {data.topDeals.map((deal, i) => (
                <div
                  key={i}
                  className="group flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:border-amber-200 hover:bg-amber-50/30 transition-all duration-150"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/variants/${deal.variantId}`}
                      className="text-[13px] font-medium text-text-primary hover:text-primary truncate block"
                    >
                      {deal.variantName}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-text-tertiary">{deal.retailerName}</span>
                      {deal.dealScore && (
                        <Badge variant="warning" size="sm">Puan: {deal.dealScore}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 ml-3">
                    <span className="text-sm font-bold text-primary tabular-nums">
                      {deal.currentPrice != null ? formatPrice(deal.currentPrice) : '—'}
                    </span>
                    <a
                      href={deal.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Siteye git"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Son Bildirimler */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-400 via-violet-400 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                <Sparkles className="h-4 w-4 text-indigo-500" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">
                Son Bildirimler
              </h2>
            </div>
            <Link href="/alerts" className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-primary transition-colors">
              Tümü <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentAlerts.length === 0 ? (
            <EmptyState description="Henüz bildirim yok" />
          ) : (
            <div className="space-y-2">
              {data.recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-surface-secondary"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-text-primary">{alert.triggerReason}</p>
                    {alert.variantName && (
                      <p className="text-[11px] text-text-tertiary mt-0.5">{alert.variantName}</p>
                    )}
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      {formatRelativeDate(alert.triggeredAt)}
                    </p>
                  </div>
                  {!alert.isRead && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse-dot" />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>


      </div>
    </div>
  );
}
