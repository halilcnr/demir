'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldAlert, Pause, CheckCircle2 } from 'lucide-react';

type SyncState = 'idle' | 'syncing' | 'throttled' | 'alert';

interface PillData {
  state: SyncState;
  label: string;
  detail: string;
}

export function SyncStatusPill() {
  const { data } = useQuery<PillData>({
    queryKey: ['sync-pill'],
    queryFn: async () => {
      const res = await fetch('/api/ops/stats');
      if (!res.ok) return { state: 'idle' as SyncState, label: 'Idle', detail: 'Bağlantı hatası' };
      const stats = await res.json();
      const progress = stats?.worker?.progress;
      const risk = stats?.worker?.globalRisk;

      if (risk && risk.score >= 55) {
        return { state: 'alert', label: 'Risk!', detail: `Risk skoru: ${risk.score}` };
      }
      if (progress?.running) {
        return {
          state: 'syncing',
          label: `%${progress.progress}`,
          detail: progress.currentRetailer ? `${progress.currentRetailer} taraniyor` : 'Sync devam ediyor',
        };
      }
      return { state: 'idle', label: 'Idle', detail: 'Sync bekleniyor' };
    },
    refetchInterval: 5000,
  });

  const pill = data ?? { state: 'idle' as SyncState, label: 'Idle', detail: '' };

  const styles: Record<SyncState, string> = {
    idle: 'bg-surface-secondary text-text-secondary border-border',
    syncing: 'bg-primary/10 text-primary border-primary/20',
    throttled: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    alert: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  const icons: Record<SyncState, React.ReactNode> = {
    idle: <CheckCircle2 className="h-3 w-3" />,
    syncing: <RefreshCw className="h-3 w-3 animate-spin" />,
    throttled: <Pause className="h-3 w-3" />,
    alert: <ShieldAlert className="h-3 w-3" />,
  };

  return (
    <div className={`group relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-default transition-colors ${styles[pill.state]}`}>
      {icons[pill.state]}
      <span>{pill.label}</span>
      {/* Tooltip */}
      <div className="absolute top-full right-0 mt-1 hidden group-hover:block z-50">
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary shadow-lg whitespace-nowrap">
          {pill.detail}
        </div>
      </div>
    </div>
  );
}
