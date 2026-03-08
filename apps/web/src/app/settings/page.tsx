'use client';

import { useState } from 'react';
import { Settings as SettingsIcon, Info, Link, Plus, Loader2, Database, Layers } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ListingUrl {
  id: string;
  productUrl: string;
  currentPrice: number | null;
  lastSeenAt: string | null;
  variant: { slug: string; normalizedName: string };
  retailer: { slug: string; name: string };
}

function UrlManager() {
  const queryClient = useQueryClient();
  const [variantSlug, setVariantSlug] = useState('');
  const [retailerSlug, setRetailerSlug] = useState('hepsiburada');
  const [productUrl, setProductUrl] = useState('');

  const { data: urls, isLoading } = useQuery<ListingUrl[]>({
    queryKey: ['listing-urls'],
    queryFn: () => fetch('/api/listings/urls').then(r => r.json()),
  });

  const addUrl = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/listings/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantSlug, retailerSlug, productUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Hata oluştu');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-urls'] });
      setVariantSlug('');
      setProductUrl('');
    },
  });

  const realUrls = (urls ?? []).filter(u =>
    u.productUrl &&
    !u.productUrl.includes('/search?q=') &&
    !u.productUrl.includes('/ara?q=') &&
    !u.productUrl.includes('/arama?q=') &&
    !u.productUrl.includes('/s?k=') &&
    !u.productUrl.includes('/sr?q=')
  );

  return (
    <Card>
      <div className="relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 to-purple-500" />
        <div className="flex items-center gap-3 mb-2 pt-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Link className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Ürün URL Yönetimi
            </h2>
            <p className="text-[11px] text-text-tertiary">
              Doğrudan sayfa URL&apos;si ile daha doğru fiyat takibi
            </p>
          </div>
        </div>

        {/* Add URL Form */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 mb-4 p-3 bg-surface-secondary rounded-lg border border-border-light mt-3">
          <input
            type="text"
            value={variantSlug}
            onChange={e => setVariantSlug(e.target.value)}
            placeholder="Varyant slug (ör: iphone-16-pro-max-256gb-natural-titanium)"
            className="col-span-1 sm:col-span-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-colors"
          />
          <select
            value={retailerSlug}
            onChange={e => setRetailerSlug(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-colors"
          >
            <option value="hepsiburada">Hepsiburada</option>
            <option value="trendyol">Trendyol</option>
            <option value="n11">N11</option>
            <option value="amazon">Amazon</option>
          </select>
          <div />
          <input
            type="url"
            value={productUrl}
            onChange={e => setProductUrl(e.target.value)}
            placeholder="https://www.hepsiburada.com/apple-iphone-..."
            className="col-span-1 sm:col-span-3 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-colors"
          />
          <button
            onClick={() => addUrl.mutate()}
            disabled={addUrl.isPending || !variantSlug || !productUrl}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-white hover:bg-primary-hover shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
          >
            {addUrl.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ekle
          </button>
        </div>
        {addUrl.isError && (
          <p className="text-[13px] text-rose-600 mb-3">{(addUrl.error as Error).message}</p>
        )}

        {/* Existing URLs */}
        {isLoading ? (
          <p className="text-[13px] text-text-tertiary">Yükleniyor...</p>
        ) : realUrls.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Henüz manuel URL eklenmemiş.</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="min-w-full">
              <thead>
                <tr className="border-y border-border-light bg-surface-secondary">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Varyant</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Mağaza</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Fiyat</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {realUrls.map(u => (
                  <tr key={u.id} className="group hover:bg-surface-secondary transition-colors">
                    <td className="px-5 py-3 text-[13px] text-text-primary">{u.variant.normalizedName}</td>
                    <td className="px-5 py-3">
                      <Badge variant="default" size="sm">{u.retailer.name}</Badge>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-text-secondary tabular-nums">
                      {u.currentPrice ? `₺${u.currentPrice.toLocaleString('tr-TR')}` : '—'}
                    </td>
                    <td className="px-5 py-3 max-w-xs truncate">
                      <a href={u.productUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">
                        {u.productUrl}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-float-in">
      <h1 className="text-lg font-semibold tracking-tight text-text-primary">Ayarlar</h1>

      {/* URL Manager */}
      <UrlManager />

      {/* Architecture Info */}
      <Card>
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-sky-500" />
          <div className="flex items-center gap-3 mb-4 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
              <Info className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">
              Sistem Mimarisi
            </h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3 rounded-lg border border-border-light p-3 hover:border-border transition-colors">
              <Badge variant="info" size="sm">Web</Badge>
              <div>
                <p className="text-[13px] font-medium text-text-primary">Frontend &amp; API — Vercel</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Next.js 15 App Router, React 19, TanStack Query ile dashboard ve API rotaları.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border-light p-3 hover:border-border transition-colors">
              <Badge variant="warning" size="sm">Worker</Badge>
              <div>
                <p className="text-[13px] font-medium text-text-primary">Scraping Servisi — Railway</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Periyodik olarak e-ticaret sitelerinden fiyat çeken TypeScript worker.
                  Varsayılan senkronizasyon aralığı: 6 saat.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border-light p-3 hover:border-border transition-colors">
              <Badge variant="success" size="sm">DB</Badge>
              <div>
                <p className="text-[13px] font-medium text-text-primary">PostgreSQL — Neon</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Prisma ORM ile yönetilen serverless PostgreSQL. Paylaşımlı schema.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Environment Variables */}
      <Card>
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-slate-400 to-slate-500" />
          <div className="flex items-center gap-3 mb-4 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-tertiary text-text-secondary">
              <SettingsIcon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">
              Ortam Değişkenleri
            </h2>
          </div>
          <div className="overflow-x-auto -mx-5">
            <table className="min-w-full">
              <thead>
                <tr className="border-y border-border-light bg-surface-secondary">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Değişken
                  </th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Açıklama
                  </th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Servis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  ['DATABASE_URL', 'Neon PostgreSQL bağlantı dizesi (pooled)', 'Web, Worker'],
                  ['DIRECT_URL', 'Neon PostgreSQL doğrudan bağlantı (migration)', 'Web, Worker'],
                  ['SYNC_INTERVAL_MS', 'Senkronizasyon aralığı (ms, varsayılan: 21600000)', 'Worker'],
                  ['USE_MOCK_PROVIDERS', '"true" ise mock veri üretir', 'Worker'],
                  ['NEXT_PUBLIC_APP_URL', 'Uygulamanın public URL\'si', 'Web'],
                ].map(([name, desc, svc]) => (
                  <tr key={name} className="group hover:bg-surface-secondary transition-colors">
                    <td className="px-5 py-3">
                      <code className="rounded-md bg-surface-tertiary px-1.5 py-0.5 text-[11px] font-mono text-text-primary">
                        {name}
                      </code>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-text-secondary">{desc}</td>
                    <td className="px-5 py-3">
                      <Badge variant="default" size="sm">{svc}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Data Model Info */}
      <Card>
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center gap-3 mb-4 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Database className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">
              Veri Modeli
            </h2>
          </div>
          <div className="space-y-2">
            {[
              ['ProductFamily', 'iPhone modeli (ör. iPhone 15 Pro Max)'],
              ['ProductVariant', 'Renk + depolama kombinasyonu (ör. 256GB Natural Titanium)'],
              ['Listing', 'Bir mağazadaki bir varyantın kaydı (fiyat, stok, fırsat skoru)'],
              ['PriceSnapshot', 'Her senkronizasyonda alınan fiyat kaydı (tarihçe)'],
              ['AlertRule', 'Kullanıcının tanımladığı alarm kuralı'],
              ['AlertEvent', 'Kural tetiklendiğinde oluşan bildirim'],
            ].map(([name, desc]) => (
              <div key={name} className="flex items-start gap-3 rounded-lg border border-border-light p-3 hover:border-border transition-colors">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-50 shrink-0">
                  <Layers className="h-3 w-3 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{name}</p>
                  <p className="text-[11px] text-text-tertiary">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
