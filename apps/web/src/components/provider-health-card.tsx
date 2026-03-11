'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeDate } from '@repo/shared';
import { Activity } from 'lucide-react';
import { useLiveUpdates } from './live-updates-context';

interface ProviderInfo {
  slug: string;
  name: string;
  isActive: boolean;
  status: 'healthy' | 'warning' | 'blocked' | 'error' | 'cooldown';
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastBlockedAt: string | null;
  consecutiveFailures: number;
  blockedCount: number;
  listingCount?: number;
  lastListingSeenAt: string | null;
}

interface DiscoverySourceInfo {
  source: string;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  cooldownUntil: string | null;
}

interface HealthData {
  providers: ProviderInfo[];
  discoverySources: Record<string, DiscoverySourceInfo> | null;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  healthy: { label: 'Sağlıklı', variant: 'success' },
  warning: { label: 'Uyarı', variant: 'warning' },
  blocked: { label: 'Engellendi', variant: 'danger' },
  error: { label: 'Hata', variant: 'danger' },
  cooldown: { label: 'Soğuma', variant: 'warning' },
};

export function ProviderHealthCard() {
  const { interval } = useLiveUpdates();
  const { data, isLoading } = useQuery<HealthData>({
    queryKey: ['provider-health'],
    queryFn: () => fetch('/api/health/providers').then((r) => r.json()),
    refetchInterval: interval(60_000),
  });

  if (isLoading || !data) {
    return (
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
            <Activity className="h-4 w-4 text-text-tertiary" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Sağlayıcı Durumu</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded-lg skeleton" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
          <Activity className="h-4 w-4 text-text-secondary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Sağlayıcı Durumu</h3>
          <p className="text-[11px] text-text-tertiary">{data.providers.length} sağlayıcı takipte</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.providers.map((p) => {
          const cfg = statusConfig[p.status] ?? statusConfig.warning;
          return (
            <div
              key={p.slug}
              className="group flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 hover:bg-surface-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      p.status === 'healthy'
                        ? 'bg-emerald-500'
                        : p.status === 'warning' || p.status === 'cooldown'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                  />
                  {p.status === 'healthy' && (
                    <div className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
                  )}
                </div>
                <span className="text-[13px] font-medium text-text-primary">{p.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {p.listingCount != null && p.listingCount > 0 && (
                  <span className="text-[11px] text-text-tertiary tabular-nums">
                    {p.listingCount} ürün
                  </span>
                )}
                {p.blockedCount > 0 && (
                  <span className="text-[11px] text-rose-500 tabular-nums">
                    {p.blockedCount}× engel
                  </span>
                )}
                {p.lastSuccessAt && (
                  <span className="text-[11px] text-text-tertiary">
                    {formatRelativeDate(p.lastSuccessAt)}
                  </span>
                )}
                <Badge variant={cfg.variant} dot size="sm">{cfg.label}</Badge>
              </div>
            </div>
          );
        })}
      </div>

      {data.discoverySources && Object.keys(data.discoverySources).length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-[11px] font-medium text-text-tertiary mb-2">Keşif Kaynakları</p>
          <div className="space-y-1">
            {Object.values(data.discoverySources).map((ds) => {
              const inCooldown = ds.cooldownUntil && new Date(ds.cooldownUntil) > new Date();
              const isBlocked = ds.blockedCount > 0;
              return (
                <div
                  key={ds.source}
                  className="flex items-center justify-between rounded-md px-3 py-1.5 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        inCooldown ? 'bg-amber-500' : isBlocked ? 'bg-rose-400' : ds.successCount > 0 ? 'bg-emerald-400' : 'bg-slate-300'
                      }`}
                    />
                    <span className="text-text-secondary capitalize">{ds.source}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-tertiary tabular-nums">
                    {ds.successCount > 0 && <span className="text-emerald-600">{ds.successCount}✓</span>}
                    {ds.failureCount > 0 && <span className="text-amber-600">{ds.failureCount}✗</span>}
                    {ds.blockedCount > 0 && <span className="text-rose-500">{ds.blockedCount}× engel</span>}
                    {inCooldown && <Badge variant="warning" size="sm">Soğuma</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
