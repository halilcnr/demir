'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-base font-semibold text-gray-900">Ayarlar</h2>

      {/* General */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Genel Ayarlar</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Uygulama Adı
            </label>
            <input
              type="text"
              defaultValue="iPhone Price Tracker"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senkronizasyon Sıklığı
            </label>
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option>Her 6 saatte bir</option>
              <option>Her 12 saatte bir</option>
              <option>Günde bir</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Bildirim Kanalları</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div>
              <p className="font-medium text-gray-900 text-sm">Uygulama İçi</p>
              <p className="text-xs text-gray-500">Dashboard üzerinde bildirim</p>
            </div>
            <Badge variant="success">Aktif</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div>
              <p className="font-medium text-gray-900 text-sm">Telegram</p>
              <p className="text-xs text-gray-500">Bot üzerinden anlık mesaj</p>
            </div>
            <Badge>Yakında</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div>
              <p className="font-medium text-gray-900 text-sm">E-posta</p>
              <p className="text-xs text-gray-500">Mail ile bildirim</p>
            </div>
            <Badge>Yakında</Badge>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Hakkında</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>iPhone Price Tracker v1.0</p>
          <p>Next.js 15 • Prisma • PostgreSQL • Recharts</p>
          <p>Vercel üzerinde deploy edilmektedir.</p>
        </div>
      </Card>
    </div>
  );
}
