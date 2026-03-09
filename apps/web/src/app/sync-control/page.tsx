'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Gauge,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Settings2,
  Timer,
  BarChart3,
  Radio,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Skull,
  Clock,
  Server,
  Save,
  Loader2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  CircleDot,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

interface WorkerConfig {
  syncIntervalMinMs: number;
  syncIntervalMaxMs: number;
  requestDelayMinMs: number;
  requestDelayMaxMs: number;
  jitterPercent: number;
  globalConcurrency: number;
  providerConcurrency: number;
  maxRetries: number;
  cooldownMultiplier: number;
  blockCooldownMinutes: number;
  activeMode: string;
}

interface ProviderMetric {
  slug: string;
  totalRequests5m: number;
  successRate5m: number;
  blockRate5m: number;
  avgLatency5m: number;
  p95Latency5m: number;
  riskScore: number;
  healthScore: number;
  circuitState: string;
}

interface DBProviderMetric {
  retailerSlug: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  rateLimitCount: number;
  healthScore: number;
  riskScore: number;
  circuitState: string;
  successRate5m: number;
  blockRate5m: number;
  avgLatency5m: number;
  lastSuccessAt: string | null;
  lastBlockedAt: string | null;
}

interface ModePreset {
  name: string;
  label: string;
  description: string;
  globalConcurrency: number;
  providerConcurrency: number;
  requestDelayMinMs: number;
  requestDelayMaxMs: number;
  jitterPercent: number;
  maxRetries: number;
  cooldownMultiplier: number;
  blockCooldownMinutes: number;
  syncIntervalMinMs: number;
  syncIntervalMaxMs: number;
}

interface SyncProgress {
  running: boolean;
  progress: number;
  currentRetailer: string | null;
  currentVariant: string | null;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  totalListings: number;
  processedListings: number;
  step: string;
  startedAt: string | null;
  estimatedRemainingMs: number | null;
}

interface CycleEstimate {
  totalListings: number;
  estimatedDurationMs: number;
  estimatedDurationFormatted: string;
  avgDelayMs: number;
  concurrency: number;
}

interface OpsStats {
  worker: {
    config: WorkerConfig;
    scheduler: {
      syncRunning: boolean;
      cycleCount: number;
      intervalMs: number;
      lastSync: { success: boolean; elapsed: number } | null;
    };
    metrics: ProviderMetric[];
    globalRisk: { score: number; level: string };
    queue: { depth: number; active: { global: number; perProvider: Record<string, number> } };
    estimate: CycleEstimate;
    modePresets: ModePreset[];
    progress: SyncProgress;
  } | null;
  providerMetrics: DBProviderMetric[];
  config: WorkerConfig | null;
  lastJob: {
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    itemsScanned: number;
    successCount: number;
    failureCount: number;
    blockedCount: number;
  } | null;
  totalListings: number;
}

interface SyncLogEntry {
  timestamp: string;
  type: string;
  retailer?: string;
  variant?: string;
  message: string;
  price?: number;
  strategy?: string;
  responseTimeMs?: number;
  blocked?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score < 15) return 'text-emerald-500';
  if (score < 35) return 'text-blue-500';
  if (score < 55) return 'text-amber-500';
  if (score < 75) return 'text-orange-500';
  return 'text-red-500';
}

function riskBg(score: number): string {
  if (score < 15) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score < 35) return 'bg-blue-500/10 border-blue-500/20';
  if (score < 55) return 'bg-amber-500/10 border-amber-500/20';
  if (score < 75) return 'bg-orange-500/10 border-orange-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function riskLabel(level: string): string {
  const map: Record<string, string> = {
    safe: 'Güvenli',
    balanced: 'Dengeli',
    aggressive: 'Agresif',
    risky: 'Riskli',
    very_risky: 'Çok Riskli',
  };
  return map[level] ?? level;
}

function RiskIcon({ score }: { score: number }) {
  if (score < 15) return <ShieldCheck className="h-5 w-5 text-emerald-500" />;
  if (score < 35) return <Shield className="h-5 w-5 text-blue-500" />;
  if (score < 55) return <ShieldAlert className="h-5 w-5 text-amber-500" />;
  if (score < 75) return <Flame className="h-5 w-5 text-orange-500" />;
  return <Skull className="h-5 w-5 text-red-500" />;
}

function circuitBadge(state: string) {
  if (state === 'closed') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">KAPALI</span>;
  if (state === 'open') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-600">AÇIK</span>;
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">TEST</span>;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}sn`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}dk ${sec}sn`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'Az önce';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk önce`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}sa önce`;
  return `${Math.floor(diff / 86400000)}g önce`;
}

const PROVIDER_NAMES: Record<string, string> = {
  amazon: 'Amazon',
  hepsiburada: 'Hepsiburada',
  trendyol: 'Trendyol',
  n11: 'N11',
  pazarama: 'Pazarama',
  idefix: 'Idefix',
  mediamarkt: 'MediaMarkt',
  a101: 'A101',
  migros: 'Migros',
};

// ─── Page Component ──────────────────────────────────────────────

export default function SyncControlPage() {
  const queryClient = useQueryClient();
  const [configForm, setConfigForm] = useState<WorkerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Data Fetching ──
  const { data: stats, isLoading } = useQuery<OpsStats>({
    queryKey: ['ops-stats'],
    queryFn: () => fetch('/api/ops/stats').then(r => r.json()),
    refetchInterval: 5000,
  });

  const { data: logsData } = useQuery<{ logs: SyncLogEntry[]; running: boolean }>({
    queryKey: ['ops-logs'],
    queryFn: () => fetch('/api/ops/logs').then(r => r.json()),
    refetchInterval: 3000,
  });

  // Initialize form from fetched config
  useEffect(() => {
    if (stats?.config && !configForm) {
      setConfigForm(stats.config);
    }
  }, [stats?.config, configForm]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<WorkerConfig>) => {
      const res = await fetch('/api/ops/stats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['ops-stats'] });
    },
  });

  // ── Derived Data ──
  const workerOnline = !!stats?.worker;
  const config = stats?.worker?.config ?? stats?.config;
  const scheduler = stats?.worker?.scheduler;
  const liveMetrics = stats?.worker?.metrics ?? [];
  const globalRisk = stats?.worker?.globalRisk ?? { score: 0, level: 'safe' };
  const progress = stats?.worker?.progress;
  const estimate = stats?.worker?.estimate;
  const modePresets = stats?.worker?.modePresets ?? [];
  const dbMetrics = stats?.providerMetrics ?? [];
  const lastJob = stats?.lastJob;
  const logs = logsData?.logs ?? [];
  const recentLogs = logs.slice(-30).reverse();

  // Merge live + DB metrics
  const providerList = useMemo(() => {
    const slugs = new Set([
      ...liveMetrics.map(m => m.slug),
      ...dbMetrics.map(m => m.retailerSlug),
      ...Object.keys(PROVIDER_NAMES),
    ]);
    return [...slugs].map(slug => {
      const live = liveMetrics.find(m => m.slug === slug);
      const db = dbMetrics.find(m => m.retailerSlug === slug);
      return {
        slug,
        name: PROVIDER_NAMES[slug] ?? slug,
        healthScore: live?.healthScore ?? db?.healthScore ?? 100,
        riskScore: live?.riskScore ?? db?.riskScore ?? 0,
        successRate: live?.successRate5m ?? db?.successRate5m ?? 100,
        blockRate: live?.blockRate5m ?? db?.blockRate5m ?? 0,
        avgLatency: live?.avgLatency5m ?? db?.avgLatency5m ?? 0,
        circuitState: live?.circuitState ?? db?.circuitState ?? 'closed',
        totalRequests: db?.totalRequests ?? 0,
        blockedCount: db?.blockedCount ?? 0,
        rateLimitCount: db?.rateLimitCount ?? 0,
        lastSuccessAt: db?.lastSuccessAt ?? null,
        lastBlockedAt: db?.lastBlockedAt ?? null,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [liveMetrics, dbMetrics]);

  // ── Mode Preset Apply ──
  function applyPreset(preset: ModePreset) {
    setConfigForm({
      syncIntervalMinMs: preset.syncIntervalMinMs,
      syncIntervalMaxMs: preset.syncIntervalMaxMs,
      requestDelayMinMs: preset.requestDelayMinMs,
      requestDelayMaxMs: preset.requestDelayMaxMs,
      jitterPercent: preset.jitterPercent,
      globalConcurrency: preset.globalConcurrency,
      providerConcurrency: preset.providerConcurrency,
      maxRetries: preset.maxRetries,
      cooldownMultiplier: preset.cooldownMultiplier,
      blockCooldownMinutes: preset.blockCooldownMinutes,
      activeMode: preset.name,
    });
  }

  function handleSave() {
    if (!configForm) return;
    setSaving(true);
    saveMutation.mutate(configForm, { onSettled: () => setSaving(false) });
  }

  // Simulate: estimate cycle for modified config
  const simEstimate = useMemo(() => {
    if (!configForm || !stats?.totalListings) return null;
    const avgDelay = (configForm.requestDelayMinMs + configForm.requestDelayMaxMs) / 2;
    const timePerItem = 2000 + avgDelay;
    const conc = Math.max(1, configForm.globalConcurrency);
    const ms = (stats.totalListings / conc) * timePerItem;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return { ms, formatted: min > 0 ? `${min}dk ${sec}sn` : `${sec}sn` };
  }, [configForm, stats?.totalListings]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-sm">
            <Gauge className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Operasyon Kontrol Merkezi</h1>
            <p className="text-xs text-text-tertiary">Yükleniyor...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-sm">
            <Gauge className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Operasyon Kontrol Merkezi</h1>
            <p className="text-xs text-text-tertiary">Scraping hızı, risk analizi, provider sağlığı</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Worker status */}
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${workerOnline ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
            <div className={`h-2 w-2 rounded-full ${workerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {workerOnline ? 'Worker Aktif' : 'Worker Offline'}
          </div>
          {scheduler && (
            <div className="text-xs text-text-tertiary">
              Döngü: #{scheduler.cycleCount}
            </div>
          )}
        </div>
      </div>

      {/* ─── Top Stats Row ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Global Risk Score */}
        <div className={`rounded-xl border p-4 ${riskBg(globalRisk.score)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-tertiary">Risk Skoru</span>
            <RiskIcon score={globalRisk.score} />
          </div>
          <div className={`text-2xl font-bold ${riskColor(globalRisk.score)}`}>{globalRisk.score}</div>
          <div className={`text-xs font-medium ${riskColor(globalRisk.score)}`}>{riskLabel(globalRisk.level)}</div>
        </div>
        {/* Sync Status */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-tertiary">Sync Durumu</span>
            {progress?.running ? <RefreshCw className="h-4 w-4 text-primary animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          <div className="text-sm font-bold text-text-primary">
            {progress?.running ? `%${progress.progress}` : 'Idle'}
          </div>
          <div className="text-xs text-text-tertiary">
            {progress?.running ? progress.currentRetailer ?? 'Hazırlanıyor...' : (lastJob?.finishedAt ? formatRelative(lastJob.finishedAt) : '—')}
          </div>
        </div>
        {/* Estimated Cycle */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-tertiary">Tahmini Döngü</span>
            <Timer className="h-4 w-4 text-text-tertiary" />
          </div>
          <div className="text-sm font-bold text-text-primary">{estimate?.estimatedDurationFormatted ?? '—'}</div>
          <div className="text-xs text-text-tertiary">{stats?.totalListings ?? 0} listing</div>
        </div>
        {/* Active Mode */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-tertiary">Aktif Mod</span>
            <Settings2 className="h-4 w-4 text-text-tertiary" />
          </div>
          <div className="text-sm font-bold text-text-primary capitalize">{config?.activeMode ?? 'balanced'}</div>
          <div className="text-xs text-text-tertiary">
            Conc: {config?.globalConcurrency ?? 1} · Delay: {config?.requestDelayMinMs ?? 1500}–{config?.requestDelayMaxMs ?? 3000}ms
          </div>
        </div>
      </div>

      {/* ─── Main Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ════ Left Column: Speed Config + Mode Presets ════ */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Mode Presets ── */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Mod Seçimi
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {modePresets.map(preset => {
                const isActive = configForm?.activeMode === preset.name;
                const presetRiskMap: Record<string, number> = { safe: 10, balanced: 30, aggressive: 55, god: 85 };
                const presetRisk = presetRiskMap[preset.name] ?? 30;
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      isActive ? 'border-primary bg-primary-light shadow-sm' : 'border-border hover:border-primary/40 hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <RiskIcon score={presetRisk} />
                      <span className="text-xs font-bold text-text-primary">{preset.label}</span>
                    </div>
                    <p className="text-[10px] text-text-tertiary leading-tight">{preset.description}</p>
                    <div className="mt-1.5 text-[10px] text-text-tertiary">
                      Conc: {preset.globalConcurrency} · {preset.requestDelayMinMs}–{preset.requestDelayMaxMs}ms
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Speed Configuration Panel ── */}
          {configForm && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" /> Hız Konfigürasyonu
                </h2>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                  {saved ? 'Kaydedildi!' : 'Kaydet'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sync Interval */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Sync Aralığı (Min)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={15000}
                      max={3600000}
                      step={15000}
                      value={configForm.syncIntervalMinMs}
                      onChange={e => setConfigForm({ ...configForm, syncIntervalMinMs: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-16 text-right">{formatMs(configForm.syncIntervalMinMs)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Sync Aralığı (Max)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={60000}
                      max={7200000}
                      step={60000}
                      value={configForm.syncIntervalMaxMs}
                      onChange={e => setConfigForm({ ...configForm, syncIntervalMaxMs: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-16 text-right">{formatMs(configForm.syncIntervalMaxMs)}</span>
                  </div>
                </div>
                {/* Request Delay */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">İstek Arası Bekleme (Min)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={100}
                      max={10000}
                      step={100}
                      value={configForm.requestDelayMinMs}
                      onChange={e => setConfigForm({ ...configForm, requestDelayMinMs: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-16 text-right">{configForm.requestDelayMinMs}ms</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">İstek Arası Bekleme (Max)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={300}
                      max={15000}
                      step={100}
                      value={configForm.requestDelayMaxMs}
                      onChange={e => setConfigForm({ ...configForm, requestDelayMaxMs: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-16 text-right">{configForm.requestDelayMaxMs}ms</span>
                  </div>
                </div>
                {/* Concurrency */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Global Eşzamanlılık</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={configForm.globalConcurrency}
                      onChange={e => setConfigForm({ ...configForm, globalConcurrency: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-8 text-right">{configForm.globalConcurrency}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Provider Eşzamanlılık</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={1}
                      value={configForm.providerConcurrency}
                      onChange={e => setConfigForm({ ...configForm, providerConcurrency: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-8 text-right">{configForm.providerConcurrency}</span>
                  </div>
                </div>
                {/* Jitter */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Jitter (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={configForm.jitterPercent}
                      onChange={e => setConfigForm({ ...configForm, jitterPercent: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-8 text-right">%{configForm.jitterPercent}</span>
                  </div>
                </div>
                {/* Max retries */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Max Tekrar</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={configForm.maxRetries}
                      onChange={e => setConfigForm({ ...configForm, maxRetries: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-8 text-right">{configForm.maxRetries}</span>
                  </div>
                </div>
                {/* Cooldown */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Blok Cooldown (dk)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={1}
                      value={configForm.blockCooldownMinutes}
                      onChange={e => setConfigForm({ ...configForm, blockCooldownMinutes: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-12 text-right">{configForm.blockCooldownMinutes}dk</span>
                  </div>
                </div>
                {/* Cooldown Multiplier */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Cooldown Çarpanı</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1.0}
                      max={3.0}
                      step={0.1}
                      value={configForm.cooldownMultiplier}
                      onChange={e => setConfigForm({ ...configForm, cooldownMultiplier: +e.target.value })}
                      className="flex-1 h-1.5 bg-border rounded-full accent-primary"
                    />
                    <span className="text-xs font-mono text-text-primary w-10 text-right">×{configForm.cooldownMultiplier.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Simulation Box */}
              {simEstimate && (
                <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary-light p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">Simülasyon</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-lg font-bold text-text-primary">{simEstimate.formatted}</div>
                      <div className="text-[10px] text-text-tertiary">Tahmini Döngü</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-text-primary">{configForm?.globalConcurrency ?? 1}×</div>
                      <div className="text-[10px] text-text-tertiary">Eşzamanlılık</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${riskColor(globalRisk.score)}`}>{globalRisk.score}</div>
                      <div className="text-[10px] text-text-tertiary">Risk Skoru</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Provider Analysis Heatmap ── */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Provider Risk Haritası
            </h2>
            <div className="grid grid-cols-3 md:grid-cols-3 gap-2">
              {providerList.map(p => (
                <div key={p.slug} className={`rounded-lg border p-3 transition-all ${riskBg(p.riskScore)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-primary">{p.name}</span>
                    {circuitBadge(p.circuitState)}
                  </div>
                  {/* Risk bar */}
                  <div className="h-1.5 rounded-full bg-border overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p.riskScore < 15 ? 'bg-emerald-500' :
                        p.riskScore < 35 ? 'bg-blue-500' :
                        p.riskScore < 55 ? 'bg-amber-500' :
                        p.riskScore < 75 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.max(3, p.riskScore)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                    <div className="text-text-tertiary">Sağlık</div>
                    <div className="text-right font-medium text-text-primary">{p.healthScore.toFixed(0)}%</div>
                    <div className="text-text-tertiary">Başarı</div>
                    <div className="text-right font-medium text-text-primary">{p.successRate.toFixed(0)}%</div>
                    <div className="text-text-tertiary">Blok</div>
                    <div className="text-right font-medium text-text-primary">{p.blockedCount}</div>
                    <div className="text-text-tertiary">Latency</div>
                    <div className="text-right font-medium text-text-primary">{p.avgLatency ? `${p.avgLatency.toFixed(0)}ms` : '—'}</div>
                    <div className="text-text-tertiary">Son Başarı</div>
                    <div className="text-right font-medium text-text-primary">{formatRelative(p.lastSuccessAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Live Activity Log ── */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" /> Canlı Aktivite
              {logsData?.running && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
            </h2>
            <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3 font-mono text-[11px] max-h-[300px] overflow-y-auto">
              {recentLogs.length === 0 ? (
                <div className="text-[#8b949e] text-center py-4">Henüz log yok...</div>
              ) : (
                recentLogs.map((log, i) => (
                  <div key={i} className="flex gap-2 py-0.5 leading-relaxed">
                    <span className="text-[#8b949e] shrink-0">{new Date(log.timestamp).toLocaleTimeString('tr-TR')}</span>
                    {log.type === 'success' && <span className="text-[#3fb950]">✓</span>}
                    {log.type === 'error' && <span className="text-[#f85149]">✗</span>}
                    {log.type === 'warn' && <span className="text-[#d29922]">⚠</span>}
                    {log.type === 'info' && <span className="text-[#58a6ff]">ℹ</span>}
                    {log.type === 'progress' && <span className="text-[#8b949e]">→</span>}
                    {log.retailer && <span className="text-[#d2a8ff]">[{log.retailer}]</span>}
                    <span className="text-[#c9d1d9]">{log.message}</span>
                    {log.responseTimeMs != null && <span className="text-[#8b949e]">{log.responseTimeMs}ms</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ════ Right Column: Risk + Progress + Estimate ════ */}
        <div className="space-y-6">

          {/* ── Risk Meter ── */}
          <div className={`rounded-xl border p-5 ${riskBg(globalRisk.score)}`}>
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" /> Risk Analizi
            </h2>
            <div className="flex flex-col items-center">
              {/* Circular risk gauge */}
              <div className="relative w-32 h-32 mb-3">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
                  <circle
                    cx="60" cy="60" r="50" fill="none" strokeWidth="8"
                    stroke={globalRisk.score < 15 ? '#10b981' : globalRisk.score < 35 ? '#6366f1' : globalRisk.score < 55 ? '#f59e0b' : globalRisk.score < 75 ? '#f97316' : '#ef4444'}
                    strokeDasharray={`${(globalRisk.score / 100) * 314} 314`}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold ${riskColor(globalRisk.score)}`}>{globalRisk.score}</span>
                  <span className="text-[10px] text-text-tertiary">/ 100</span>
                </div>
              </div>
              <div className={`text-sm font-bold ${riskColor(globalRisk.score)} mb-2`}>{riskLabel(globalRisk.level)}</div>
              <div className="text-[10px] text-text-tertiary text-center">
                Risk = (0.4 × 4xx Oranı) + (0.3 × Latency) + (0.3 × Hata Oranı)
              </div>
            </div>

            {/* Provider risk summary */}
            <div className="mt-4 space-y-1.5">
              {providerList.slice(0, 5).map(p => (
                <div key={p.slug} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${
                    p.riskScore < 15 ? 'bg-emerald-500' :
                    p.riskScore < 35 ? 'bg-blue-500' :
                    p.riskScore < 55 ? 'bg-amber-500' :
                    p.riskScore < 75 ? 'bg-orange-500' : 'bg-red-500'
                  }`} />
                  <span className="text-xs text-text-primary flex-1">{p.name}</span>
                  <span className={`text-xs font-mono font-bold ${riskColor(p.riskScore)}`}>{p.riskScore}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Live Progress ── */}
          {progress?.running && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" /> Canlı İlerleme
              </h2>
              <div className="space-y-3">
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-text-tertiary mb-1">
                    <span>İlerleme</span>
                    <span>%{progress.progress}</span>
                  </div>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress.progress}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface-secondary p-2">
                    <div className="text-text-tertiary">Provider</div>
                    <div className="font-medium text-text-primary capitalize">{progress.currentRetailer ?? '—'}</div>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2">
                    <div className="text-text-tertiary">Varyant</div>
                    <div className="font-medium text-text-primary truncate">{progress.currentVariant ?? '—'}</div>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2">
                    <div className="text-text-tertiary flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Başarılı</div>
                    <div className="font-medium text-emerald-600">{progress.successCount}</div>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2">
                    <div className="text-text-tertiary flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Başarısız</div>
                    <div className="font-medium text-red-600">{progress.failureCount}</div>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2">
                    <div className="text-text-tertiary flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Bloklu</div>
                    <div className="font-medium text-amber-600">{progress.blockedCount}</div>
                  </div>
                  <div className="rounded-lg bg-surface-secondary p-2">
                    <div className="text-text-tertiary flex items-center gap-1"><Clock className="h-3 w-3" /> Kalan</div>
                    <div className="font-medium text-text-primary">{progress.estimatedRemainingMs ? formatMs(progress.estimatedRemainingMs) : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Estimated Cycle Duration ── */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> Döngü Tahmini
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-text-tertiary">Tam sync tahmini</span>
                <span className="font-medium text-text-primary">{estimate?.estimatedDurationFormatted ?? '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-tertiary">Listing sayısı</span>
                <span className="font-medium text-text-primary">{estimate?.totalListings ?? stats?.totalListings ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-tertiary">Ortalama gecikme</span>
                <span className="font-medium text-text-primary">{estimate?.avgDelayMs ?? '—'}ms</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-tertiary">Eşzamanlılık</span>
                <span className="font-medium text-text-primary">{estimate?.concurrency ?? 1}×</span>
              </div>
              {lastJob && (
                <>
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between text-xs">
                    <span className="text-text-tertiary">Son döngü süresi</span>
                    <span className="font-medium text-text-primary">{lastJob.durationMs ? formatMs(lastJob.durationMs) : '—'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-tertiary">Son döngü başarı</span>
                    <span className="font-medium text-emerald-600">{lastJob.successCount}/{lastJob.itemsScanned}</span>
                  </div>
                </>
              )}
              {/* Simulation comparison */}
              {simEstimate && estimate && simEstimate.ms !== estimate.estimatedDurationMs && (
                <div className="mt-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-2">
                  <div className="text-[10px] font-medium text-amber-600 mb-0.5">Ayar değişikliği simülasyonu:</div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-text-tertiary">{estimate.estimatedDurationFormatted}</span>
                    <ChevronRight className="h-3 w-3 text-text-tertiary" />
                    <span className={`font-bold ${simEstimate.ms < estimate.estimatedDurationMs ? 'text-emerald-600' : 'text-amber-600'}`}>{simEstimate.formatted}</span>
                    {simEstimate.ms < estimate.estimatedDurationMs ? <TrendingDown className="h-3 w-3 text-emerald-500" /> : <TrendingUp className="h-3 w-3 text-amber-500" />}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Queue Status ── */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" /> Kuyruk Durumu
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-tertiary">Kuyruk derinliği</span>
                <span className="font-medium text-text-primary">{stats?.worker?.queue?.depth ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Aktif istek (global)</span>
                <span className="font-medium text-text-primary">{stats?.worker?.queue?.active?.global ?? 0}</span>
              </div>
              {scheduler && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Bir sonraki sync</span>
                    <span className="font-medium text-text-primary">{formatMs(scheduler.intervalMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Son sync</span>
                    <span className={`font-medium ${scheduler.lastSync?.success ? 'text-emerald-600' : 'text-red-600'}`}>
                      {scheduler.lastSync ? `${scheduler.lastSync.elapsed}s (${scheduler.lastSync.success ? 'OK' : 'FAIL'})` : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
