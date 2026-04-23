'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Radar,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Copy,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Flame,
  Lock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useLiveUpdates } from '@/components/live-updates-context';
import { cn } from '@repo/shared';

type Outcome = 'ok' | 'strategy-failed' | 'blocked' | 'rate-limited' | 'http-error' | 'network-error';

interface SnapshotSummary {
  total: number;
  byProvider: Record<string, Record<Outcome, number>>;
}

interface SnapshotListItem {
  index: number;
  url: string;
  capturedAt: string;
  status: number | null;
  outcome: Outcome;
  success: boolean;
  note?: string;
  htmlLength: number;
  htmlExcerpt: string;
}

interface SnapshotFull extends SnapshotListItem {
  html: string;
  providerSlug: string;
}

// ─── WAF / anti-bot signature detection ────────────────────────────
interface WafSignature {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  hint: string;
  match: RegExp | ((s: string) => boolean);
}

const WAF_SIGNATURES: WafSignature[] = [
  {
    name: 'Cloudflare Challenge',
    confidence: 'high',
    hint: 'JS challenge — çözüm için Playwright/CF bypass gerekli',
    match: /cf-chl-bypass|cf_chl_opt|__cf_bm|Just a moment|cf-browser-verification/i,
  },
  {
    name: 'Cloudflare Turnstile',
    confidence: 'high',
    hint: 'Captcha challenge — human / residential proxy gerekli',
    match: /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i,
  },
  {
    name: 'Akamai Bot Manager',
    confidence: 'high',
    hint: 'TLS fingerprint detection — impersonate-chrome ya da Playwright',
    match: /_abck|akam\/\d|ak_bmsc|bm_sz/i,
  },
  {
    name: 'PerimeterX / HUMAN',
    confidence: 'high',
    hint: 'Davranış analizi — residential proxy + real browser',
    match: /_px\d?|_pxhd|perimeterx|px-captcha/i,
  },
  {
    name: 'DataDome',
    confidence: 'high',
    hint: 'Fingerprint + behavior — full browser session gerekli',
    match: /datadome|dd_cookie_test|datadome-captcha/i,
  },
  {
    name: 'Imperva Incapsula',
    confidence: 'high',
    hint: 'WAF — session cookies + JS execution',
    match: /incap_ses|visid_incap|_Incapsula_Resource/i,
  },
  {
    name: 'Access Denied / Forbidden',
    confidence: 'medium',
    hint: 'Generic 403 — IP-level blok olabilir, proxy dene',
    match: /access denied|you (have been|are) blocked|forbidden|reference id/i,
  },
  {
    name: 'Captcha (generic)',
    confidence: 'medium',
    hint: 'Captcha sayfası — browser automation',
    match: /captcha|recaptcha|hcaptcha|please verify|i'm not a robot/i,
  },
  {
    name: 'Rate Limit Page',
    confidence: 'medium',
    hint: 'İstek yoğunluğu — delay artır + user-agent rotate',
    match: /too many requests|rate limit(ed)?|slow down/i,
  },
  {
    name: 'Empty Body',
    confidence: 'low',
    hint: 'Muhtemelen TCP reset / TLS-level blok',
    match: (s) => s.trim().length < 50,
  },
];

function detectWafs(html: string): WafSignature[] {
  if (!html) return [];
  return WAF_SIGNATURES.filter(sig =>
    typeof sig.match === 'function' ? sig.match(html) : sig.match.test(html),
  );
}

// ─── Outcome styling ────────────────────────────────────────────────
const outcomeConfig: Record<Outcome, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; icon: typeof CheckCircle2 }> = {
  'ok':               { label: 'OK',            variant: 'success', icon: CheckCircle2 },
  'strategy-failed':  { label: 'Parse Hatası',  variant: 'warning', icon: AlertTriangle },
  'blocked':          { label: 'Engellendi',    variant: 'danger',  icon: Shield },
  'rate-limited':     { label: 'Hız Limiti',    variant: 'warning', icon: Clock },
  'http-error':       { label: 'HTTP Hatası',   variant: 'danger',  icon: XCircle },
  'network-error':    { label: 'Ağ Hatası',     variant: 'danger',  icon: XCircle },
};

// ═══════════════════════════════════════════════════════════════════
export default function ScrapeDiagnosticsPage() {
  const [selectedRetailer, setSelectedRetailer] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { enabled: liveEnabled, interval } = useLiveUpdates();

  // Summary query — always on
  const summaryQ = useQuery<SnapshotSummary>({
    queryKey: ['diagnose-summary'],
    queryFn: () => fetch('/api/worker/diagnose-scrape').then(r => r.json()),
    refetchInterval: liveEnabled ? interval(10_000) : false,
  });

  // Per-retailer list
  const listQ = useQuery<{ retailer: string; count: number; snapshots: SnapshotListItem[] }>({
    queryKey: ['diagnose-list', selectedRetailer],
    queryFn: () =>
      fetch(`/api/worker/diagnose-scrape?retailer=${encodeURIComponent(selectedRetailer!)}`).then(r => r.json()),
    enabled: !!selectedRetailer,
    refetchInterval: liveEnabled && selectedRetailer ? interval(10_000) : false,
  });

  // Full snapshot HTML
  const fullQ = useQuery<SnapshotFull>({
    queryKey: ['diagnose-full', selectedRetailer, selectedIndex],
    queryFn: () =>
      fetch(`/api/worker/diagnose-scrape?retailer=${encodeURIComponent(selectedRetailer!)}&index=${selectedIndex}`)
        .then(r => r.json()),
    enabled: !!selectedRetailer && selectedIndex !== null,
  });

  const summary = summaryQ.data;

  return (
    <div className="space-y-6 animate-float-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">Scrape Teşhisi</h2>
          {liveEnabled && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" /> 10s canlı
            </span>
          )}
        </div>
        <p className="text-[13px] text-text-tertiary mt-1">
          Bloklu/başarısız isteklerin yakalanmış HTML snapshot'ları — WAF türünü tespit edip
          çözüm yolunu öner
        </p>
      </div>

      {/* Summary by provider */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Özet — Son 40 İstek</h3>
        {summaryQ.isLoading ? <LoadingShell label="Snapshot özeti yükleniyor..." /> :
         summaryQ.error ? <ErrorState onRetry={() => summaryQ.refetch()} /> :
         !summary || Object.keys(summary.byProvider).length === 0 ? (
          <Card>
            <div className="py-6 text-center text-sm text-text-tertiary">
              Henüz snapshot yok. Scrape başladığında veri toplanır.
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(summary.byProvider)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([slug, counts]) => (
                <ProviderSummaryCard
                  key={slug}
                  slug={slug}
                  counts={counts}
                  isSelected={selectedRetailer === slug}
                  onClick={() => {
                    setSelectedRetailer(slug);
                    setSelectedIndex(null);
                  }}
                />
              ))}
          </div>
        )}
      </div>

      {/* Snapshot list + detail */}
      {selectedRetailer && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              {selectedRetailer} — Son Snapshot'lar
              {listQ.data && (
                <span className="ml-2 text-[11px] font-normal text-text-tertiary">
                  ({listQ.data.count} adet)
                </span>
              )}
            </h3>
            {listQ.isLoading ? <LoadingShell /> :
             !listQ.data || listQ.data.snapshots.length === 0 ? (
              <Card><div className="py-6 text-center text-sm text-text-tertiary">Snapshot yok</div></Card>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {listQ.data.snapshots.slice().reverse().map((s) => (
                  <SnapshotListCard
                    key={s.index}
                    snap={s}
                    isSelected={selectedIndex === s.index}
                    onClick={() => setSelectedIndex(s.index)}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Detay</h3>
            {selectedIndex === null ? (
              <Card>
                <div className="py-12 text-center text-sm text-text-tertiary">
                  Soldaki snapshot'lardan birini seç
                </div>
              </Card>
            ) : fullQ.isLoading ? <LoadingShell /> :
              !fullQ.data ? <EmptyState /> : <SnapshotDetail snap={fullQ.data} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Provider Summary Card ───────────────────────────────────────────
function ProviderSummaryCard({
  slug, counts, isSelected, onClick,
}: {
  slug: string;
  counts: Record<Outcome, number>;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const ok = counts.ok ?? 0;
  const blocked = (counts.blocked ?? 0) + (counts['rate-limited'] ?? 0);
  const errors = (counts['http-error'] ?? 0) + (counts['network-error'] ?? 0) + (counts['strategy-failed'] ?? 0);
  const okPct = total > 0 ? Math.round((ok / total) * 100) : 0;
  const blockedPct = total > 0 ? Math.round((blocked / total) * 100) : 0;

  const state: 'healthy' | 'degraded' | 'critical' =
    blockedPct >= 20 ? 'critical' :
    okPct < 80 ? 'degraded' : 'healthy';

  const accent = state === 'critical' ? '#ef4444' : state === 'degraded' ? '#f59e0b' : '#10b981';

  return (
    <Card
      hover
      onClick={onClick}
      className={cn(
        'relative overflow-hidden transition-all',
        isSelected ? 'ring-2 ring-primary ring-offset-2' : '',
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(to right, ${accent}, transparent)` }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-text-primary">{slug}</div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">{total} snapshot</div>
        </div>
        {state === 'critical' && <Flame className="h-4 w-4 text-rose-500" />}
        {state === 'degraded' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
        {state === 'healthy' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
      </div>

      {/* Stacked bar */}
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {Object.entries(counts).map(([outcome, n]) => {
          const pct = total > 0 ? (n / total) * 100 : 0;
          const color =
            outcome === 'ok' ? 'bg-emerald-500'
            : outcome === 'blocked' ? 'bg-rose-500'
            : outcome === 'rate-limited' ? 'bg-amber-500'
            : outcome === 'http-error' ? 'bg-rose-400'
            : outcome === 'network-error' ? 'bg-orange-400'
            : 'bg-slate-400';
          return <div key={outcome} className={color} style={{ width: `${pct}%` }} title={`${outcome}: ${n}`} />;
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([outcome, n]) => (
            <Badge key={outcome} variant={outcomeConfig[outcome as Outcome]?.variant ?? 'default'} size="sm">
              {outcomeConfig[outcome as Outcome]?.label ?? outcome}: {n}
            </Badge>
          ))}
      </div>
    </Card>
  );
}

// ─── Snapshot List Item ──────────────────────────────────────────────
function SnapshotListCard({
  snap, isSelected, onClick,
}: { snap: SnapshotListItem; isSelected: boolean; onClick: () => void }) {
  const cfg = outcomeConfig[snap.outcome];
  const Icon = cfg.icon;
  const when = new Date(snap.capturedAt);
  const ago = Math.round((Date.now() - when.getTime()) / 1000);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border bg-surface p-3 text-left transition-all',
        isSelected
          ? 'border-primary shadow-md ring-1 ring-primary/30'
          : 'border-border hover:border-border/60 hover:shadow-xs',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className={cn('h-3.5 w-3.5 flex-shrink-0',
            cfg.variant === 'success' ? 'text-emerald-600'
            : cfg.variant === 'danger' ? 'text-rose-600'
            : cfg.variant === 'warning' ? 'text-amber-600'
            : 'text-slate-500',
          )} />
          <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
          {snap.status !== null && (
            <span className="font-mono text-[11px] text-text-tertiary">{snap.status}</span>
          )}
        </div>
        <span className="flex-shrink-0 text-[11px] text-text-tertiary">
          {ago < 60 ? `${ago}s` : ago < 3600 ? `${Math.floor(ago / 60)}dk` : `${Math.floor(ago / 3600)}s`} önce
        </span>
      </div>
      <div className="mt-1.5 truncate font-mono text-[11px] text-text-secondary">
        {snap.url.replace(/^https?:\/\/(www\.)?/, '')}
      </div>
      {snap.note && (
        <div className="mt-1 text-[11px] text-text-tertiary italic">note: {snap.note}</div>
      )}
    </button>
  );
}

// ─── Snapshot Detail Panel ───────────────────────────────────────────
function SnapshotDetail({ snap }: { snap: SnapshotFull }) {
  const [copied, setCopied] = useState(false);
  const wafs = detectWafs(snap.html);
  const cfg = outcomeConfig[snap.outcome];
  const Icon = cfg.icon;

  return (
    <div className="space-y-4">
      {/* Outcome summary */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4',
                cfg.variant === 'success' ? 'text-emerald-600'
                : cfg.variant === 'danger' ? 'text-rose-600'
                : cfg.variant === 'warning' ? 'text-amber-600'
                : 'text-slate-500',
              )} />
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              {snap.status !== null && (
                <span className="font-mono text-sm font-medium text-text-primary">HTTP {snap.status}</span>
              )}
            </div>
            <a
              href={snap.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 break-all font-mono text-[11px] text-primary hover:underline"
            >
              {snap.url}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
            <div className="mt-1.5 flex gap-3 text-[11px] text-text-tertiary">
              <span>{new Date(snap.capturedAt).toLocaleString('tr-TR')}</span>
              <span>{snap.htmlLength.toLocaleString('tr-TR')} byte</span>
            </div>
            {snap.note && (
              <div className="mt-2 rounded-md bg-surface-secondary/60 px-2 py-1.5 text-[11px] text-text-secondary">
                <span className="font-medium">note:</span> {snap.note}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* WAF signatures — the money shot */}
      {wafs.length > 0 && (
        <Card className="border-rose-200/60 bg-rose-50/30">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-rose-600" />
            <h4 className="text-sm font-semibold text-rose-900">Tespit Edilen Engel</h4>
          </div>
          <div className="space-y-2">
            {wafs.map((w) => (
              <div key={w.name} className="rounded-md border border-rose-200/60 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-rose-900">{w.name}</div>
                  <Badge variant={w.confidence === 'high' ? 'danger' : w.confidence === 'medium' ? 'warning' : 'default'} size="sm">
                    {w.confidence === 'high' ? 'yüksek' : w.confidence === 'medium' ? 'orta' : 'düşük'} güven
                  </Badge>
                </div>
                <div className="mt-1 text-[12px] text-text-secondary">{w.hint}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {wafs.length === 0 && snap.html.length > 0 && snap.outcome !== 'ok' && (
        <Card>
          <div className="flex items-start gap-2 text-[12px] text-text-secondary">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <div>
              HTML bir WAF imzası içermiyor. Parse hatası muhtemelen strateji eksikliğinden
              — DOM yapısına bakıp yeni selector ekle.
            </div>
          </div>
        </Card>
      )}

      {/* HTML excerpt */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <FileText className="h-4 w-4" />
            HTML İçerik <span className="text-[11px] font-normal text-text-tertiary">
              (ilk {Math.min(snap.html.length, 8000)} byte)
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(snap.html);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-secondary"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
        <pre className="max-h-[500px] overflow-auto bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-200">
          {snap.html || <span className="italic text-slate-500">Gövde boş</span>}
        </pre>
      </Card>
    </div>
  );
}

function LoadingShell({ label }: { label?: string } = {}) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      {label && <p className="mt-2 text-[12px] text-text-tertiary">{label}</p>}
    </div>
  );
}
