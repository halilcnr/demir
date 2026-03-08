'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice, formatRelativeDate } from '@/lib/utils';

interface AlertRuleItem {
  id: string;
  productId: string;
  productModel: string;
  storage: string;
  type: string;
  threshold: number | null;
  isActive: boolean;
  lastTriggered: string | null;
  createdAt: string;
  recentEvents: {
    id: string;
    message: string;
    oldPrice: number | null;
    newPrice: number | null;
    isRead: boolean;
    createdAt: string;
  }[];
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  PRICE_DROP_PERCENT: 'Yüzdesel Düşüş',
  PRICE_BELOW: 'Hedef Fiyat Altı',
  NEW_LOWEST: 'Yeni En Düşük',
};

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<AlertRuleItem[]>({
    queryKey: ['alerts'],
    queryFn: () => fetch('/api/alerts').then((r) => r.json()),
  });

  const toggleAlert = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const deleteAlert = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">
            Fiyat Alarmları
          </h2>
        </div>
        <Badge>{data?.length ?? 0} alarm</Badge>
      </div>

      {!data || data.length === 0 ? (
        <EmptyState
          title="Alarm bulunamadı"
          description="Ürün detay sayfasından fiyat alarmı ekleyebilirsiniz"
        />
      ) : (
        <div className="space-y-4">
          {data.map((rule) => (
            <Card key={rule.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {rule.productModel} {rule.storage}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={rule.isActive ? 'success' : 'default'}>
                      {rule.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                    <Badge variant="info">
                      {ALERT_TYPE_LABELS[rule.type] ?? rule.type}
                    </Badge>
                    {rule.threshold && (
                      <span className="text-xs text-gray-500">
                        Eşik: {rule.type === 'PRICE_BELOW'
                          ? formatPrice(rule.threshold)
                          : `%${rule.threshold}`}
                      </span>
                    )}
                  </div>
                  {rule.lastTriggered && (
                    <p className="mt-1 text-xs text-gray-400">
                      Son tetiklenme: {formatRelativeDate(rule.lastTriggered)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      toggleAlert.mutate({ id: rule.id, isActive: !rule.isActive })
                    }
                  >
                    {rule.isActive ? (
                      <ToggleRight className="h-5 w-5 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteAlert.mutate(rule.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>

              {/* Recent events */}
              {rule.recentEvents.length > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Son Olaylar</p>
                  <div className="space-y-2">
                    {rule.recentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700"
                      >
                        <p>{event.message}</p>
                        <p className="mt-0.5 text-gray-400">
                          {formatRelativeDate(event.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
