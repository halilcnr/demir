'use client';

/**
 * Phase 10 — Live Command Center.
 *
 * Ticking visual for the AIMD engine: speedometer for current concurrency,
 * dual-axis chart (RPM vs Heat), engine state indicator, and mode switcher.
 * Polls /api/live-telemetry every 3s through React Query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Flame, Gauge, Pause, Rocket, Shield,
  Sparkles, TrendingDown, Wind, Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { cn } from '@repo/shared';

type EngineState = 'CRUISING' | 'OVERCLOCKING' | 'THROTTLING' | 'STARVED' | 'DISABLED' | 'PAUSED';

interface ProviderTelemetrySnippet {
  retailerSlug: string;
  scrapesPerMin: number;
  p95LatencyMs: number;
  errorRate: number;
  sampleCount: number;
  errors429: number;
  errors403: number;
  errors503: number;
}

interface LiveTelemetry {
  ok: boolean;
  fetchedAt: string;
  onlineWorkers: number;
  reachedWorkers: number;
  engine: null | {
    state: EngineState;
    activeMode: string;
    cleanStreak: number;
    leaderWorkerId: string | null;
    lastTickAt: number | null;
    lastActionAt: number | null;
    lastAction: string | null;
    perWorkerConcurrency: number;
    delayMinMs: number;
    delayMaxMs: number;
    stateEnteredAt: number | null;
    lastLeaderChangeAt: number | null;
    perProvider: ProviderTelemetrySnippet[];
    bounds: {
      concurrency: { min: number; max: number };
      delayMinMs: { min: number; max: number };
    };
  };
  cluster: {
    totalConcurrency: number;
    scrapesPerMin: number;
    p95LatencyMs: number;
    errorRate: number;
    totalErrors: number;
    sampleCount: number;
  };
  history: Array<{
    ts: number;
    state: string;
    concurrency: number;
    delayMinMs: number;
    scrapesPerMin: number;
    p95LatencyMs: number;
    errorRate: number;
    errors429: number;
    errors403: number;
    errors503: number;
  }>;
}

const MODES: Array<{ id: string; label: string; icon: React.ReactNode; hint: string }> = [
  { id: 'auto',       label: 'Auto',       icon: <Sparkles className="h-3.5 w-3.5" />,  hint: 'AIMD otonom ayar' },
  { id: 'god',        label: 'God',        icon: <Flame className="h-3.5 w-3.5" />,     hint: 'Maks. hız' },
  { id: 'aggressive', label: 'Aggressive', icon: <Rocket className="h-3.5 w-3.5" />,    hint: 'Hızlı' },
  { id: 'balanced',   label: 'Balanced',   icon: <Wind className="h-3.5 w-3.5" />,      hint: 'Dengeli' },
  { id: 'safe',       label: 'Safe',       icon: <Shield className="h-3.5 w-3.5" />,    hint: 'Güvenli' },
  { id: 'pause',      label: 'Pause',      icon: <Pause className="h-3.5 w-3.5" />,     hint: 'Motor donduruldu' },
];

function stateLabelForMode(mode: string): string {
  switch (mode) {
    case 'auto': return 'Auto pilot';
    case 'god': return 'Max speed';
    case 'aggressive': return 'Fast lane';
    case 'balanced': return 'Balanced';
    case 'safe': return 'Safe mode';
    case 'pause': return 'Frozen';
    default: return mode;
  }
}

function stateTheme(state: EngineState | 'UNKNOWN') {
  switch (state) {
    case 'OVERCLOCKING':
      return { label: 'OVERCLOCKING', accent: 'from-blue-500 to-cyan-400', glow: 'shadow-[0_0_32px_-4px_rgba(56,189,248,0.8)]', text: 'text-cyan-400', dot: 'bg-cyan-400' };
    case 'THROTTLING':
      return { label: 'THROTTLING',   accent: 'from-rose-500 to-orange-500', glow: 'shadow-[0_0_32px_-4px_rgba(244,63,94,0.8)]', text: 'text-rose-400', dot: 'bg-rose-400' };
    case 'CRUISING':
      return { label: 'CRUISING',     accent: 'from-emerald-500 to-teal-400', glow: 'shadow-[0_0_32px_-4px_rgba(16,185,129,0.7)]', text: 'text-emerald-400', dot: 'bg-emerald-400' };
    case 'STARVED':
      return { label: 'STARVED',      accent: 'from-amber-500 to-yellow-500', glow: 'shadow-[0_0_24px_-6px_rgba(245,158,11,0.55)]', text: 'text-amber-300', dot: 'bg-amber-400' };
    case 'PAUSED':
      return { label: 'PAUSED',       accent: 'from-purple-500 to-violet-500', glow: '', text: 'text-purple-300', dot: 'bg-purple-400' };
    case 'DISABLED':
      return { label: 'MANUAL',       accent: 'from-slate-500 to-slate-400', glow: '', text: 'text-slate-300', dot: 'bg-slate-400' };
    default:
      return { label: 'UNKNOWN',      accent: 'from-slate-600 to-slate-500', glow: '', text: 'text-slate-400', dot: 'bg-slate-500' };
  }
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}dk ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}s ${m % 60}dk`;
}

export function LiveCommandCenter() {
  const qc = useQueryClient();
  const query = useQuery<LiveTelemetry>({
    queryKey: ['live-telemetry'],
    queryFn: () => fetch('/api/live-telemetry', { cache: 'no-store' }).then(r => r.json()),
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const modeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await fetch('/api/live-telemetry/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; mode?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'mode switch failed');
      return { ...data, mode };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['live-telemetry'] });
      setToast({ kind: 'ok', text: `Mod değiştirildi → ${data.mode ?? '?'}` });
    },
    onError: (err: Error) => {
      console.error('[mode mutation error]', err.message);
      setToast({ kind: 'err', text: `Mod değiştirilemedi: ${err.message}` });
    },
  });

  const data = query.data;
  const engine = data?.engine ?? null;
  const cluster = data?.cluster;
  const state: EngineState | 'UNKNOWN' = engine?.state ?? 'UNKNOWN';
  const theme = stateTheme(state);
  const activeMode = engine?.activeMode ?? 'balanced';
  const cleanProgress = Math.min(100, ((engine?.cleanStreak ?? 0) / 3) * 100);
  const errorRate = cluster?.errorRate ?? 0;
  const paceRatio = cluster && cluster.totalConcurrency > 0
    ? Math.min(100, Math.round((cluster.scrapesPerMin / (cluster.totalConcurrency * 20)) * 100))
    : 0;

  const concurrencyMax = engine?.bounds?.concurrency.max ?? 40;
  const timeInState = engine?.stateEnteredAt ? Date.now() - engine.stateEnteredAt : null;
  const leaderChurnAgo = engine?.lastLeaderChangeAt ? Date.now() - engine.lastLeaderChangeAt : null;
  const perProvider = engine?.perProvider ?? [];

  const chartData = useMemo(() => {
    return (data?.history ?? []).map(p => ({
      t: new Date(p.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      rpm: p.scrapesPerMin,
      heat: p.p95LatencyMs,
      concurrency: p.concurrency,
      err: p.errors429 + p.errors403 + p.errors503,
      state: p.state,
    }));
  }, [data?.history]);

  // Faz 2: state geçişlerini chart üzerinde çizgi ile işaretle
  const stateTransitions = useMemo(() => {
    const points = data?.history ?? [];
    const transitions: Array<{ t: string; from: string; to: string }> = [];
    for (let i = 1; i < points.length; i++) {
      if (points[i].state !== points[i - 1].state) {
        transitions.push({
          t: new Date(points[i].ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          from: points[i - 1].state,
          to: points[i].state,
        });
      }
    }
    return transitions;
  }, [data?.history]);

  const recentHistory = (data?.history ?? []).slice(-8).reverse();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className={cn('relative h-3 w-3 rounded-full', theme.dot)}>
                <span className={cn('absolute inset-0 rounded-full animate-ping opacity-75', theme.dot)} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Live Command Center</h1>
              <span className="text-xs font-mono uppercase tracking-[0.2em] text-slate-400">AIMD Engine</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {data ? `${data.reachedWorkers}/${data.onlineWorkers} replica · son tick ${engine?.lastTickAt ? new Date(engine.lastTickAt).toLocaleTimeString('tr-TR') : '—'}` : 'Telemetri yükleniyor...'}
            </p>
          </div>

          {/* Engine state badge */}
          <div className={cn(
            'inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r px-4 py-2 text-sm font-semibold',
            theme.accent, theme.glow,
          )}>
            <Gauge className="h-4 w-4" />
            {theme.label}
          </div>
        </div>

        {/* ── Snapshot strip ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Engine State</div>
                <div className={cn('mt-1 text-lg font-bold', theme.text)}>{theme.label}</div>
              </div>
              <div className={cn('h-3 w-3 rounded-full', theme.dot)} />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className={cn('h-full rounded-full bg-gradient-to-r', theme.accent)} style={{ width: state === 'OVERCLOCKING' ? '100%' : state === 'THROTTLING' ? '35%' : state === 'CRUISING' ? '72%' : '50%' }} />
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Son tetik: {engine?.lastTickAt ? new Date(engine.lastTickAt).toLocaleTimeString('tr-TR') : '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Mode</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-100">
              {activeMode}
              {activeMode === 'auto' && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-cyan-300">AIMD</span>}
              {activeMode === 'pause' && <span className="rounded-full bg-purple-400/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-purple-300">FROZEN</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {MODES.map(m => (
                <span
                  key={m.id}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium capitalize',
                    m.id === activeMode
                      ? 'bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30'
                      : 'bg-white/5 text-slate-400',
                  )}
                >
                  {m.label}
                </span>
              ))}
            </div>
            {timeInState != null && (
              <div className="mt-3 text-[11px] text-slate-400">
                Bu state'te: <span className="font-mono text-slate-200">{formatDuration(timeInState)}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Concurrency</div>
            <div className="mt-1 text-lg font-bold text-slate-100 tabular-nums">
              {cluster?.totalConcurrency ?? 0}
              <span className="ml-2 text-xs font-medium text-slate-400">aktif</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.min(100, (cluster?.totalConcurrency ?? 0) * 2.5)}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Worker başı: <span className="font-mono text-slate-200">{engine?.perWorkerConcurrency ?? 0}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Stability</div>
            <div className="mt-1 text-lg font-bold text-slate-100 tabular-nums">
              {engine?.cleanStreak ?? 0}<span className="text-sm font-medium text-slate-400">/3 temiz dakika</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${cleanProgress}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Error rate: <span className={cn('font-mono', errorRate > 0 ? 'text-rose-300' : 'text-emerald-300')}>{errorRate}%</span>
            </div>
          </div>
        </div>

        {/* ── Mode Switcher ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-amber-400" /> Mod Seçimi
            </div>
            {modeMutation.isPending && <span className="text-xs text-slate-400 animate-pulse">uygulanıyor…</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {MODES.map(m => {
              const isActive = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => modeMutation.mutate(m.id)}
                  disabled={modeMutation.isPending}
                  className={cn(
                    'group flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                    isActive
                      ? 'border-cyan-400/50 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 shadow-[0_0_24px_-6px_rgba(56,189,248,0.5)]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <div className={cn('flex items-center gap-1.5 text-sm font-semibold', isActive ? 'text-cyan-300' : 'text-slate-200')}>
                    {m.icon}
                    {m.label}
                    {m.id === 'auto' && isActive && (
                      <span className="ml-auto rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-cyan-300">ON</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">{m.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Toast (mod değişikliği geri bildirimi) ── */}
        {toast && (
          <div
            className={cn(
              'fixed right-4 top-4 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-opacity',
              toast.kind === 'ok'
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                : 'border-rose-400/40 bg-rose-500/15 text-rose-200',
            )}
            role="status"
          >
            {toast.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>RPM Hedefi</span>
              <span className="font-mono text-slate-200">{cluster?.scrapesPerMin ?? 0}/dk</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${paceRatio}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>P95 Isı</span>
              <span className={cn('font-mono', (cluster?.p95LatencyMs ?? 0) < 1500 ? 'text-emerald-300' : (cluster?.p95LatencyMs ?? 0) < 4000 ? 'text-amber-300' : 'text-rose-300')}>
                {cluster?.p95LatencyMs ?? 0}ms
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className={cn('h-full rounded-full', (cluster?.p95LatencyMs ?? 0) < 1500 ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : (cluster?.p95LatencyMs ?? 0) < 4000 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-rose-500 to-red-500')} style={{ width: `${Math.min(100, ((cluster?.p95LatencyMs ?? 0) / 4000) * 100)}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Son Aksiyon</span>
              <span className="font-mono text-slate-200">{engine?.lastActionAt ? new Date(engine.lastActionAt).toLocaleTimeString('tr-TR') : '—'}</span>
            </div>
            <div className={cn('mt-2 text-sm font-medium', theme.text)}>
              {engine?.lastAction ?? 'henüz aksiyon yok'}
            </div>
          </div>
        </div>

        {/* ── Mode cards ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {MODES.map(mode => {
            const isActive = activeMode === mode.id;
            const themeClass = isActive
              ? 'border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_24px_-10px_rgba(56,189,248,0.55)]'
              : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]';
            return (
              <div key={mode.id} className={cn('rounded-2xl border p-4 transition-all', themeClass)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={cn('flex items-center gap-2 text-sm font-semibold', isActive ? 'text-cyan-300' : 'text-slate-200')}>
                      {mode.icon}
                      {mode.label}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{mode.hint}</div>
                  </div>
                  {isActive && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-cyan-300">active</span>}
                </div>
                <div className="mt-3 text-xs text-slate-400">{stateLabelForMode(mode.id)}</div>
              </div>
            );
          })}
        </div>

        {/* ── Mini sparkline + decision rail ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Mini Sparkline</h3>
                <p className="text-xs text-slate-400">Concurrency trend · son {chartData.length} nokta</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <LegendDot color="#38bdf8" label="Concurrency" />
                <LegendDot color="#10b981" label="State" />
              </div>
            </div>
            <div className="h-36">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">Henüz trend oluşmadı.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="miniConcurrencyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={[0, 'dataMax + 3']} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area type="monotone" dataKey="concurrency" stroke="#38bdf8" fill="url(#miniConcurrencyFill)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Decision Timeline</h3>
                <p className="text-xs text-slate-400">AutoTuner history</p>
              </div>
            </div>
            <div className="space-y-2">
              {recentHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Bekleniyor…</div>
              ) : (
                recentHistory.map(point => {
                  const pointTheme = stateTheme(point.state as EngineState | 'UNKNOWN');
                  return (
                    <div key={point.ts} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2.5 w-2.5 rounded-full', pointTheme.dot)} />
                          <span className="text-xs font-semibold text-slate-100">{point.state}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{new Date(point.ts).toLocaleTimeString('tr-TR')}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                        <span>conc <span className="font-mono text-slate-200">{point.concurrency}</span></span>
                        <span>rpm <span className="font-mono text-slate-200">{point.scrapesPerMin}</span></span>
                        <span>p95 <span className="font-mono text-slate-200">{point.p95LatencyMs}ms</span></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Top row: Speedometer + KPI strip ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Speedometer
              value={cluster?.totalConcurrency ?? 0}
              max={concurrencyMax}
              state={state}
              label="Cluster Concurrency"
              sublabel={engine ? `per-worker: ${engine.perWorkerConcurrency} · cap: ${concurrencyMax}` : ''}
            />
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Engine RPM"
              value={cluster?.scrapesPerMin ?? 0}
              suffix="/dk"
              tone="primary"
            />
            <KpiCard
              icon={<Flame className="h-4 w-4" />}
              label="Heat (p95)"
              value={cluster?.p95LatencyMs ?? 0}
              suffix="ms"
              tone={heatTone(cluster?.p95LatencyMs ?? 0)}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Error Rate"
              value={cluster?.errorRate ?? 0}
              suffix="%"
              tone={(cluster?.errorRate ?? 0) > 0 ? 'danger' : 'success'}
            />
            <KpiCard
              icon={<TrendingDown className="h-4 w-4" />}
              label="Delay"
              value={engine?.delayMinMs ?? 0}
              suffix={`–${engine?.delayMaxMs ?? 0}ms`}
              tone="neutral"
            />
          </div>
        </div>

        {/* ── Chart: RPM vs Heat ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Engine RPM vs Heat</h3>
              <p className="text-xs text-slate-400">Scrape/dk (sol) — p95 Latency ms (sağ) · son {chartData.length} tick</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <LegendDot color="#38bdf8" label="RPM" />
              <LegendDot color="#f97316" label="Heat" />
              <LegendDot color="#ef4444" label="Errors" />
            </div>
          </div>
          <div className="h-72">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Telemetri birikiyor… ilk tick 60 saniye sonra.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="rpmFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="t" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    yAxisId="rpm"
                    stroke="#38bdf8"
                    fontSize={11}
                    tickLine={false}
                    label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="heat"
                    orientation="right"
                    stroke="#f97316"
                    fontSize={11}
                    tickLine={false}
                    label={{ value: 'ms', angle: 90, position: 'insideRight', fill: '#f97316', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area
                    yAxisId="rpm"
                    type="monotone"
                    dataKey="rpm"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#rpmFill)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="heat"
                    type="monotone"
                    dataKey="heat"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="rpm"
                    type="monotone"
                    dataKey="err"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  {stateTransitions.map((tr, i) => {
                    const color = tr.to === 'THROTTLING' ? '#f43f5e'
                                : tr.to === 'OVERCLOCKING' ? '#06b6d4'
                                : tr.to === 'STARVED' ? '#f59e0b'
                                : tr.to === 'PAUSED' ? '#a855f7'
                                : '#64748b';
                    return (
                      <ReferenceLine
                        key={`${tr.t}-${i}`}
                        yAxisId="rpm"
                        x={tr.t}
                        stroke={color}
                        strokeDasharray="2 4"
                        strokeOpacity={0.5}
                        label={{
                          value: tr.to,
                          position: 'top',
                          fill: color,
                          fontSize: 9,
                          opacity: 0.8,
                        }}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Last action strip ── */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">son aksiyon</span>
              <span className={cn('font-medium', theme.text)}>
                {engine?.lastAction ?? 'henüz aksiyon yok'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              {timeInState != null && (
                <span title="Bu state'te geçirilen süre">
                  state: <span className="font-mono text-slate-200">{formatDuration(timeInState)}</span>
                </span>
              )}
              <span>clean streak: <span className="font-mono text-slate-200">{engine?.cleanStreak ?? 0}/3</span></span>
              <span>leader: <span className="font-mono text-slate-200">{engine?.leaderWorkerId ? engine.leaderWorkerId.slice(0, 8) : '—'}</span></span>
              {leaderChurnAgo != null && (
                <span title="Son leader değişikliği — sık değişim → distributed lock TTL sorunu">
                  churn: <span className={cn('font-mono', leaderChurnAgo < 60_000 ? 'text-amber-300' : 'text-slate-200')}>{formatDuration(leaderChurnAgo)} önce</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Per-Provider Telemetry (Faz 2) ── */}
        {perProvider.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Provider Telemetri</h3>
                <p className="text-xs text-slate-400">Cluster geneli yerine retailer-bazlı sinyal — hangi sağlayıcı sıkıntıda?</p>
              </div>
              <div className="text-[11px] text-slate-400">
                {perProvider.length} aktif provider
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="pb-2 pr-3">Retailer</th>
                    <th className="pb-2 pr-3 text-right">RPM</th>
                    <th className="pb-2 pr-3 text-right">P95</th>
                    <th className="pb-2 pr-3 text-right">Hata %</th>
                    <th className="pb-2 pr-3 text-right">429</th>
                    <th className="pb-2 pr-3 text-right">403</th>
                    <th className="pb-2 pr-3 text-right">503</th>
                    <th className="pb-2 pr-3 text-right">Sample</th>
                    <th className="pb-2">Sağlık</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[...perProvider].sort((a, b) => b.errorRate - a.errorRate || b.p95LatencyMs - a.p95LatencyMs).map(p => {
                    const hardErrs = p.errors429 + p.errors403 + p.errors503;
                    const isHurting = hardErrs > 0 || p.p95LatencyMs > 4000;
                    const isWarning = p.errorRate > 0 || p.p95LatencyMs > 1500;
                    return (
                      <tr key={p.retailerSlug} className="hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 font-medium text-slate-200">{p.retailerSlug}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{p.scrapesPerMin}</td>
                        <td className={cn('py-2 pr-3 text-right tabular-nums', p.p95LatencyMs > 4000 ? 'text-rose-300' : p.p95LatencyMs > 1500 ? 'text-amber-300' : 'text-emerald-300')}>{p.p95LatencyMs}ms</td>
                        <td className={cn('py-2 pr-3 text-right tabular-nums', p.errorRate > 0 ? 'text-rose-300' : 'text-slate-400')}>{p.errorRate}%</td>
                        <td className={cn('py-2 pr-3 text-right tabular-nums', p.errors429 > 0 ? 'text-rose-300' : 'text-slate-500')}>{p.errors429}</td>
                        <td className={cn('py-2 pr-3 text-right tabular-nums', p.errors403 > 0 ? 'text-rose-300' : 'text-slate-500')}>{p.errors403}</td>
                        <td className={cn('py-2 pr-3 text-right tabular-nums', p.errors503 > 0 ? 'text-rose-300' : 'text-slate-500')}>{p.errors503}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{p.sampleCount}</td>
                        <td className="py-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            isHurting ? 'bg-rose-500/15 text-rose-300' : isWarning ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300',
                          )}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', isHurting ? 'bg-rose-400' : isWarning ? 'bg-amber-400' : 'bg-emerald-400')} />
                            {isHurting ? 'BLOCKED' : isWarning ? 'STRESSED' : 'HEALTHY'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function heatTone(p95: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (p95 === 0) return 'neutral';
  if (p95 < 1500) return 'success';
  if (p95 < 4000) return 'warning';
  return 'danger';
}

function KpiCard({
  icon, label, value, suffix, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const toneClass =
    tone === 'primary'  ? 'text-cyan-300'
    : tone === 'success' ? 'text-emerald-300'
    : tone === 'warning' ? 'text-amber-300'
    : tone === 'danger'  ? 'text-rose-300'
    : 'text-slate-200';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1.5 text-2xl font-bold tabular-nums', toneClass)}>
        {value}
        {suffix && <span className="ml-1 text-sm font-medium text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/**
 * SVG speedometer. A 270° arc with a glowing value arc + animated needle.
 * No external dependency — fits neatly in Tailwind/recharts ecosystem.
 */
function Speedometer({
  value, max, state, label, sublabel,
}: {
  value: number;
  max: number;
  state: EngineState | 'UNKNOWN';
  label: string;
  sublabel?: string;
}) {
  const theme = stateTheme(state);
  const pct = Math.min(1, Math.max(0, value / max));
  const arcStart = 135;
  const arcSweep = 270;
  const angle = arcStart + pct * arcSweep;

  const cx = 110, cy = 110, r = 90;
  const bgPath = arcPath(cx, cy, r, arcStart, arcStart + arcSweep);
  const fgPath = arcPath(cx, cy, r, arcStart, angle);

  const needleRad = (angle - 90) * (Math.PI / 180);
  const nx = cx + Math.cos(needleRad) * (r - 15);
  const ny = cy + Math.sin(needleRad) * (r - 15);

  const gradId = `speed-grad-${state}`;

  return (
    <div className={cn(
      'relative flex h-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6',
      theme.glow,
    )}>
      <svg viewBox="0 0 220 220" className="w-full max-w-[280px]">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            {state === 'OVERCLOCKING' && (<><stop offset="0%" stopColor="#06b6d4" /><stop offset="100%" stopColor="#3b82f6" /></>)}
            {state === 'THROTTLING'  && (<><stop offset="0%" stopColor="#f43f5e" /><stop offset="100%" stopColor="#f97316" /></>)}
            {state === 'CRUISING'    && (<><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#14b8a6" /></>)}
            {(state === 'DISABLED' || state === 'UNKNOWN') && (<><stop offset="0%" stopColor="#64748b" /><stop offset="100%" stopColor="#94a3b8" /></>)}
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={bgPath} stroke="rgba(255,255,255,0.08)" strokeWidth={12} fill="none" strokeLinecap="round" />
        {/* Active arc */}
        <path d={fgPath} stroke={`url(#${gradId})`} strokeWidth={12} fill="none" strokeLinecap="round"
          style={{ transition: 'all 500ms cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* Tick marks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const tAngle = arcStart + (i / 10) * arcSweep;
          const tRad = (tAngle - 90) * (Math.PI / 180);
          const x1 = cx + Math.cos(tRad) * (r + 4);
          const y1 = cy + Math.sin(tRad) * (r + 4);
          const x2 = cx + Math.cos(tRad) * (r + 12);
          const y2 = cy + Math.sin(tRad) * (r + 12);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />;
        })}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="#f8fafc" strokeWidth={2.5} strokeLinecap="round"
          style={{ transition: 'all 500ms cubic-bezier(0.4,0,0.2,1)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' }}
        />
        <circle cx={cx} cy={cy} r={6} fill="#f8fafc" />
        <circle cx={cx} cy={cy} r={3} fill={state === 'THROTTLING' ? '#f43f5e' : state === 'OVERCLOCKING' ? '#06b6d4' : '#10b981'} />
      </svg>
      <div className="mt-2 text-center">
        <div className={cn('text-4xl font-bold tabular-nums', theme.text)}>{value}</div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
        {sublabel && <div className="mt-1 text-[11px] text-slate-500">{sublabel}</div>}
      </div>
    </div>
  );
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle - 90) * (Math.PI / 180);
  const endRad = (endAngle - 90) * (Math.PI / 180);
  const x1 = cx + Math.cos(startRad) * r;
  const y1 = cy + Math.sin(startRad) * r;
  const x2 = cx + Math.cos(endRad) * r;
  const y2 = cy + Math.sin(endRad) * r;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
