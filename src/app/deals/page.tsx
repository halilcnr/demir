'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { TrendingDown, Award } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge, PriceChangeBadge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice } from '@/lib/utils';

interface DealsData {
  biggestDrops: {
    productId: string;
    productModel: string;
    storage: string;
    retailerName: string;
    currentPrice: number;
    previousPrice: number | null;
    changePercent: number | null;
    url: string;
    recordedAt: string;
  }[];
  cheapest: {
    productId: string;
    productModel: string;
    storage: string;
    retailerName: string;
    currentPrice: number;
    lowestPrice: number | null;
    url: string;
  }[];
}

export default function DealsPage() {
  const { data, isLoading, error, refetch } = useQuery<DealsData>({
    queryKey: ['deals'],
    queryFn: () => fetch('/api/deals').then((r) => r.json()),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return <EmptyState />;

  return (
    <div className="space-y-6">
      {/* Biggest Drops */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-5 w-5 text-green-600" />
          <h2 className="text-base font-semibold text-gray-900">
            Bugün En Çok Düşen Fiyatlar
          </h2>
        </div>

        {data.biggestDrops.length === 0 ? (
          <EmptyState description="Son 24 saatte önemli bir fiyat düşüşü yok" />
        ) : (
          <div className="space-y-3">
            {data.biggestDrops.map((drop, i) => (
              <Link
                key={i}
                href={`/products/${drop.productId}`}
                className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50/30 p-4 hover:bg-green-50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {drop.productModel} {drop.storage}
                  </p>
                  <p className="text-sm text-gray-500">{drop.retailerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-700">
                    {formatPrice(drop.currentPrice)}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    {drop.previousPrice && (
                      <span className="text-xs text-gray-400 line-through">
                        {formatPrice(drop.previousPrice)}
                      </span>
                    )}
                    {drop.changePercent != null && (
                      <PriceChangeBadge changePercent={drop.changePercent} />
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Cheapest */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">
            En Uygun Fiyatlar
          </h2>
        </div>

        {data.cheapest.length === 0 ? (
          <EmptyState description="Fiyat verisi bulunamadı" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.cheapest.map((item, i) => (
              <Link
                key={i}
                href={`/products/${item.productId}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {item.productModel} {item.storage}
                  </p>
                  <p className="text-sm text-gray-500">{item.retailerName}</p>
                  {item.lowestPrice && item.currentPrice <= item.lowestPrice && (
                    <Badge variant="success" className="mt-1">Tarihi En Düşük</Badge>
                  )}
                </div>
                <p className="text-lg font-bold text-blue-600">
                  {formatPrice(item.currentPrice)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
