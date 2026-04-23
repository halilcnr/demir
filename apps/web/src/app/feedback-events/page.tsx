'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  CheckCircle2,
  Ghost,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  ExternalLink,
  Filter,
  Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useLiveUpdates } from '@/components/live-updates-context';
import { cn, formatPrice } from '@repo/shared';

type ButtonCode = 'GOT_IT' | 'OUT_OF_STOCK' | 'GOOD_PRICE' | 'BAD_PRICE';

interface FeedbackEvent {
  id: string;
  listingId: string;
  chatId: string;
  button: ButtonCode;
  retailerSlug: string | null;
  retailerName: string | null;
  variantLabel: string | null;
  currentPrice: number | null;
  productUrl: string | null;
  isGhosted: boolean;
  createdAt: string;
}

interface GhostedListing {
  id: string;
  ghostUntil: string | null;
  ghostReason: string | null;
  currentPrice: number | null;
  retailer: { slug: string; name: string };
  variant: { label: string };
}

interface Summary {
  last24h: { button: ButtonCode; retailerSlug: string | null; count: number }[];
  ghostedListings: GhostedListing[];
}

const buttonMeta: Record<ButtonCode, { label: string; variant: 'success' | 'danger' | 'warning' | 'info'; icon: typeof CheckCircle2 }> = {
  GOT_IT:        { label: '✅ Alabildim',    variant: 'success', icon: CheckCircle2 },
  OUT_OF_STOCK:  { label: '❌ Stok yok',     variant: 'danger',  icon: Ghost        },
  GOOD_PRICE:    { label: '🔥 Güzel fiyat',  variant: 'info',    icon: ThumbsUp     },
  BAD_PRICE:     { label: '💩 Kötü fiyat',   variant: 'warning', icon: ThumbsDown   },
};

function relativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s önce`;
  if (s < 3600) return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}s önce`;
  return `${Math.floor(s / 86400)}g önce`;
}

export default function FeedbackEventsPage() {
  const { enabled: liveEnabled, interval } = useLiveUpdates();
  const [buttonFilter, setButtonFilter] = useState<ButtonCode | null>(null);

  const summaryQ = useQuery<Summary>({
    queryKey: ['feedback-summary-full'],
    queryFn: () => fetch('/api/feedback-events/summary').then(r => r.json()),
    refetchInterval: liveEnabled ? interval(15_000) : false,
  });

  const feedQ = useQuery<{ events: FeedbackEvent[]; count: number }>({
    queryKey: ['feedback-feed', buttonFilter],
    queryFn: () => {
      const qs = buttonFilter ? `?button=${buttonFilter}` : '';
      return fetch(`/api/feedback-events${qs}`).then(r => r.json());
    },
    refetchInterval: liveEnabled ? interval(15_000) : false,
  });

  return (
    <div className="space-y-6 animate-float-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">
            Topluluk Geri Bildirimi
          </h2>
          {liveEnabled && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
              15s canlı
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-text-tertiary">
          Telegram'da fırsat bildirimlerine basılan oyların anlık akışı — bot bu oylarla
          ghost listing'leri tespit edip retailer güven skorunu ayarlar
        </p>
      </div>

      {/* Ghost listings panel */}
      {summaryQ.data?.ghostedListings && summaryQ.data.ghostedListings.length > 0 && (
        <Card className="border-amber-200/60 bg-amber-50/30">
          <div className="mb-3 flex items-center gap-2">
            <Ghost className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">
              Doğrulama Aşamasındaki Listings
            </h3>
            <Badge variant="warning" size="sm">
              {summaryQ.data.ghostedListings.length}
            </Badge>
          </div>
          <p className="mb-2 text-[11px] text-amber-900/70">
            Scrape edilmeye devam ediyor. IN_STOCK olarak doğrulanırsa bayrak otomatik kalkar;
            aksi hâlde deal alert'i bastırılır.
          </p>
          <div className="space-y-1.5">
            {summaryQ.data.ghostedListings.slice(0, 10).map(g => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-text-primary">
                    {g.variant.label}
                  </div>
                  <div className="truncate text-text-tertiary">
                    {g.retailer.name} · {g.currentPrice ? formatPrice(g.currentPrice) : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-amber-700">
                  <Clock className="h-3 w-3" />
                  {g.ghostUntil && relativeAgo(g.ghostUntil).replace('önce', 'sonra süresi dolar')}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-text-tertiary" />
        <FilterChip label="Hepsi" active={buttonFilter === null} onClick={() => setButtonFilter(null)} />
        {(Object.keys(buttonMeta) as ButtonCode[]).map(code => (
          <FilterChip
            key={code}
            label={buttonMeta[code].label}
            active={buttonFilter === code}
            onClick={() => setButtonFilter(code)}
          />
        ))}
      </div>

      {/* Event feed */}
      <Card className="overflow-hidden p-0">
        {feedQ.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : feedQ.error ? (
          <div className="p-4"><ErrorState onRetry={() => feedQ.refetch()} /></div>
        ) : !feedQ.data?.events.length ? (
          <div className="p-4"><EmptyState title="Henüz oy yok" description="Telegram'da fırsatlara oy verildiğinde burada görünür." /></div>
        ) : (
          <div className="divide-y divide-border">
            {feedQ.data.events.map(ev => {
              const meta = buttonMeta[ev.button];
              const Icon = meta.icon;
              return (
                <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-secondary/30">
                  <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                    meta.variant === 'success' ? 'bg-emerald-50 text-emerald-600'
                    : meta.variant === 'danger' ? 'bg-rose-50 text-rose-600'
                    : meta.variant === 'warning' ? 'bg-amber-50 text-amber-600'
                    : 'bg-indigo-50 text-indigo-600',
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                      {ev.isGhosted && (
                        <Badge variant="warning" size="sm">
                          <Ghost className="h-3 w-3" /> Ghost
                        </Badge>
                      )}
                      <span className="text-[11px] text-text-tertiary">
                        {relativeAgo(ev.createdAt)} · @{ev.chatId}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[13px] font-medium text-text-primary">
                      {ev.variantLabel ?? '—'}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-text-tertiary">
                      <span>{ev.retailerName ?? ev.retailerSlug ?? '—'}</span>
                      {ev.currentPrice && (
                        <>
                          <span>·</span>
                          <span className="tabular-nums">{formatPrice(ev.currentPrice)}</span>
                        </>
                      )}
                      {ev.productUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={ev.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            ürüne git <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
        <span>
          {feedQ.data ? `${feedQ.data.count} olay gösteriliyor` : 'Yükleniyor...'}
        </span>
        <Link href="/command-center" className="text-primary hover:underline">
          ← Komuta Merkezi
        </Link>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary-light text-primary'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary',
      )}
    >
      {label}
    </button>
  );
}
