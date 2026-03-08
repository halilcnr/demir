'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Smartphone,
  Store,
  Clock,
  TrendingDown,
  Zap,
  ExternalLink,
} from 'lucide-react';

import { StatCard, Card } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ProviderHealthCard } from '@/components/provider-health-card';
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
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Ürün Aileleri"
          value={data.totalFamilies}
          icon={<Smartphone className="h-5 w-5" />}
        />
        <StatCard
          title="Toplam Varyant"
          value={data.totalVariants}
          subtitle={`${data.totalListings} listing`}
          icon={<Store className="h-5 w-5" />}
        />
        <StatCard
          title="Aktif Fırsatlar"
          value={data.activeDeals}
          subtitle={data.last24hDeals > 0 ? `Son 24 saatte ${data.last24hDeals} yeni` : undefined}
          icon={<Zap className="h-5 w-5" />}
        />
        <StatCard
          title="Son Senkronizasyon"
          value={data.lastSyncAt ? formatRelativeDate(data.lastSyncAt) : 'Henüz yok'}
          subtitle={data.lastSyncStatus ?? undefined}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Provider Health */}
      <ProviderHealthCard />

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* En İyi Fırsatlar */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900">
              En İyi Fırsatlar
            </h2>
          </div>
          {data.topDeals.length === 0 ? (
            <EmptyState description="Henüz fırsat tespit edilmedi" />
          ) : (
            <div className="space-y-3">
              {data.topDeals.map((deal, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/30 p-3 hover:bg-amber-50 transition-colors"
                >
                  <div className="flex-1">
                    <Link
                      href={`/variants/${deal.variantId}`}
                      className="font-medium text-gray-900 text-sm hover:text-blue-600"
                    >
                      {deal.variantName}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{deal.retailerName}</span>
                      {deal.dealScore && (
                        <Badge variant="warning">Puan: {deal.dealScore}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-600">
                      {deal.currentPrice != null ? formatPrice(deal.currentPrice) : '—'}
                    </span>
                    <a
                      href={deal.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600"
                      title="Siteye git"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* En Büyük Fiyat Düşüşleri */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">
              Bugünün En Büyük Düşüşleri
            </h2>
          </div>
          {data.biggestDrops.length === 0 ? (
            <EmptyState description="Son 24 saatte önemli bir düşüş yok" />
          ) : (
            <div className="space-y-3">
              {data.biggestDrops.map((drop, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50/30 p-3 hover:bg-green-50 transition-colors"
                >
                  <div className="flex-1">
                    <Link
                      href={`/variants/${drop.variantId}`}
                      className="font-medium text-gray-900 text-sm hover:text-blue-600"
                    >
                      {drop.variantName}
                    </Link>
                    <p className="text-xs text-gray-500">{drop.retailerName}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-green-700">
                      {drop.currentPrice != null ? formatPrice(drop.currentPrice) : '—'}
                    </span>
                    {drop.changePercent != null && (
                      <div className="mt-0.5">
                        <PriceChangeBadge changePercent={drop.changePercent} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Son Bildirimler */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Son Bildirimler
          </h2>
          {data.recentAlerts.length === 0 ? (
            <EmptyState description="Henüz bildirim yok" />
          ) : (
            <div className="space-y-3">
              {data.recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{alert.triggerReason}</p>
                    {alert.variantName && (
                      <p className="text-xs text-gray-500 mt-0.5">{alert.variantName}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      {formatRelativeDate(alert.triggeredAt)}
                    </p>
                  </div>
                  {!alert.isRead && (
                    <Badge variant="info">Yeni</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Son Güncellenenler */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Son Güncellenen Varyantlar
          </h2>
          {data.recentlyUpdated.length === 0 ? (
            <EmptyState description="Henüz güncelleme yok" />
          ) : (
            <div className="space-y-3">
              {data.recentlyUpdated.map((item, i) => (
                <Link
                  key={i}
                  href={`/variants/${item.variantId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {item.variantName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{item.retailerName}</span>
                      {item.isDeal && <Badge variant="success">Fırsat</Badge>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {item.currentPrice != null ? formatPrice(item.currentPrice) : '—'}
                    </span>
                    {item.lastSeenAt && (
                      <p className="text-xs text-gray-400">
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
