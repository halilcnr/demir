'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Bell,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';

import { Card, StatCard } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { PriceHistoryChart } from '@/components/charts/price-history-chart';
import { RetailerComparisonChart } from '@/components/charts/retailer-comparison-chart';
import { formatPrice, formatDate, getRetailerColor } from '@/lib/utils';
import type { ProductDetail } from '@/types';

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [historyDays, setHistoryDays] = useState(30);
  const [alertType, setAlertType] = useState<string>('PRICE_DROP_PERCENT');
  const [alertThreshold, setAlertThreshold] = useState<string>('5');
  const [showAlertForm, setShowAlertForm] = useState(false);

  const { data: product, isLoading, error, refetch } = useQuery<ProductDetail>({
    queryKey: ['product', id],
    queryFn: () => fetch(`/api/products/${id}`).then((r) => r.json()),
  });

  const { data: history } = useQuery({
    queryKey: ['product-history', id, historyDays],
    queryFn: () =>
      fetch(`/api/products/${id}/history?days=${historyDays}`).then((r) => r.json()),
    enabled: !!product,
  });

  const createAlert = useMutation({
    mutationFn: (data: { productId: string; type: string; threshold?: number }) =>
      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      setShowAlertForm(false);
      refetch();
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!product) return <ErrorState title="Ürün bulunamadı" />;

  const sortedListings = [...product.listings].sort(
    (a, b) => (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity)
  );
  const cheapestRetailer = sortedListings[0];

  return (
    <div className="space-y-6">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {product.model} {product.storage}
          </h1>
          {product.color && (
            <Badge variant="info" className="mt-1">{product.color}</Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="En Düşük Fiyat"
          value={product.minPrice ? formatPrice(product.minPrice) : '—'}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <StatCard
          title="En Yüksek Fiyat"
          value={product.maxPrice ? formatPrice(product.maxPrice) : '—'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="Ortalama Fiyat"
          value={product.avgPrice ? formatPrice(product.avgPrice) : '—'}
          icon={<Minus className="h-5 w-5" />}
        />
        <StatCard
          title="Mağaza Sayısı"
          value={product.listings.length}
          subtitle={cheapestRetailer ? `En ucuz: ${cheapestRetailer.retailerName}` : undefined}
        />
      </div>

      {/* Retailer Comparison Table */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Mağaza Fiyat Karşılaştırması
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Mağaza</th>
                <th className="px-4 py-3 font-medium text-gray-500">Fiyat</th>
                <th className="px-4 py-3 font-medium text-gray-500">En Düşük</th>
                <th className="px-4 py-3 font-medium text-gray-500">En Yüksek</th>
                <th className="px-4 py-3 font-medium text-gray-500">Durum</th>
                <th className="px-4 py-3 font-medium text-gray-500">Son Güncelleme</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedListings.map((listing, i) => (
                <tr
                  key={listing.id}
                  className={`border-b border-gray-100 ${i === 0 ? 'bg-green-50/50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: getRetailerColor(listing.retailerSlug) }}
                      />
                      <span className="font-medium">{listing.retailerName}</span>
                      {i === 0 && <Badge variant="success">En Ucuz</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900">
                    {listing.currentPrice ? formatPrice(listing.currentPrice) : '—'}
                  </td>
                  <td className="px-4 py-3 text-green-600">
                    {listing.lowestPrice ? formatPrice(listing.lowestPrice) : '—'}
                  </td>
                  <td className="px-4 py-3 text-red-600">
                    {listing.highestPrice ? formatPrice(listing.highestPrice) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={listing.inStock ? 'success' : 'danger'}>
                      {listing.inStock ? 'Stokta' : 'Tükendi'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {listing.lastSyncedAt ? formatDate(listing.lastSyncedAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={listing.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Price History Chart */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Fiyat Geçmişi
            </h2>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setHistoryDays(d)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    historyDays === d
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {d} gün
                </button>
              ))}
            </div>
          </div>
          {history?.flatHistory ? (
            <PriceHistoryChart data={history.flatHistory} />
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
              Fiyat geçmişi yükleniyor...
            </div>
          )}
        </Card>

        {/* Retailer Comparison Bar Chart */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Mağaza Karşılaştırması
          </h2>
          <RetailerComparisonChart
            data={sortedListings.map((l) => ({
              retailer: l.retailerName,
              price: l.currentPrice ?? 0,
              color: getRetailerColor(l.retailerSlug),
            }))}
          />
        </Card>
      </div>

      {/* Alert Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Fiyat Alarmı
          </h2>
          <Button
            variant="outline"
            size="sm"
            icon={<Bell className="h-4 w-4" />}
            onClick={() => setShowAlertForm(!showAlertForm)}
          >
            Alarm Ekle
          </Button>
        </div>

        {showAlertForm && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Alarm Tipi
                </label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="PRICE_DROP_PERCENT">Yüzdesel Düşüş</option>
                  <option value="PRICE_BELOW">Hedef Fiyat Altı</option>
                  <option value="NEW_LOWEST">Yeni En Düşük</option>
                </select>
              </div>

              {alertType !== 'NEW_LOWEST' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {alertType === 'PRICE_DROP_PERCENT' ? 'Yüzde (%)' : 'Hedef Fiyat (₺)'}
                  </label>
                  <input
                    type="number"
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-32"
                    min={alertType === 'PRICE_DROP_PERCENT' ? 1 : 1000}
                  />
                </div>
              )}

              <Button
                size="sm"
                loading={createAlert.isPending}
                onClick={() =>
                  createAlert.mutate({
                    productId: product.id,
                    type: alertType,
                    threshold: alertType !== 'NEW_LOWEST' ? parseFloat(alertThreshold) : undefined,
                  })
                }
              >
                Oluştur
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
