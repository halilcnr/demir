'use client';

import { useState } from 'react';
import { Settings as SettingsIcon, Info, Link, Plus, Loader2 } from 'lucide-react';
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
      <div className="flex items-center gap-2 mb-3">
        <Link className="h-5 w-5 text-purple-500" />
        <h2 className="text-base font-semibold text-gray-900">
          Ürün URL Yönetimi
        </h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        URL&apos;si girilen ürünler doğrudan sayfadan fiyat çekilir (daha doğru).
        URL&apos;si olmayanlar arama sistemiyle bulunur.
      </p>

      {/* Add URL Form */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <input
          type="text"
          value={variantSlug}
          onChange={e => setVariantSlug(e.target.value)}
          placeholder="Varyant slug (ör: iphone-16-pro-max-256gb-natural-titanium)"
          className="col-span-1 sm:col-span-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={retailerSlug}
          onChange={e => setRetailerSlug(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
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
          className="col-span-1 sm:col-span-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={() => addUrl.mutate()}
          disabled={addUrl.isPending || !variantSlug || !productUrl}
          className="flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {addUrl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ekle
        </button>
      </div>
      {addUrl.isError && (
        <p className="text-sm text-red-600 mb-3">{(addUrl.error as Error).message}</p>
      )}

      {/* Existing URLs */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Yükleniyor...</p>
      ) : realUrls.length === 0 ? (
        <p className="text-sm text-gray-400">Henüz manuel URL eklenmemiş.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-3 text-left font-medium text-gray-600">Varyant</th>
                <th className="py-2 pr-3 text-left font-medium text-gray-600">Mağaza</th>
                <th className="py-2 pr-3 text-left font-medium text-gray-600">Fiyat</th>
                <th className="py-2 text-left font-medium text-gray-600">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {realUrls.map(u => (
                <tr key={u.id}>
                  <td className="py-2 pr-3 text-gray-800">{u.variant.normalizedName}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="default">{u.retailer.name}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">
                    {u.currentPrice ? `₺${u.currentPrice.toLocaleString('tr-TR')}` : '—'}
                  </td>
                  <td className="py-2 max-w-xs truncate">
                    <a href={u.productUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                      {u.productUrl}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Ayarlar</h1>

      {/* URL Manager */}
      <UrlManager />

      {/* Architecture Info */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-5 w-5 text-blue-500" />
          <h2 className="text-base font-semibold text-gray-900">
            Sistem Mimarisi
          </h2>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
            <Badge variant="info">Web</Badge>
            <div>
              <p className="font-medium">Frontend &amp; API — Vercel</p>
              <p className="text-gray-500">
                Next.js 15 App Router, React 19, TanStack Query ile dashboard ve API rotaları.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
            <Badge variant="warning">Worker</Badge>
            <div>
              <p className="font-medium">Scraping Servisi — Railway</p>
              <p className="text-gray-500">
                Periyodik olarak e-ticaret sitelerinden fiyat çeken TypeScript worker.
                Varsayılan senkronizasyon aralığı: 6 saat.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
            <Badge variant="success">Veritabanı</Badge>
            <div>
              <p className="font-medium">PostgreSQL — Neon</p>
              <p className="text-gray-500">
                Prisma ORM ile yönetilen serverless PostgreSQL. Paylaşımlı schema.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Environment Variables */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <SettingsIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">
            Ortam Değişkenleri
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 text-left font-medium text-gray-600">
                  Değişken
                </th>
                <th className="py-2 pr-4 text-left font-medium text-gray-600">
                  Açıklama
                </th>
                <th className="py-2 text-left font-medium text-gray-600">
                  Servis
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['DATABASE_URL', 'Neon PostgreSQL bağlantı dizesi (pooled)', 'Web, Worker'],
                ['DIRECT_URL', 'Neon PostgreSQL doğrudan bağlantı (migration)', 'Web, Worker'],
                ['SYNC_INTERVAL_MS', 'Senkronizasyon aralığı (ms, varsayılan: 21600000)', 'Worker'],
                ['USE_MOCK_PROVIDERS', '"true" ise mock veri üretir', 'Worker'],
                ['NEXT_PUBLIC_APP_URL', 'Uygulamanın public URL\'si', 'Web'],
              ].map(([name, desc, svc]) => (
                <tr key={name}>
                  <td className="py-2 pr-4">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-800">
                      {name}
                    </code>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{desc}</td>
                  <td className="py-2">
                    <Badge variant="default">{svc}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Data Model Info */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Veri Modeli
        </h2>
        <div className="text-sm text-gray-700 space-y-1">
          <p>
            <strong>ProductFamily</strong> → iPhone modeli (ör. iPhone 15 Pro Max)
          </p>
          <p>
            <strong>ProductVariant</strong> → Renk + depolama kombinasyonu (ör. 256GB Natural Titanium)
          </p>
          <p>
            <strong>Listing</strong> → Bir mağazadaki bir varyantın kaydı (fiyat, stok, fırsat skoru)
          </p>
          <p>
            <strong>PriceSnapshot</strong> → Her senkronizasyonda alınan fiyat kaydı (tarihçe)
          </p>
          <p>
            <strong>AlertRule</strong> → Kullanıcının tanımladığı alarm kuralı
          </p>
          <p>
            <strong>AlertEvent</strong> → Kural tetiklendiğinde oluşan bildirim
          </p>
        </div>
      </Card>
    </div>
  );
}
