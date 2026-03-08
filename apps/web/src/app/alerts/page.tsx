'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice, formatRelativeDate } from '@repo/shared';
import type { AlertRuleInput } from '@repo/shared';

interface AlertRule {
  id: string;
  type: string;
  threshold: number | null;
  isActive: boolean;
  createdAt: string;
  variant?: { id: string; normalizedName: string } | null;
  family?: { id: string; name: string } | null;
  retailer?: { name: string; slug: string } | null;
  _count: { events: number };
  events: {
    id: string;
    alertType: string;
    triggerReason: string;
    oldPrice: number | null;
    newPrice: number | null;
    isRead: boolean;
    triggeredAt: string;
  }[];
}

const TYPE_LABELS: Record<string, string> = {
  PRICE_DROP_PERCENT: 'Yüzde Düşüş',
  PRICE_BELOW: 'Fiyat Altında',
  NEW_LOWEST: 'Yeni En Düşük',
  CROSS_RETAILER: 'Mağazalar Arası',
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AlertRuleInput>({
    type: 'PRICE_DROP_PERCENT',
    threshold: 10,
  });

  const { data: rules, isLoading, error, refetch } = useQuery<AlertRule[]>({
    queryKey: ['alerts'],
    queryFn: () => fetch('/api/alerts').then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (input: AlertRuleInput) =>
      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setShowForm(false);
      setForm({ type: 'PRICE_DROP_PERCENT', threshold: 10 });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  if (isLoading) return <CardSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-float-in">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Alarmlar</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Yeni Alarm
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card>
          <div className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary to-violet-500" />
            <h2 className="mb-3 text-sm font-semibold text-text-primary pt-2">
              Yeni Alarm Kuralı
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                  Tür
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as AlertRuleInput['type'] }))
                  }
                  className="w-full rounded-lg border border-border bg-surface py-2 px-3 text-[13px] text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                  Eşik Değeri
                </label>
                <input
                  type="number"
                  value={form.threshold ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      threshold: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  placeholder={
                    form.type === 'PRICE_DROP_PERCENT' ? '% 10' : '₺ 30000'
                  }
                  className="w-full rounded-lg border border-border bg-surface py-2 px-3 text-[13px] text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                  Varyant ID (opsiyonel)
                </label>
                <input
                  type="text"
                  value={form.variantId ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variantId: e.target.value || undefined,
                    }))
                  }
                  placeholder="Tüm varyantlar"
                  className="w-full rounded-lg border border-border bg-surface py-2 px-3 text-[13px] text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                Oluştur
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                İptal
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Rules List */}
      {!rules || rules.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-10 w-10 text-text-tertiary" />}
          title="Henüz alarm yok"
          description="Fiyat düştüğünde bildirim almak için alarm kurabilirsiniz."
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={rule.isActive ? 'success' : 'default'}
                      size="sm"
                      dot
                    >
                      {rule.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                    <Badge variant="info" size="sm">
                      {TYPE_LABELS[rule.type] ?? rule.type}
                    </Badge>
                    {rule.threshold != null && (
                      <span className="text-[13px] font-medium text-text-secondary tabular-nums">
                        {rule.type === 'PRICE_DROP_PERCENT'
                          ? `%${rule.threshold}`
                          : rule.type === 'PRICE_BELOW'
                            ? formatPrice(rule.threshold)
                            : rule.threshold}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[13px] text-text-secondary">
                    {rule.variant
                      ? rule.variant.normalizedName
                      : rule.family
                        ? rule.family.name
                        : 'Tüm varyantlar'}
                    {rule.retailer && ` · ${rule.retailer.name}`}
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    Oluşturulma: {formatRelativeDate(rule.createdAt)} · {rule._count.events} bildirim
                  </p>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() =>
                      toggleMutation.mutate({
                        id: rule.id,
                        isActive: !rule.isActive,
                      })
                    }
                    className="p-1.5 text-text-tertiary hover:text-primary rounded-lg hover:bg-surface-secondary transition-colors"
                    title={rule.isActive ? 'Devre dışı bırak' : 'Etkinleştir'}
                  >
                    {rule.isActive ? (
                      <ToggleRight className="h-4 w-4" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Bu alarmı silmek istediğinize emin misiniz?'))
                        deleteMutation.mutate(rule.id);
                    }}
                    className="p-1.5 text-text-tertiary hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Recent events */}
              {rule.events.length > 0 && (
                <div className="mt-3 border-t border-border-light pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                    Son Bildirimler
                  </p>
                  <div className="space-y-1.5">
                    {rule.events.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between text-[13px]"
                      >
                        <span className="text-text-secondary">{ev.triggerReason}</span>
                        <div className="flex items-center gap-2">
                          {ev.oldPrice != null && ev.newPrice != null && (
                            <span className="text-[11px] text-text-tertiary tabular-nums">
                              {formatPrice(ev.oldPrice)} → {formatPrice(ev.newPrice)}
                            </span>
                          )}
                          <span className="text-[11px] text-text-tertiary">
                            {formatRelativeDate(ev.triggeredAt)}
                          </span>
                          {!ev.isRead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
                          )}
                        </div>
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
