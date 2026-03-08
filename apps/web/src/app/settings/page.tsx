'use client';

import { Settings as SettingsIcon, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Ayarlar</h1>

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
