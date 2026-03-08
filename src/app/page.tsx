'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Smartphone,
  Store,
  Clock,
  TrendingDown,
} from 'lucide-react';

import { StatCard, Card } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import type { DashboardSummary } from '@/types';
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
          title="Toplam Ürün"
          value={data.totalProducts}
          icon={<Smartphone className="h-5 w-5" />}
        />
        <StatCard
          title="Toplam Listing"
          value={data.totalListings}
          icon={<Store className="h-5 w-5" />}
        />
        <StatCard
          title="Son Senkronizasyon"
          value={data.lastSyncAt ? formatRelativeDate(data.lastSyncAt) : 'Henüz yok'}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Aktif Alarm"
          value={data.recentAlerts.length}
          subtitle="okunmamış bildirim"
          icon={<TrendingDown className="h-5 w-5" />}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* En Ucuz Fiyatlar */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            En Uygun Fiyatlar
          </h2>
          {data.topDeals.length === 0 ? (
            <EmptyState description="Henüz fiyat verisi yok" />
          ) : (
            <div className="space-y-3">
              {data.topDeals.map((deal, i) => (
                <Link
                  key={i}
                  href={`/products/${deal.productId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {deal.productModel} {deal.storage}
                    </p>
                    <p className="text-xs text-gray-500">{deal.retailerName}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-600">
                    {deal.currentPrice !== null && deal.currentPrice !== undefined
                      ? formatPrice(deal.currentPrice)
                      : '—'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* En Büyük Fiyat Düşüşleri */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Bugünün En Büyük Düşüşleri
          </h2>
          {data.biggestDrops.length === 0 ? (
            <EmptyState description="Son 24 saatte önemli bir düşüş yok" />
          ) : (
            <div className="space-y-3">
              {data.biggestDrops.map((drop, i) => (
                <Link
                  key={i}
                  href={`/products/${drop.productId}`}
                  className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50/30 p-3 hover:bg-green-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {drop.productModel} {drop.storage}
                    </p>
                    <p className="text-xs text-gray-500">{drop.retailerName}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-green-700">
                      {drop.currentPrice !== null && drop.currentPrice !== undefined
                        ? formatPrice(drop.currentPrice)
                        : '—'}
                    </span>
                    {drop.changePercent != null && (
                      <div className="mt-0.5">
                        <PriceChangeBadge changePercent={drop.changePercent} />
                      </div>
                    )}
                  </div>
                </Link>
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
                    <p className="text-sm text-gray-900">{alert.message}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatRelativeDate(alert.createdAt)}
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
            Son Güncellenen Ürünler
          </h2>
          {data.recentlyUpdated.length === 0 ? (
            <EmptyState description="Henüz güncelleme yok" />
          ) : (
            <div className="space-y-3">
              {data.recentlyUpdated.map((item, i) => (
                <Link
                  key={i}
                  href={`/products/${item.productId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {item.productModel} {item.storage}
                    </p>
                    <p className="text-xs text-gray-500">{item.retailerName}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {item.currentPrice !== null && item.currentPrice !== undefined
                        ? formatPrice(item.currentPrice)
                        : '—'}
                    </span>
                    {item.lastSyncedAt && (
                      <p className="text-xs text-gray-400">
                        {formatRelativeDate(item.lastSyncedAt)}
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
