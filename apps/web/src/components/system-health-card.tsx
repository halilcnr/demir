'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Monitor, Cpu, Database, RefreshCw } from 'lucide-react';
import type { SystemHealthInfo, HealthStatus } from '@repo/shared';

const statusConfig: Record<HealthStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'default'; dotColor: string }> = {
  healthy: { label: 'Sağlıklı', variant: 'success', dotColor: 'bg-emerald-500' },
  warning: { label: 'Uyarı', variant: 'warning', dotColor: 'bg-amber-500' },
  degraded: { label: 'Düşük', variant: 'danger', dotColor: 'bg-orange-500' },
  error: { label: 'Hata', variant: 'danger', dotColor: 'bg-rose-500' },
};

const systemParts = [
  { key: 'frontend' as const, label: 'Frontend', icon: Monitor },
  { key: 'worker' as const, label: 'Worker', icon: Cpu },
  { key: 'database' as const, label: 'Veritabanı', icon: Database },
  { key: 'syncEngine' as const, label: 'Senkronizasyon', icon: RefreshCw },
];

export function SystemHealthCard() {
  const { data, isLoading } = useQuery<SystemHealthInfo>({
    queryKey: ['system-health'],
    queryFn: () => fetch('/api/health/system').then((r) => r.json()),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
            <Shield className="h-4 w-4 text-text-tertiary" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Sistem Durumu</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-lg skeleton" />
          ))}
        </div>
      </Card>
    );
  }

  const allHealthy = systemParts.every((p) => data[p.key].status === 'healthy');

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
            <Shield className="h-4 w-4 text-text-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Sistem Durumu</h3>
            <p className="text-[11px] text-text-tertiary">Tüm bileşenler</p>
          </div>
        </div>
        {allHealthy && (
          <Badge variant="success" size="sm" dot>
            Tümü Çalışıyor
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {systemParts.map(({ key, label, icon: Icon }) => {
          const info = data[key];
          const cfg = statusConfig[info.status];
          return (
            <div
              key={key}
              className="rounded-xl border border-border p-3 hover:bg-surface-secondary transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-3.5 w-3.5 text-text-tertiary" />
                <span className="text-xs font-medium text-text-primary">{label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                <span className="text-[11px] text-text-secondary">{info.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
