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
  BarChart3,
  ShoppingBag,
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
      <div className="space-y-6 animate-float-in">
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
    <div className="space-y-6 animate-float-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/variants"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Varyantlara Dön
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {variant.familyName} — {variant.storageGb >= 1024 ? `${variant.storageGb / 1024} TB` : `${variant.storageGb} GB`}{' '}
            {variant.color}
          </h1>
          {variant.normalizedName && (
            <p className="text-[13px] text-text-tertiary mt-1">{variant.normalizedName}</p>
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
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                En ucuza git
              </Button>
            </a>
          )}
          <Link href={`/alerts?variantId=${id}`}>
            <Button variant="outline" size="sm">
              <Bell className="mr-1 h-3.5 w-3.5" />
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
          icon={<TrendingDown className="h-4 w-4" />}
          accentColor="#10b981"
        />
        <StatCard
          title="En Yüksek Fiyat"
          value={variant.maxPrice != null ? formatPrice(variant.maxPrice) : '—'}
          icon={<TrendingUp className="h-4 w-4" />}
          accentColor="#f43f5e"
        />
        <StatCard
          title="Ortalama Fiyat"
          value={variant.avgPrice != null ? formatPrice(variant.avgPrice) : '—'}
          icon={<BarChart3 className="h-4 w-4" />}
          accentColor="#6366f1"
        />
        <StatCard
          title="En İyi Mağaza"
          value={variant.bestRetailer ?? '—'}
          icon={<ShoppingBag className="h-4 w-4" />}
          accentColor="#f59e0b"
        />
      </div>

      {/* Retailer Listings */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">
          Mağaza Karşılaştırması
        </h2>
        {variant.listings.length === 0 ? (
          <EmptyState description="Bu varyant için henüz listing yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Mağaza
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Güncel Fiyat
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Önceki Fiyat
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Değişim
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Stok
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Fırsat
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Son Görülme
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {variant.listings.map((listing) => {
                  const change =
                    listing.currentPrice != null && listing.previousPrice != null
                      ? calculateChangePercent(listing.previousPrice, listing.currentPrice)
                      : null;

                  return (
                    <tr key={listing.id} className="group hover:bg-surface-secondary transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: getRetailerColor(listing.retailerSlug) }}
                          />
                          <span className="text-[13px] font-medium text-text-primary">
                            {listing.retailerName}
                          </span>
                        </div>
                        {listing.sellerName && (
                          <p className="text-[11px] text-text-tertiary ml-[18px]">
                            Satıcı: {listing.sellerName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-text-primary tabular-nums">
                        {listing.currentPrice != null ? formatPrice(listing.currentPrice) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] text-text-tertiary tabular-nums">
                        {listing.previousPrice != null
                          ? formatPrice(listing.previousPrice)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {change != null ? <PriceChangeBadge changePercent={change} /> : <span className="text-[11px] text-text-tertiary">—</span>}
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
                          dot
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
                          <span className="text-[11px] text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-[11px] text-text-tertiary">
                        {listing.lastSeenAt
                          ? formatRelativeDate(listing.lastSeenAt)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={listing.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-text-tertiary hover:text-primary opacity-60 group-hover:opacity-100 transition-opacity"
                          title="Siteye git"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
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
            <h2 className="mb-4 text-sm font-semibold text-text-primary">
              Fiyat Geçmişi
            </h2>
            <PriceHistoryChart data={historyData.flatHistory} />
          </Card>
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-text-primary">
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
