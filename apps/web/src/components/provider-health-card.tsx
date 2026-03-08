'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeDate } from '@repo/shared';
import { Activity } from 'lucide-react';

interface ProviderInfo {
  slug: string;
  name: string;
  isActive: boolean;
  status: 'healthy' | 'warning' | 'blocked' | 'error';
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastBlockedAt: string | null;
  consecutiveFailures: number;
  blockedCount: number;
  lastListingSeenAt: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  healthy: { label: 'Sağlıklı', variant: 'success' },
  warning: { label: 'Uyarı', variant: 'warning' },
  blocked: { label: 'Engellendi', variant: 'danger' },
  error: { label: 'Hata', variant: 'danger' },
};

export function ProviderHealthCard() {
  const { data, isLoading } = useQuery<{ providers: ProviderInfo[] }>({
    queryKey: ['provider-health'],
    queryFn: () => fetch('/api/health/providers').then((r) => r.json()),
    refetchInterval: 60_000,
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
          <p className="text-[11px] text-text-tertiary">5 sağlayıcı takipte</p>
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
                        : p.status === 'warning'
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
    </Card>
  );
}
