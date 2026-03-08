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
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Sağlayıcı Durumu</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 rounded bg-gray-100" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">Sağlayıcı Durumu</h3>
      </div>
      <div className="space-y-3">
        {data.providers.map((p) => {
          const cfg = statusConfig[p.status] ?? statusConfig.warning;
          return (
            <div
              key={p.slug}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full ${
                    p.status === 'healthy'
                      ? 'bg-green-500'
                      : p.status === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-800">{p.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {p.lastSuccessAt && (
                  <span className="text-xs text-gray-400">
                    {formatRelativeDate(p.lastSuccessAt)}
                  </span>
                )}
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
