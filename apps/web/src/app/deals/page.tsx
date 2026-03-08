'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame, TrendingDown, ExternalLink, ArrowRight } from 'lucide-react';
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
      <div className="space-y-6 animate-float-in">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState description="Fırsat verisi yüklenemedi" />;

  return (
    <div className="space-y-6 animate-float-in">
      <h1 className="text-lg font-semibold tracking-tight text-text-primary">Fırsatlar</h1>

      {/* Active Deals */}
      <Card>
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center gap-3 mb-4 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Aktif Fırsatlar
              </h2>
              <p className="text-[11px] text-text-tertiary">{data.deals.length} fırsat bulundu</p>
            </div>
          </div>

          {data.deals.length === 0 ? (
            <EmptyState description="Şu an aktif fırsat yok" />
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-full">
                <thead>
                  <tr className="border-y border-border-light bg-surface-secondary">
                    <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Ürün
                    </th>
                    <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Mağaza
                    </th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Fiyat
                    </th>
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Fırsat Puanı
                    </th>
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Son Görülme
                    </th>
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {data.deals.map((deal) => (
                    <tr key={deal.listingId} className="group hover:bg-surface-secondary transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/variants/${deal.variantId}`}
                          className="text-[13px] font-medium text-text-primary hover:text-primary transition-colors"
                        >
                          {deal.variantName}
                        </Link>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {deal.color} · {deal.storageGb} GB
                        </p>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary">
                        {deal.retailerName}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-[13px] font-bold text-primary tabular-nums">
                          {formatPrice(deal.currentPrice)}
                        </span>
                        {deal.previousPrice != null && (
                          <p className="text-[11px] text-text-tertiary line-through tabular-nums">
                            {formatPrice(deal.previousPrice)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {deal.dealScore != null ? (
                          <Badge
                            variant={deal.dealScore >= 80 ? 'success' : deal.dealScore >= 50 ? 'warning' : 'default'}
                            size="sm"
                          >
                            {deal.dealScore}
                          </Badge>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-[11px] text-text-tertiary">
                        {deal.lastSeenAt ? formatRelativeDate(deal.lastSeenAt) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <a
                          href={deal.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-text-tertiary hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
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
        </div>
      </Card>

      {/* Biggest Drops */}
      <Card>
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center gap-3 mb-4 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingDown className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                En Büyük Fiyat Düşüşleri
              </h2>
              <p className="text-[11px] text-text-tertiary">{data.biggestDrops.length} düşüş tespit edildi</p>
            </div>
          </div>

          {data.biggestDrops.length === 0 ? (
            <EmptyState description="Son dönemde önemli fiyat düşüşü yok" />
          ) : (
            <div className="space-y-2">
              {data.biggestDrops.map((drop) => (
                <div
                  key={drop.listingId}
                  className="group flex items-center justify-between rounded-lg border border-border-light p-4 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all"
                >
                  <div className="flex-1">
                    <Link
                      href={`/variants/${drop.variantId}`}
                      className="text-[13px] font-medium text-text-primary hover:text-primary transition-colors"
                    >
                      {drop.variantName}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-text-tertiary">{drop.retailerName}</span>
                      {drop.previousPrice != null && (
                        <span className="text-[11px] text-text-tertiary line-through tabular-nums">
                          {formatPrice(drop.previousPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
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
                      className="text-text-tertiary hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                      title="Siteye git"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
