'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Trophy,
  ExternalLink,
  Package,
  TrendingDown,
  BarChart3,
  ChevronRight,
  Smartphone,
  Zap,
  Award,
  History,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice, formatRelativeDate } from '@repo/shared';
import type { BestByStorageGroup } from '@repo/shared';

const MODEL_FAMILIES = [
  'Tümü',
  'iPhone 13',
  'iPhone 14',
  'iPhone 15',
  'iPhone 16',
  'iPhone 17',
  'iPhone 17 Air',
  'iPhone 17 Pro',
  'iPhone 17 Pro Max',
];

const STORAGE_OPTIONS = [128, 256, 512, 1024];

function storageLabel(gb: number): string {
  return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
}

function getRetailerBrandColor(slug: string): string {
  const map: Record<string, string> = {
    hepsiburada: '#ff6000',
    trendyol: '#f27a1a',
    n11: '#7849b8',
    amazon: '#ff9900',
    pazarama: '#00b900',
  };
  return map[slug] ?? '#6b7280';
}

export default function BestByStoragePage() {
  const [selectedFamily, setSelectedFamily] = useState('Tümü');
  const [selectedStorage, setSelectedStorage] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery<BestByStorageGroup[]>({
    queryKey: ['best-by-storage', selectedFamily],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedFamily !== 'Tümü') params.set('family', selectedFamily);
      return fetch(`/api/best-by-storage?${params}`).then(r => r.json());
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;

  const groups = data ?? [];
  const filtered = selectedStorage
    ? groups.filter(g => g.storageGb === selectedStorage)
    : groups;

  return (
    <div className="space-y-8 animate-float-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <Trophy className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              En Ucuz Seçenekler
            </h1>
            <p className="text-sm text-text-tertiary">
              Model + depolama bazında renk fark etmeksizin en uygun fiyatlar
            </p>
          </div>
        </div>
      </div>

      {/* Model Filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {MODEL_FAMILIES.map(f => (
            <button
              key={f}
              onClick={() => setSelectedFamily(f)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-150
                ${selectedFamily === f
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface border border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Storage Filter */}
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-text-tertiary" />
          <span className="text-xs font-medium text-text-tertiary mr-1">Depolama:</span>
          <button
            onClick={() => setSelectedStorage(null)}
            className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-all
              ${selectedStorage === null
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-surface border border-border text-text-secondary hover:bg-surface-secondary'
              }`}
          >
            Tümü
          </button>
          {STORAGE_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSelectedStorage(s)}
              className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-all
                ${selectedStorage === s
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-surface border border-border text-text-secondary hover:bg-surface-secondary'
                }`}
            >
              {storageLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState description="Seçilen filtre için sonuç bulunamadı" />
      ) : (
        <div className="space-y-6">
          {filtered.map((group, i) => (
            <Card key={`${group.familySlug}-${group.storageGb}`} className="relative overflow-hidden">
              {/* Top accent */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-orange-400 to-transparent" />

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 border border-border">
                    <Smartphone className="h-4 w-4 text-text-secondary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                      {group.familyName}
                    </h2>
                    <span className="text-xs text-text-tertiary">
                      {storageLabel(group.storageGb)}
                    </span>
                  </div>
                </div>
                {group.cheapest && (
                  <div className="flex items-center gap-2">
                    {group.priceInsights.isBestIn30d && (
                      <Badge variant="success" size="sm" className="gap-1">
                        <Award className="h-3 w-3" />
                        30 Günün En Ucuzu
                      </Badge>
                    )}
                    <Badge variant="success" size="sm" className="gap-1">
                      <Zap className="h-3 w-3" />
                      En Ucuz Seçenek
                    </Badge>
                  </div>
                )}
              </div>

              {/* Cheapest Card */}
              {group.cheapest ? (
                <div className="mb-5 rounded-xl border-2 border-amber-200 bg-gradient-to-b from-amber-50/80 to-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                          En Ucuz
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-text-primary tabular-nums">
                        {formatPrice(group.cheapest.price)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${getRetailerBrandColor(group.cheapest.retailerSlug)}15`,
                            color: getRetailerBrandColor(group.cheapest.retailerSlug),
                          }}
                        >
                          {group.cheapest.retailerName}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {group.cheapest.color}
                        </span>
                      </div>
                      {group.cheapest.lastSeenAt && (
                        <p className="text-[11px] text-text-tertiary mt-1">
                          Son güncelleme: {formatRelativeDate(group.cheapest.lastSeenAt)}
                        </p>
                      )}
                    </div>
                    <a
                      href={group.cheapest.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark transition-colors shadow-sm"
                    >
                      Satın Al <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <EmptyState description="Bu konfigürasyon için fiyat bilgisi yok" />
              )}

              {/* Price Insights */}
              {group.priceInsights.averagePrice && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">En Ucuz</p>
                    <p className="text-xs font-semibold text-text-primary">
                      {group.priceInsights.cheapestRetailer ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">İkinci En Ucuz</p>
                    <p className="text-xs font-semibold text-text-primary">
                      {group.priceInsights.secondCheapest ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">Fiyat Farkı</p>
                    <p className="text-xs font-semibold text-text-primary">
                      {group.priceInsights.priceSpread != null
                        ? formatPrice(group.priceInsights.priceSpread)
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <p className="text-[11px] text-text-tertiary">Ortalama</p>
                    <p className="text-xs font-semibold text-text-primary">
                      {group.priceInsights.averagePrice
                        ? formatPrice(group.priceInsights.averagePrice)
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2.5">
                    <div className="flex items-center gap-1">
                      <History className="h-3 w-3 text-text-tertiary" />
                      <p className="text-[11px] text-text-tertiary">30 Gün En Düşük</p>
                    </div>
                    <p className={`text-xs font-semibold ${group.priceInsights.isBestIn30d ? 'text-emerald-600' : 'text-text-primary'}`}>
                      {group.priceInsights.historicalLowest30d != null
                        ? formatPrice(group.priceInsights.historicalLowest30d)
                        : '—'}
                    </p>
                    {group.priceInsights.isBestIn30d && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">Şu an en iyi!</p>
                    )}
                  </div>
                </div>
              )}

              {/* Retailer Comparison Table */}
              {group.allRetailers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                          Mağaza
                        </th>
                        <th className="pb-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                          Renk
                        </th>
                        <th className="pb-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider text-right">
                          Fiyat
                        </th>
                        <th className="pb-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider text-center">
                          Stok
                        </th>
                        <th className="pb-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider text-right">
                          Güncelleme
                        </th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {group.allRetailers.map((r, j) => (
                        <tr key={j} className="group hover:bg-surface-secondary/50 transition-colors">
                          <td className="py-2.5">
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${getRetailerBrandColor(r.retailerSlug)}12`,
                                color: getRetailerBrandColor(r.retailerSlug),
                              }}
                            >
                              {r.retailerName}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs text-text-secondary">{r.color}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-sm font-semibold text-text-primary tabular-nums">
                              {r.price != null ? formatPrice(r.price) : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 text-center">
                            <Badge
                              variant={
                                r.stockStatus === 'IN_STOCK'
                                  ? 'success'
                                  : r.stockStatus === 'OUT_OF_STOCK'
                                  ? 'danger'
                                  : 'default'
                              }
                              size="sm"
                            >
                              {r.stockStatus === 'IN_STOCK' ? 'Stokta' : r.stockStatus === 'OUT_OF_STOCK' ? 'Tükendi' : '—'}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right text-[11px] text-text-tertiary">
                            {r.lastSeenAt ? formatRelativeDate(r.lastSeenAt) : '—'}
                          </td>
                          <td className="py-2.5 text-right">
                            <a
                              href={r.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
