'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import {
  BarChart3,
  Calculator,
  ExternalLink,
  Flame,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn } from '@repo/shared';
import Link from 'next/link';
import { useState } from 'react';

interface SmartDealAlert {
  variantId: string;
  variantName: string;
  familyName: string;
  retailerSlug: string;
  retailerName: string;
  currentPrice: number;
  top3AveragePrice: number;
  marketAveragePrice: number;
  allTimeLowest: number;
  savingsVsMarket: number;
  savingsVsTop3: number;
  savingsPercent: number;
  dealScore: number;
  reasons: string[];
  productUrl: string;
  detectedAt: string;
}

interface AnalyticsRow {
  variantId: string;
  variantName: string;
  variantSlug: string;
  familyName: string;
  lowestCurrentPrice: number;
  top3AveragePrice: number;
  marketAveragePrice: number;
  medianPrice: number;
  priceSpread: number;
  allTimeLowest: number;
  allTimeHighest: number;
  avg7d: number | null;
  avg30d: number | null;
  avg90d: number | null;
  trendDirection: string;
  volatilityScore: number;
  dealProbability: number;
  activeListingCount: number;
  cheapestRetailers: string[];
  computedAt: string;
}

interface AnalyticsData {
  deals: SmartDealAlert[];
  analytics: AnalyticsRow[];
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(value);
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === 'falling') return <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />;
  if (direction === 'rising') return <TrendingUp className="h-3.5 w-3.5 text-rose-600" />;
  return <Minus className="h-3.5 w-3.5 text-text-tertiary" />;
}

function DealScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-300',
          )}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="font-mono text-xs text-text-secondary">{score}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'deals' | 'analytics'>('deals');

  const { data, isLoading, error, refetch } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const r = await fetch('/api/analytics');
      if (!r.ok) throw new Error('Analytics API error');
      return r.json();
    },
    refetchInterval: 120_000,
  });

  const recompute = useMutation({
    mutationFn: () => fetch('/api/analytics', { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState description="Analitik verileri yüklenemedi" onRetry={refetch} />;
  if (!data) return null;

  const deals = data.deals ?? [];
  const analytics = data.analytics ?? [];

  // Data for the top deals bar chart
  const topDealsChart = deals.slice(0, 8).map((d) => ({
    name: d.variantName.replace('iPhone ', '').slice(0, 20),
    savings: d.savingsVsMarket,
    score: d.dealScore,
  }));

  // Summary stats
  const avgDealScore = deals.length > 0
    ? Math.round(deals.reduce((s, d) => s + d.dealScore, 0) / deals.length)
    : 0;
  const fallingCount = analytics.filter((a) => a.trendDirection === 'falling').length;
  const highDealProb = analytics.filter((a) => a.dealProbability >= 60).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Fiyat Analitik & Fırsat Zekası</h1>
          <p className="text-sm text-text-tertiary">
            Akıllı fırsat tespiti, piyasa analizi ve fiyat trendleri
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => refetch()}
          >
            Yenile
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Calculator className="h-3.5 w-3.5" />}
            loading={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            Yeniden Hesapla
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Aktif Fırsatlar"
          value={deals.length}
          subtitle="akıllı tespit"
          icon={<Zap className="h-4 w-4" />}
          accentColor="#10b981"
        />
        <StatCard
          title="Ort. Fırsat Skoru"
          value={avgDealScore}
          subtitle="/ 100"
          icon={<Target className="h-4 w-4" />}
          accentColor="var(--color-primary)"
        />
        <StatCard
          title="Düşüş Trendi"
          value={fallingCount}
          subtitle="varyant ucuzluyor"
          icon={<TrendingDown className="h-4 w-4" />}
          accentColor="#6366f1"
        />
        <StatCard
          title="Yüksek Fırsat"
          value={highDealProb}
          subtitle="olasılık ≥ %60"
          icon={<Flame className="h-4 w-4" />}
          accentColor="#f59e0b"
        />
      </div>

      {/* Top Deals Chart */}
      {topDealsChart.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">En İyi Fırsatlar — Piyasa Tasarrufu</h2>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topDealsChart} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`}
                fontSize={11}
              />
              <YAxis dataKey="name" type="category" width={120} fontSize={11} />
              <Tooltip
                formatter={(value: number) => [formatPrice(value), 'Tasarruf']}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="savings" radius={[0, 6, 6, 0]}>
                {topDealsChart.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.score >= 70 ? '#10b981' : entry.score >= 40 ? '#f59e0b' : '#94a3b8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setTab('deals')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            tab === 'deals'
              ? 'bg-white text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary',
          )}
        >
          Akıllı Fırsatlar ({deals.length})
        </button>
        <button
          onClick={() => setTab('analytics')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            tab === 'analytics'
              ? 'bg-white text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary',
          )}
        >
          Varyant Analitik ({analytics.length})
        </button>
      </div>

      {/* Smart Deals List */}
      {tab === 'deals' && (
        <div className="space-y-3">
          {deals.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-text-tertiary py-8">
                Şu an tespit edilen fırsat bulunmuyor. Fiyatlar değiştikçe burada görünecek.
              </p>
            </Card>
          ) : (
            deals.map((deal) => (
              <Card key={`${deal.variantId}-${deal.retailerSlug}`} hover>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="text-sm font-semibold text-text-primary truncate">
                        {deal.variantName}
                      </span>
                      <Badge variant="info" size="sm">{deal.retailerName}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
                      <span>Fiyat: <strong className="text-text-primary">{formatPrice(deal.currentPrice)}</strong></span>
                      <span>Piyasa Ort: {formatPrice(deal.marketAveragePrice)}</span>
                      <span>Top3 Ort: {formatPrice(deal.top3AveragePrice)}</span>
                      <span>Tüm Zaman En Düşük: {formatPrice(deal.allTimeLowest)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(deal.reasons ?? []).map((reason, i) => (
                        <Badge key={i} variant="success" size="sm">{reason}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <DealScoreBar score={deal.dealScore} />
                    <div className="text-right">
                      <div className="text-lg font-bold text-emerald-600">
                        -{formatPrice(deal.savingsVsMarket)}
                      </div>
                      <div className="text-[11px] text-text-tertiary">
                        %{(deal.savingsPercent ?? 0).toFixed(1)} tasarruf
                      </div>
                    </div>
                    <a
                      href={deal.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Satın Al <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Variant Analytics Table */}
      {tab === 'analytics' && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Varyant Fiyat Analizi</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-text-tertiary">
                  <th className="pb-3 pr-4">Varyant</th>
                  <th className="pb-3 pr-4 text-right">En Düşük</th>
                  <th className="pb-3 pr-4 text-right">Top3 Ort.</th>
                  <th className="pb-3 pr-4 text-right">Piyasa Ort.</th>
                  <th className="pb-3 pr-4 text-right">Fark</th>
                  <th className="pb-3 pr-4 text-center">Trend</th>
                  <th className="pb-3 pr-4 text-right">Volatilite</th>
                  <th className="pb-3 pr-4 text-right">Fırsat %</th>
                  <th className="pb-3 text-right">Mağaza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analytics.map((a) => (
                  <tr key={a.variantId} className="hover:bg-slate-50/50">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/variants/${a.variantSlug}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.variantName}
                      </Link>
                      <div className="text-[11px] text-text-tertiary">
                        {a.familyName} · {a.activeListingCount} listing
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-text-primary">
                      {formatPrice(a.lowestCurrentPrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                      {formatPrice(a.top3AveragePrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                      {formatPrice(a.marketAveragePrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs">
                      <span className={a.priceSpread > 5000 ? 'text-amber-600' : 'text-text-tertiary'}>
                        {formatPrice(a.priceSpread)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <TrendIcon direction={a.trendDirection} />
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                      {(a.volatilityScore ?? 0).toFixed(1)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <DealScoreBar score={a.dealProbability} />
                    </td>
                    <td className="py-3 text-right text-xs text-text-tertiary">
                      {((a.cheapestRetailers ?? []) as string[]).slice(0, 2).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
