'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Radio,
  Activity,
  Cpu,
  Zap,
  Clock,
  Server,
  CheckCircle2,
  Loader2,
  Ghost,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
} from 'lucide-react';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useLiveUpdates } from '@/components/live-updates-context';
import { cn } from '@repo/shared';

interface WorkerView {
  workerId: string;
  shortId: string;
  status: string;
  concurrency: number;
  uptimeSec: number;
  isProcessing: boolean;
  currentTaskId: string | null;
  latency: {
    windowMs: number;
    sampleCount: number;
    p50: number;
    p95: number;
    p99: number;
    successRate: number;
  };
  queue: {
    depth: number;
    activeGlobal: number;
    activePerProvider: Record<string, number>;
  };
  counters: {
    tasksCompleted: number;
    tasksFailed: number;
    tasksSkipped: number;
    avgTaskTimeMs: number;
  };
}

interface TelemetryResponse {
  cluster: {
    onlineWorkers: number;
    reachedWorkers: number;
    fanout: number;
    latency: {
      sampleCount: number;
      scrapesPerSec: number;
      p50: number;
      p95: number;
      p99: number;
      successRate: number;
    };
    totalProviderQueueDepth: number;
    totalActiveRequests: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
  };
  perProvider: Record<string, { count: number; p50: number; p95: number; successRate: number }>;
  workers: WorkerView[];
  fetchedAt: string;
}

interface FeedbackSummary {
  last24h: { button: string; retailerSlug: string | null; count: number }[];
  ghostedListings: unknown[];
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}dk`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}s ${Math.floor((sec % 3600) / 60)}dk`;
  return `${Math.floor(sec / 86400)}g ${Math.floor((sec % 86400) / 3600)}s`;
}

function latencyColor(ms: number): string {
  if (ms === 0) return 'text-text-tertiary';
  if (ms < 1500) return 'text-emerald-600';
  if (ms < 3500) return 'text-amber-600';
  return 'text-rose-600';
}

function successColor(pct: number): 'success' | 'warning' | 'danger' | 'default' {
  if (pct >= 95) return 'success';
  if (pct >= 80) return 'warning';
  if (pct > 0) return 'danger';
  return 'default';
}

export default function CommandCenterPage() {
  const { enabled: liveEnabled, interval } = useLiveUpdates();
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<TelemetryResponse>({
    queryKey: ['worker-telemetry'],
    queryFn: () => fetch('/api/worker/telemetry').then(r => r.json()),
    refetchInterval: liveEnabled ? interval(5_000) : false,
  });

  const feedbackQ = useQuery<FeedbackSummary>({
    queryKey: ['feedback-summary'],
    queryFn: () => fetch('/api/feedback-events/summary').then(r => r.json()),
    refetchInterval: liveEnabled ? interval(15_000) : false,
  });

  if (isLoading) return <LoadingShell />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState />;

  const { cluster, perProvider, workers } = data;
  const staleCluster = cluster.reachedWorkers < cluster.onlineWorkers;

  return (
    <div className="space-y-6 animate-float-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-text-primary">
              Komuta Merkezi
            </h2>
            {liveEnabled && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                5s canlı
              </span>
            )}
          </div>
          <p className="text-[13px] text-text-tertiary mt-1">
            Tüm worker'lardan toplanan son 60 saniye gecikme + yük dağılımı
          </p>
        </div>
        <div className="text-right text-[11px] text-text-tertiary">
          <div>Son güncelleme: {new Date(dataUpdatedAt).toLocaleTimeString('tr-TR')}</div>
          <div className="mt-0.5">
            {cluster.reachedWorkers}/{cluster.onlineWorkers} worker erişildi
            {staleCluster && <span className="text-amber-600"> · {cluster.onlineWorkers - cluster.reachedWorkers} eksik</span>}
          </div>
        </div>
      </div>

      {/* ── Cluster Stats (top row) ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Aktif Worker"
          value={cluster.onlineWorkers}
          subtitle={`${cluster.totalActiveRequests} aktif istek`}
          icon={<Server className="h-4 w-4" />}
          accentColor={cluster.onlineWorkers > 0 ? '#10b981' : '#ef4444'}
        />
        <StatCard
          title="Scrape Hızı"
          value={`${cluster.latency.scrapesPerSec.toFixed(1)}/sn`}
          subtitle={`${cluster.latency.sampleCount} örnek (60sn)`}
          icon={<Zap className="h-4 w-4" />}
          accentColor={cluster.latency.scrapesPerSec > 0.5 ? '#8b5cf6' : '#94a3b8'}
        />
        <StatCard
          title="p50 Gecikme"
          value={cluster.latency.p50 > 0 ? `${cluster.latency.p50}ms` : '—'}
          subtitle={`p95: ${cluster.latency.p95}ms · p99: ${cluster.latency.p99}ms`}
          icon={<Clock className="h-4 w-4" />}
          accentColor="#6366f1"
        />
        <StatCard
          title="Başarı"
          value={`${cluster.latency.successRate.toFixed(1)}%`}
          subtitle={`${cluster.totalTasksCompleted}✓ · ${cluster.totalTasksFailed}✕ · Kuyruk ${cluster.totalProviderQueueDepth}`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accentColor={cluster.latency.successRate >= 95 ? '#10b981' : cluster.latency.successRate >= 80 ? '#f59e0b' : '#ef4444'}
        />
      </div>

      {/* ── Feedback Loop strip ── */}
      {feedbackQ.data && (
        <FeedbackStrip data={feedbackQ.data} />
      )}

      {/* ── Per-Worker Grid ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Worker Detayları</h3>
        {workers.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-text-tertiary">
              Worker erişilemiyor. WORKER_URL doğru mu?
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workers.map((w) => (
              <WorkerCard key={w.workerId} w={w} />
            ))}
          </div>
        )}
      </div>

      {/* ── Per-Provider Latency ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Provider Bazında Gecikme</h3>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary/50">
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-text-tertiary">
                  <th className="px-4 py-2.5 text-left font-medium">Provider</th>
                  <th className="px-4 py-2.5 text-right font-medium">Örnek</th>
                  <th className="px-4 py-2.5 text-right font-medium">p50</th>
                  <th className="px-4 py-2.5 text-right font-medium">p95</th>
                  <th className="px-4 py-2.5 text-right font-medium">Başarı</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(perProvider).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">Henüz veri yok</td></tr>
                ) : (
                  Object.entries(perProvider)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .map(([slug, stats]) => (
                      <tr key={slug} className="border-b border-border/40 hover:bg-surface-secondary/30">
                        <td className="px-4 py-2.5 font-medium text-text-primary">{slug}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{stats.count}</td>
                        <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', latencyColor(stats.p50))}>{stats.p50}ms</td>
                        <td className={cn('px-4 py-2.5 text-right tabular-nums', latencyColor(stats.p95))}>{stats.p95}ms</td>
                        <td className="px-4 py-2.5 text-right">
                          <Badge variant={successColor(stats.successRate)} size="sm">
                            {stats.successRate.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function WorkerCard({ w }: { w: WorkerView }) {
  const statusDot = w.status === 'busy' ? 'bg-cyan-500 animate-pulse-dot'
    : w.status === 'idle' ? 'bg-emerald-500'
    : 'bg-amber-500';
  const providerEntries = Object.entries(w.queue.activePerProvider).filter(([, n]) => n > 0);

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', statusDot)} />
            <span className="font-mono text-[12px] text-text-secondary truncate">{w.shortId}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
            <Cpu className="h-3 w-3" />
            <span>concurrency: {w.concurrency}</span>
            <span>·</span>
            <span>uptime: {formatUptime(w.uptimeSec)}</span>
          </div>
        </div>
        <Badge variant={w.isProcessing ? 'info' : 'default'} size="sm" dot>
          {w.isProcessing ? 'İşliyor' : 'Beklemede'}
        </Badge>
      </div>

      {/* Latency strip */}
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface-secondary/40 p-2.5">
        <LatencyStat label="p50" value={w.latency.p50} />
        <LatencyStat label="p95" value={w.latency.p95} />
        <LatencyStat label="p99" value={w.latency.p99} />
      </div>

      {/* Counters */}
      <div className="mt-2.5 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">{w.latency.sampleCount} örnek (60s)</span>
        <div className="flex items-center gap-3 tabular-nums">
          <span className="text-emerald-600">✓ {w.counters.tasksCompleted}</span>
          <span className="text-rose-600">✕ {w.counters.tasksFailed}</span>
          {w.counters.tasksSkipped > 0 && (
            <span className="text-amber-600">⊘ {w.counters.tasksSkipped}</span>
          )}
        </div>
      </div>

      {/* Active providers */}
      {providerEntries.length > 0 && (
        <div className="mt-3 border-t border-border pt-2.5">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-tertiary">
            <Activity className="h-3 w-3" /> Aktif
          </div>
          <div className="flex flex-wrap gap-1">
            {providerEntries.map(([slug, n]) => (
              <span key={slug} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                {slug} <span className="font-mono text-indigo-900/60">×{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function LatencyStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold tabular-nums', latencyColor(value))}>
        {value > 0 ? `${value}ms` : '—'}
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="mt-3 text-sm text-text-tertiary">Worker'lardan telemetri toplanıyor...</p>
    </div>
  );
}

// ─── Feedback Strip ─────────────────────────────────────────────────
function FeedbackStrip({ data }: { data: FeedbackSummary }) {
  const byButton: Record<string, number> = {};
  for (const row of data.last24h) {
    byButton[row.button] = (byButton[row.button] ?? 0) + row.count;
  }
  const totalVotes = Object.values(byButton).reduce((s, n) => s + n, 0);
  const ghostCount = data.ghostedListings.length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-text-primary">Topluluk Geri Bildirimi</h3>
          <span className="text-[11px] text-text-tertiary">son 24 saat</span>
        </div>
        <Link
          href="/feedback-events"
          className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          Tümünü gör →
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <FeedbackStat label="Toplam oy" icon={<Activity className="h-3.5 w-3.5" />} value={totalVotes} tone="neutral" />
        <FeedbackStat label="Alabildim" icon={<CheckCircle2 className="h-3.5 w-3.5" />} value={byButton.GOT_IT ?? 0} tone="good" />
        <FeedbackStat label="Stok yok" icon={<Ghost className="h-3.5 w-3.5" />} value={byButton.OUT_OF_STOCK ?? 0} tone="bad" />
        <FeedbackStat label="Güzel fiyat" icon={<ThumbsUp className="h-3.5 w-3.5" />} value={byButton.GOOD_PRICE ?? 0} tone="good" />
        <FeedbackStat label="Kötü fiyat" icon={<ThumbsDown className="h-3.5 w-3.5" />} value={byButton.BAD_PRICE ?? 0} tone="warn" />
      </div>

      {ghostCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-[12px] text-amber-900">
          <Ghost className="h-3.5 w-3.5 text-amber-600" />
          <span>
            <strong className="font-semibold">{ghostCount}</strong> listing doğrulama aşamasında — scrape edilmeye
            devam eder; stok bir sonraki taramada onaylanırsa bayrak otomatik kalkar.
          </span>
        </div>
      )}
    </Card>
  );
}

function FeedbackStat({
  label, value, icon, tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'good' | 'bad' | 'warn' | 'neutral';
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600'
    : tone === 'bad' ? 'text-rose-600'
    : tone === 'warn' ? 'text-amber-600'
    : 'text-text-secondary';
  return (
    <div className="rounded-lg border border-border bg-surface-secondary/30 p-2.5">
      <div className={cn('flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider', toneClass)}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}
