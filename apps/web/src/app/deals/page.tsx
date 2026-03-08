'use client';

import { useQuery } from '@tanstack/react-query';
import { Zap, TrendingDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice, formatRelativeDate } from '@repo/shared';
import type { DealItem } from '@repo/shared';

interface DealsResponse {
  deals: DealItem[];
  biggestDrops: DealItem[];
}

export default function DealsPage() {
  const { data, isLoading, error, refetch } = useQuery<DealsResponse>({
    queryKey: ['deals'],
    queryFn: () => fetch('/api/deals').then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState description="Fırsat verisi yüklenemedi" />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Fırsatlar</h1>

      {/* Active Deals */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-base font-semibold text-gray-900">
            Aktif Fırsatlar ({data.deals.length})
          </h2>
        </div>

        {data.deals.length === 0 ? (
          <EmptyState description="Şu an aktif fırsat yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Ürün
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Mağaza
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Fiyat
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Fırsat Puanı
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Son Görülme
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.deals.map((deal) => (
                  <tr key={deal.listingId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/variants/${deal.variantId}`}
                        className="font-medium text-gray-900 text-sm hover:text-blue-600"
                      >
                        {deal.variantName}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {deal.color} · {deal.storageGb} GB
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {deal.retailerName}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-blue-600">
                        {formatPrice(deal.currentPrice)}
                      </span>
                      {deal.previousPrice != null && (
                        <p className="text-xs text-gray-400 line-through">
                          {formatPrice(deal.previousPrice)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {deal.dealScore != null ? (
                        <Badge
                          variant={deal.dealScore >= 80 ? 'success' : deal.dealScore >= 50 ? 'warning' : 'default'}
                        >
                          {deal.dealScore}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                      {deal.lastSeenAt ? formatRelativeDate(deal.lastSeenAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={deal.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Biggest Drops */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-5 w-5 text-green-600" />
          <h2 className="text-base font-semibold text-gray-900">
            En Büyük Fiyat Düşüşleri
          </h2>
        </div>

        {data.biggestDrops.length === 0 ? (
          <EmptyState description="Son dönemde önemli fiyat düşüşü yok" />
        ) : (
          <div className="space-y-3">
            {data.biggestDrops.map((drop) => (
              <div
                key={drop.listingId}
                className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50/30 p-4 hover:bg-green-50 transition-colors"
              >
                <div className="flex-1">
                  <Link
                    href={`/variants/${drop.variantId}`}
                    className="font-medium text-gray-900 hover:text-blue-600"
                  >
                    {drop.variantName}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-500">{drop.retailerName}</span>
                    {drop.previousPrice != null && (
                      <span className="text-sm text-gray-400 line-through">
                        {formatPrice(drop.previousPrice)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-lg font-bold text-green-700">
                      {formatPrice(drop.currentPrice)}
                    </span>
                    {drop.changePercent != null && (
                      <div className="mt-0.5">
                        <PriceChangeBadge changePercent={drop.changePercent} />
                      </div>
                    )}
                  </div>
                  <a
                    href={drop.productUrl}
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
    </div>
  );
}
