'use client';

import { useState, useCallback, useRef } from 'react';
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
  History,
  AlertTriangle,
  Award,
  Zap,
  RefreshCw,
  Check,
  Clock,
  ShieldAlert,
  Crown,
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

interface ListingWithFreshness {
  id: string;
  retailerName: string;
  retailerSlug: string;
  retailerProductTitle?: string | null;
  currentPrice: number | null;
  previousPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  sellerName?: string | null;
  stockStatus: string;
  isDeal: boolean;
  dealScore: number | null;
  productUrl: string;
  lastSeenAt: string | null;
  lastCheckedAt?: string | null;
  lastBlockedAt?: string | null;
  freshness?: 'fresh' | 'recent' | 'stale' | 'blocked';
  isCheapest?: boolean;
  priceRank?: number;
}

const freshnessConfig = {
  fresh:   { label: 'Az önce güncellendi', color: 'text-emerald-600', icon: Clock, bgColor: 'bg-emerald-50' },
  recent:  { label: 'Güncel', color: 'text-blue-600', icon: Clock, bgColor: 'bg-blue-50' },
  stale:   { label: 'Gecikmiş', color: 'text-amber-600', icon: AlertTriangle, bgColor: 'bg-amber-50' },
  blocked: { label: 'Geçici engel', color: 'text-red-600', icon: ShieldAlert, bgColor: 'bg-red-50' },
} as const;

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

  // ── Variant sync state ──
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleVariantSync = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const res = await fetch(`/api/sync/variant/${id}`, { method: 'POST' });
      const data = await res.json();

      if (res.status === 409) {
        setSyncError('Başka bir sync zaten çalışıyor');
        setSyncStatus('error');
        return;
      }
      if (!res.ok) {
        setSyncError(data.error ?? 'Sync başlatılamadı');
        setSyncStatus('error');
        return;
      }

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const progressRes = await fetch('/api/sync/progress');
          const progress = await progressRes.json();
          if (!progress.running) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncStatus('success');
            refetch();
            // Reset back to idle after 3s
            setTimeout(() => setSyncStatus('idle'), 3000);
          }
        } catch {
          // Keep polling
        }
      }, 2000);

      // Safety timeout — stop polling after 2 minutes
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncStatus('success');
          refetch();
          setTimeout(() => setSyncStatus('idle'), 3000);
        }
      }, 120_000);
    } catch {
      setSyncError('Worker ile bağlantı kurulamadı');
      setSyncStatus('error');
    }
  }, [id, refetch]);

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

  // Listings are already sorted by price ascending from the API
  const listings = (variant.listings ?? []) as ListingWithFreshness[];
  const bestListing = listings.find(
    (l) => l.isCheapest || l.currentPrice === variant.minPrice,
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
          <Button
            variant={syncStatus === 'success' ? 'outline' : syncStatus === 'error' ? 'danger' : 'secondary'}
            size="sm"
            onClick={handleVariantSync}
            disabled={syncStatus === 'syncing'}
          >
            {syncStatus === 'syncing' ? (
              <>
                <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                Güncelleniyor…
              </>
            ) : syncStatus === 'success' ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" />
                Güncellendi
              </>
            ) : syncStatus === 'error' ? (
              <>
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                {syncError ?? 'Hata'}
              </>
            ) : (
              <>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Bu Varyantı Güncelle
              </>
            )}
          </Button>
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

      {/* Historical Intelligence */}
      {variant.snapshotCount > 0 && (
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-400 via-purple-400 to-transparent" />
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
              <History className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Tarihsel Fiyat Zekâsı</h2>
              <p className="text-[11px] text-text-tertiary">{variant.snapshotCount} fiyat kaydı analizi</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-surface-secondary p-3">
              <p className="text-[11px] text-text-tertiary">Tüm Zamanların En Düşüğü</p>
              <p className="text-sm font-bold text-emerald-600 tabular-nums">
                {variant.historicalLowest != null ? formatPrice(variant.historicalLowest) : '—'}
              </p>
              {variant.minPrice != null && variant.historicalLowest != null && variant.minPrice <= variant.historicalLowest && (
                <Badge variant="success" size="sm" className="mt-1">
                  <Award className="h-3 w-3 mr-0.5" /> Şu an en düşükte!
                </Badge>
              )}
            </div>
            <div className="rounded-lg bg-surface-secondary p-3">
              <p className="text-[11px] text-text-tertiary">Tüm Zamanların En Yükseği</p>
              <p className="text-sm font-bold text-red-500 tabular-nums">
                {variant.historicalHighest != null ? formatPrice(variant.historicalHighest) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-surface-secondary p-3">
              <p className="text-[11px] text-text-tertiary">Tarihsel Ortalama</p>
              <p className="text-sm font-bold text-text-primary tabular-nums">
                {variant.historicalAverage != null ? formatPrice(variant.historicalAverage) : '—'}
              </p>
              {variant.minPrice != null && variant.historicalAverage != null && variant.minPrice < variant.historicalAverage && (
                <p className="text-[11px] text-emerald-600 mt-1">
                  Ortalamadan {formatPrice(variant.historicalAverage - variant.minPrice)} düşük
                </p>
              )}
            </div>
            <div className="rounded-lg bg-surface-secondary p-3">
              <p className="text-[11px] text-text-tertiary">30 Gün Ortalaması</p>
              <p className="text-sm font-bold text-text-primary tabular-nums">
                {variant.average30d != null ? formatPrice(variant.average30d) : '—'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Retailer Listings — sorted cheapest first */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Mağaza Karşılaştırması
          </h2>
          <span className="text-[11px] text-text-tertiary">
            {listings.filter(l => l.currentPrice != null).length} fiyat · en ucuzdan pahalıya
          </span>
        </div>
        {listings.length === 0 ? (
          <EmptyState description="Bu varyant için henüz listing yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary w-10">
                    #
                  </th>
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
                    Güncelleme
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {listings.map((listing) => {
                  const change =
                    listing.currentPrice != null && listing.previousPrice != null
                      ? calculateChangePercent(listing.previousPrice, listing.currentPrice)
                      : null;

                  const rank = listing.priceRank ?? 0;
                  const isTop3 = rank >= 1 && rank <= 3 && listing.currentPrice != null;
                  const isCheapest = listing.isCheapest || rank === 1;
                  const freshness = listing.freshness ?? 'stale';
                  const freshConfig = freshnessConfig[freshness];
                  const FreshIcon = freshConfig.icon;

                  return (
                    <tr
                      key={listing.id}
                      className={`group transition-colors ${
                        isCheapest
                          ? 'bg-emerald-50/50 hover:bg-emerald-50/80 border-l-2 border-l-emerald-500'
                          : isTop3
                            ? 'bg-blue-50/30 hover:bg-blue-50/50'
                            : 'hover:bg-surface-secondary'
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-2 py-3 text-center">
                        {listing.currentPrice != null ? (
                          <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold ${
                            isCheapest
                              ? 'bg-emerald-500 text-white'
                              : isTop3
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-surface-secondary text-text-tertiary'
                          }`}>
                            {rank}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">—</span>
                        )}
                      </td>

                      {/* Retailer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: getRetailerColor(listing.retailerSlug) }}
                          />
                          <span className="text-[13px] font-medium text-text-primary">
                            {listing.retailerName}
                          </span>
                          {isCheapest && listing.currentPrice != null && (
                            <Badge variant="success" size="sm" className="ml-1">
                              <Crown className="h-3 w-3 mr-0.5" /> En Ucuz
                            </Badge>
                          )}
                        </div>
                        {listing.sellerName && (
                          <p className="text-[11px] text-text-tertiary ml-[18px]">
                            Satıcı: {listing.sellerName}
                          </p>
                        )}
                      </td>

                      {/* Current Price */}
                      <td className={`px-4 py-3 text-right tabular-nums ${
                        isCheapest
                          ? 'text-[14px] font-bold text-emerald-700'
                          : 'text-[13px] font-semibold text-text-primary'
                      }`}>
                        {listing.currentPrice != null ? formatPrice(listing.currentPrice) : '—'}
                      </td>

                      {/* Previous Price */}
                      <td className="px-4 py-3 text-right text-[13px] text-text-tertiary tabular-nums">
                        {listing.previousPrice != null
                          ? formatPrice(listing.previousPrice)
                          : '—'}
                      </td>

                      {/* Change */}
                      <td className="px-4 py-3 text-right">
                        {change != null ? <PriceChangeBadge changePercent={change} /> : <span className="text-[11px] text-text-tertiary">—</span>}
                      </td>

                      {/* Stock */}
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

                      {/* Deal */}
                      <td className="px-4 py-3 text-center">
                        {listing.isDeal ? (
                          <Badge variant="warning">
                            {listing.dealScore ? `Puan: ${listing.dealScore}` : 'Fırsat'}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">—</span>
                        )}
                      </td>

                      {/* Freshness */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <FreshIcon className={`h-3 w-3 ${freshConfig.color}`} />
                          <span className={`text-[11px] ${freshConfig.color}`}>
                            {listing.lastSeenAt
                              ? formatRelativeDate(listing.lastSeenAt)
                              : freshConfig.label}
                          </span>
                        </div>
                        {freshness === 'blocked' && (
                          <span className="text-[10px] text-red-500 mt-0.5 block">
                            Geçici engel
                          </span>
                        )}
                      </td>

                      {/* Action */}
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
              data={listings
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

      {/* Deal Events */}
      {variant.dealEvents && variant.dealEvents.length > 0 && (
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-orange-400 to-transparent" />
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">
              Son Fırsat Olayları
            </h2>
          </div>
          <div className="space-y-2">
            {variant.dealEvents.map((event) => (
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
                    <span className="text-[13px] font-medium text-text-primary">
                      {event.retailerName}
                    </span>
                    {event.isSuspiciousDiscount && (
                      <Badge variant="warning" size="sm">
                        <AlertTriangle className="h-3 w-3 mr-0.5" /> Şüpheli
                      </Badge>
                    )}
                    {event.isNewAllTimeLow && (
                      <Badge variant="success" size="sm">
                        <Award className="h-3 w-3 mr-0.5" /> En Düşük
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                    <span className="capitalize">{event.eventType.replace(/_/g, ' ').toLowerCase()}</span>
                    <span>·</span>
                    <span>{event.severity}</span>
                    <span>·</span>
                    <span>{formatRelativeDate(event.detectedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {formatPrice(event.newPrice)}
                  </span>
                  {event.dropPercent != null && event.dropPercent > 0 && (
                    <PriceChangeBadge changePercent={-event.dropPercent} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
