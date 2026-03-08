'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Bell,
} from 'lucide-react';

import { Card, StatCard } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PriceHistoryChart } from '@/components/charts/price-history-chart';
import { RetailerComparisonChart } from '@/components/charts/retailer-comparison-chart';
import {
  formatPrice,
  formatRelativeDate,
  calculateChangePercent,
  getRetailerColor,
} from '@repo/shared';
import type { VariantDetail, PriceHistoryPoint } from '@repo/shared';

export default function VariantDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const {
    data: variant,
    isLoading,
    error,
    refetch,
  } = useQuery<VariantDetail>({
    queryKey: ['variant', id],
    queryFn: () => fetch(`/api/products/${id}`).then((r) => r.json()),
  });

  const { data: historyData } = useQuery<{
    historyByRetailer: Record<string, PriceHistoryPoint[]>;
    flatHistory: PriceHistoryPoint[];
  }>({
    queryKey: ['variant-history', id],
    queryFn: () => fetch(`/api/products/${id}/history`).then((r) => r.json()),
    enabled: !!variant,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <CardSkeleton />
      </div>
    );
  }

  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!variant) return <EmptyState description="Varyant bulunamadı" />;

  const bestListing = variant.listings.find(
    (l) => l.currentPrice === variant.minPrice,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/variants"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Varyantlara Dön
          </Link>
          <h1 className="text-xl font-bold text-gray-900">
            {variant.familyName} — {variant.storageGb >= 1024 ? `${variant.storageGb / 1024} TB` : `${variant.storageGb} GB`}{' '}
            {variant.color}
          </h1>
          {variant.normalizedName && (
            <p className="text-sm text-gray-500 mt-1">{variant.normalizedName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bestListing && (
            <a
              href={bestListing.productUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="primary" size="sm">
                <ExternalLink className="mr-1 h-4 w-4" />
                En ucuza git
              </Button>
            </a>
          )}
          <Link href={`/alerts?variantId=${id}`}>
            <Button variant="outline" size="sm">
              <Bell className="mr-1 h-4 w-4" />
              Alarm Kur
            </Button>
          </Link>
        </div>
      </div>

      {/* Price Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="En Düşük Fiyat"
          value={variant.minPrice != null ? formatPrice(variant.minPrice) : '—'}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <StatCard
          title="En Yüksek Fiyat"
          value={variant.maxPrice != null ? formatPrice(variant.maxPrice) : '—'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="Ortalama Fiyat"
          value={variant.avgPrice != null ? formatPrice(variant.avgPrice) : '—'}
        />
        <StatCard
          title="En İyi Mağaza"
          value={variant.bestRetailer ?? '—'}
        />
      </div>

      {/* Retailer Listings */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Mağaza Karşılaştırması
        </h2>
        {variant.listings.length === 0 ? (
          <EmptyState description="Bu varyant için henüz listing yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Mağaza
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Güncel Fiyat
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Önceki Fiyat
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Değişim
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Stok
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Fırsat
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
                {variant.listings.map((listing) => {
                  const change =
                    listing.currentPrice != null && listing.previousPrice != null
                      ? calculateChangePercent(listing.previousPrice, listing.currentPrice)
                      : null;

                  return (
                    <tr key={listing.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: getRetailerColor(listing.retailerSlug) }}
                          />
                          <span className="text-sm font-medium text-gray-900">
                            {listing.retailerName}
                          </span>
                        </div>
                        {listing.sellerName && (
                          <p className="text-xs text-gray-400 ml-[18px]">
                            Satıcı: {listing.sellerName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {listing.currentPrice != null ? formatPrice(listing.currentPrice) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500">
                        {listing.previousPrice != null
                          ? formatPrice(listing.previousPrice)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {change != null ? <PriceChangeBadge changePercent={change} /> : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            listing.stockStatus === 'IN_STOCK'
                              ? 'success'
                              : listing.stockStatus === 'LIMITED'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {listing.stockStatus === 'IN_STOCK'
                            ? 'Stokta'
                            : listing.stockStatus === 'LIMITED'
                              ? 'Sınırlı'
                              : listing.stockStatus === 'OUT_OF_STOCK'
                                ? 'Tükendi'
                                : 'Bilinmiyor'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {listing.isDeal ? (
                          <Badge variant="warning">
                            {listing.dealScore ? `Puan: ${listing.dealScore}` : 'Fırsat'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {listing.lastSeenAt
                          ? formatRelativeDate(listing.lastSeenAt)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={listing.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-blue-600 hover:text-blue-800"
                          title="Siteye git"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Charts */}
      {historyData && historyData.flatHistory.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Fiyat Geçmişi
            </h2>
            <PriceHistoryChart data={historyData.flatHistory} />
          </Card>
          <Card>
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Mağaza Karşılaştırması
            </h2>
            <RetailerComparisonChart
              data={variant.listings
                .filter((l) => l.currentPrice != null)
                .map((l) => ({
                  retailer: l.retailerName,
                  retailerSlug: l.retailerSlug,
                  price: l.currentPrice!,
                }))}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
