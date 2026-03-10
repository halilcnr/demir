'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { cn } from '@repo/shared';

interface ProviderHealthRow {
  retailerSlug: string;
  retailerName: string;
  isActive: boolean;
  status: 'healthy' | 'unstable' | 'failing';
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  successRate: number;
  avgResponseTimeMs: number;
  listingsUpdated: number;
  listingsFailed: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

interface StaleListingRow {
  listingId: string;
  retailerSlug: string;
  retailerName: string;
  variantName: string;
  productUrl: string;
  lastSeenAt: string;
  hoursSinceUpdate: number;
  currentPrice: number | null;
  severity: 'warning' | 'critical';
}

interface ScrapeHealthDashboard {
  providers: ProviderHealthRow[];
  staleListings: StaleListingRow[];
  summary: {
    totalProviders: number;
    healthyProviders: number;
    failingProviders: number;
    totalListingsTracked: number;
    listingsUpdatedToday: number;
    listingsFailedToday: number;
    staleListingCount: number;
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Hiç';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins}dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}sa önce`;
  const days = Math.floor(hours / 24);
  return `${days}g önce`;
}

function StatusDot({ status }: { status: 'healthy' | 'unstable' | 'failing' }) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        status === 'healthy' && 'bg-emerald-500',
        status === 'unstable' && 'bg-amber-500',
        status === 'failing' && 'bg-rose-500',
      )}
    />
  );
}

export default function ScrapeHealthPage() {
  const { data, isLoading, error, refetch } = useQuery<ScrapeHealthDashboard>({
    queryKey: ['scrape-health'],
    queryFn: async () => {
      const r = await fetch('/api/scrape-health');
      if (!r.ok) throw new Error('Scrape health API error');
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const sendReport = useMutation({
    mutationFn: () => fetch('/api/scrape-health', { method: 'POST' }).then((r) => r.json()),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState description="Sağlık verileri yüklenemedi" onRetry={refetch} />;
  if (!data) return null;

  const providers = data.providers ?? [];
  const staleListings = data.staleListings ?? [];
  const summary = data.summary ?? {
    totalProviders: 0, healthyProviders: 0, failingProviders: 0,
    totalListingsTracked: 0, listingsUpdatedToday: 0, listingsFailedToday: 0, staleListingCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Scrape Sağlık Paneli</h1>
          <p className="text-sm text-text-tertiary">
            Provider durumları, başarı oranları ve bayat listing takibi
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
            icon={<Send className="h-3.5 w-3.5" />}
            loading={sendReport.isPending}
            onClick={() => sendReport.mutate()}
          >
            Rapor Gönder
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Toplam Provider"
          value={summary.totalProviders}
          subtitle={`${summary.healthyProviders} sağlıklı`}
          icon={<Wifi className="h-4 w-4" />}
          accentColor="var(--color-primary)"
        />
        <StatCard
          title="Bugün Güncellenen"
          value={summary.listingsUpdatedToday}
          subtitle={`/ ${summary.totalListingsTracked} listing`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accentColor="#10b981"
        />
        <StatCard
          title="Başarısız"
          value={summary.listingsFailedToday}
          subtitle="bugün"
          icon={<XCircle className="h-4 w-4" />}
          accentColor="#f43f5e"
        />
        <StatCard
          title="Bayat Listing"
          value={summary.staleListingCount}
          subtitle={staleListings.filter((s) => s.severity === 'critical').length + ' kritik'}
          icon={<AlertTriangle className="h-4 w-4" />}
          accentColor="#f59e0b"
        />
      </div>

      {/* Provider Health Table */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-text-primary">Provider Durumları</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-text-tertiary">
                <th className="pb-3 pr-4">Provider</th>
                <th className="pb-3 pr-4">Durum</th>
                <th className="pb-3 pr-4 text-right">Başarı %</th>
                <th className="pb-3 pr-4 text-right">Toplam</th>
                <th className="pb-3 pr-4 text-right">Başarılı</th>
                <th className="pb-3 pr-4 text-right">Başarısız</th>
                <th className="pb-3 pr-4 text-right">Engelli</th>
                <th className="pb-3 pr-4 text-right">Ort. Süre</th>
                <th className="pb-3 pr-4 text-right">Güncellenen</th>
                <th className="pb-3 text-right">Son Başarı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {providers.map((p) => (
                <tr key={p.retailerSlug} className={cn(!p.isActive && 'opacity-40')}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <StatusDot status={p.status} />
                      <span className="font-medium text-text-primary">{p.retailerName}</span>
                      {!p.isActive && (
                        <Badge variant="default" size="sm">Pasif</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge
                      variant={
                        p.status === 'healthy' ? 'success' :
                        p.status === 'unstable' ? 'warning' : 'danger'
                      }
                      size="sm"
                      dot
                    >
                      {p.status === 'healthy' ? 'Sağlıklı' :
                       p.status === 'unstable' ? 'Kararsız' : 'Başarısız'}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs">
                    <span className={cn(
                      p.successRate >= 90 ? 'text-emerald-600' :
                      p.successRate >= 70 ? 'text-amber-600' : 'text-rose-600'
                    )}>
                      %{p.successRate.toFixed(0)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                    {p.totalAttempts}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-emerald-600">
                    {p.successCount}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-rose-600">
                    {p.failureCount}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-amber-600">
                    {p.blockedCount}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                    {formatDuration(p.avgResponseTimeMs)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                    {p.listingsUpdated}
                  </td>
                  <td className="py-3 text-right text-xs text-text-tertiary">
                    {formatTimeAgo(p.lastSuccessAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stale Listings */}
      {staleListings.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-text-primary">
              Bayat Listeler ({staleListings.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-text-tertiary">
                  <th className="pb-3 pr-4">Varyant</th>
                  <th className="pb-3 pr-4">Mağaza</th>
                  <th className="pb-3 pr-4 text-right">Fiyat</th>
                  <th className="pb-3 pr-4 text-right">Son Güncelleme</th>
                  <th className="pb-3 text-right">Seviye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staleListings.map((s) => (
                  <tr key={s.listingId}>
                    <td className="py-3 pr-4">
                      <a
                        href={s.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        {s.variantName}
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{s.retailerName}</td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-text-secondary">
                      {s.currentPrice ? `₺${s.currentPrice.toLocaleString('tr-TR')}` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right text-xs text-text-tertiary">
                      {Math.round(s.hoursSinceUpdate)}sa önce
                    </td>
                    <td className="py-3 text-right">
                      <Badge
                        variant={s.severity === 'critical' ? 'danger' : 'warning'}
                        size="sm"
                        dot
                      >
                        {s.severity === 'critical' ? 'Kritik' : 'Uyarı'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Telegram Report Status */}
      {sendReport.isSuccess && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Günlük rapor Telegram&apos;a gönderildi!</span>
          </div>
        </Card>
      )}
      {sendReport.isError && (
        <Card className="border-rose-200 bg-rose-50/50">
          <div className="flex items-center gap-2 text-rose-700">
            <ShieldAlert className="h-4 w-4" />
            <span className="text-sm font-medium">Rapor gönderilemedi. Worker bağlantısını kontrol edin.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
