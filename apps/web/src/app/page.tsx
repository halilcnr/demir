'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Smartphone,
  Store,
  Clock,
  TrendingDown,
  Zap,
  ExternalLink,
  ArrowRight,
  Flame,
  Sparkles,
} from 'lucide-react';

import { StatCard, Card } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ProviderHealthCard } from '@/components/provider-health-card';
import { SystemHealthCard } from '@/components/system-health-card';
import { formatPrice, formatRelativeDate } from '@repo/shared';
import type { DashboardSummary } from '@repo/shared';
import Link from 'next/link';

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => fetch('/api/dashboard/summary').then((r) => r.json()),
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

        {/* En Büyük Fiyat Düşüşleri */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-400 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingDown className="h-4 w-4 text-emerald-500" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">
                Bugünün En Büyük Düşüşleri
              </h2>
            </div>
          </div>
          {data.biggestDrops.length === 0 ? (
            <EmptyState description="Son 24 saatte önemli bir düşüş yok" />
          ) : (
            <div className="space-y-2">
              {data.biggestDrops.map((drop, i) => (
                <div
                  key={i}
                  className="group flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all duration-150"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/variants/${drop.variantId}`}
                      className="text-[13px] font-medium text-text-primary hover:text-primary truncate block"
                    >
                      {drop.variantName}
                    </Link>
                    <p className="text-[11px] text-text-tertiary mt-1">{drop.retailerName}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">
                      {drop.currentPrice != null ? formatPrice(drop.currentPrice) : '—'}
                    </span>
                    {drop.changePercent != null && (
                      <PriceChangeBadge changePercent={drop.changePercent} />
                    )}
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

        {/* Son Güncellenenler */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50">
                <Clock className="h-4 w-4 text-cyan-500" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">
                Son Güncellenenler
              </h2>
            </div>
            <Link href="/variants" className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-primary transition-colors">
              Tümü <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentlyUpdated.length === 0 ? (
            <EmptyState description="Henüz güncelleme yok" />
          ) : (
            <div className="space-y-2">
              {data.recentlyUpdated.map((item, i) => (
                <Link
                  key={i}
                  href={`/variants/${item.variantId}`}
                  className="group flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:bg-surface-secondary hover:border-border/80 transition-all duration-150"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text-primary group-hover:text-primary truncate">
                      {item.variantName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-text-tertiary">{item.retailerName}</span>
                      {item.isDeal && <Badge variant="success" size="sm" dot>Fırsat</Badge>}
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    <span className="text-sm font-semibold text-text-primary tabular-nums">
                      {item.currentPrice != null ? formatPrice(item.currentPrice) : '—'}
                    </span>
                    {item.lastSeenAt && (
                      <p className="text-[11px] text-text-tertiary">
                        {formatRelativeDate(item.lastSeenAt)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
