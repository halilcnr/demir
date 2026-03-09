'use client';

import { useState, Fragment } from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Users,
  MessageSquare,
  Activity,
  ChevronDown,
  Copy,
  ExternalLink,
  Search,
  X,
  Bot,
  Wifi,
  WifiOff,
  Settings,
  Save,
} from 'lucide-react';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatPrice, formatRelativeDate, cn } from '@repo/shared';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────

interface TelegramStatus {
  enabled: boolean;
  workerReachable: boolean;
  subscriberCount: number;
  totalSent: number;
  totalFailed: number;
  totalSkipped: number;
  lastSentAt: string | null;
  lastFailedAt: string | null;
  runtime: {
    sentCount: number;
    failCount: number;
    skippedCount: number;
    subscriberCount: number;
    enabled: boolean;
    activeSubscribers: number;
    totalSubscribers: number;
  } | null;
}

interface NotificationLog {
  id: string;
  messageType: 'PRICE_DROP' | 'ALL_TIME_LOW' | 'TEST_MESSAGE';
  status: 'SENT' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  productName: string | null;
  retailer: string | null;
  oldPrice: number | null;
  newPrice: number | null;
  dropPercent: number | null;
  messageText: string | null;
  sentTo: number;
  failedTo: number;
  errorMessage: string | null;
  listingId: string | null;
  createdAt: string;
}

interface Subscriber {
  id: string;
  username: string | null;
  firstName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DailyStats {
  date: string;
  sent: number;
  failed: number;
}

interface NotifySettings {
  notifyDropPercent: number;
  notifyDropAmount: number;
  notifyCooldownMinutes: number;
  notifyAllTimeLow: boolean;
  notifyEnabled: boolean;
  notifyMinPrice: number | null;
  notifyMaxPrice: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function MutationFeedback({ data }: { data: { ok: boolean; sent?: number; error?: string } | undefined }) {
  if (!data) return null;
  return (
    <div className={cn(
      'mt-2 rounded-lg border p-2 text-xs',
      data.ok
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'
    )}>
      {data.ok ? `✓ ${data.sent ?? ''} aboneye gönderildi` : `✗ Hata: ${data.error}`}
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────

export default function TelegramSettingsPage() {
  const queryClient = useQueryClient();
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null);
  const [period, setPeriod] = useState('7d');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [customText, setCustomText] = useState('');
  const [listingSearch, setListingSearch] = useState('');
  const [selectedListingId, setSelectedListingId] = useState('');

  // ── Data Queries ──
  const { data: status, isLoading: statusLoading } = useQuery<TelegramStatus>({
    queryKey: ['telegram-status'],
    queryFn: () => fetch('/api/telegram/status').then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ logs: NotificationLog[]; total: number }>({
    queryKey: ['telegram-history', period, searchTerm, typeFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50', period });
      if (searchTerm) params.set('search', searchTerm);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      return fetch(`/api/telegram/history?${params}`).then(r => r.json());
    },
  });

  const { data: subscriberData } = useQuery<{ subscribers: Subscriber[]; activeCount: number; totalCount: number }>({
    queryKey: ['telegram-subscribers'],
    queryFn: () => fetch('/api/telegram/subscribers').then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: dailyStats } = useQuery<DailyStats[]>({
    queryKey: ['telegram-daily-stats'],
    queryFn: () => fetch('/api/telegram/stats').then(r => r.json()),
  });

  const { data: notifySettings, isLoading: settingsLoading } = useQuery<NotifySettings>({
    queryKey: ['telegram-settings'],
    queryFn: () => fetch('/api/telegram/settings').then(r => r.json()),
  });

  // Local form state for settings
  const [settingsForm, setSettingsForm] = useState<NotifySettings | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Sync form state when settings load
  const effectiveSettings = settingsForm ?? notifySettings ?? null;

  const updateSettingsField = (field: keyof NotifySettings, value: unknown) => {
    setSettingsSaved(false);
    setSettingsForm(prev => ({
      ...(prev ?? notifySettings ?? {
        notifyDropPercent: 1,
        notifyDropAmount: 100,
        notifyCooldownMinutes: 240,
        notifyAllTimeLow: true,
        notifyEnabled: true,
        notifyMinPrice: null,
        notifyMaxPrice: null,
      }),
      [field]: value,
    }));
  };

  const saveSettingsMutation = useMutation({
    mutationFn: (data: Partial<NotifySettings>) =>
      fetch('/api/telegram/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['telegram-settings'] });
      setSettingsForm(data);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    },
  });

  // ── Mutations ──
  const testMutation = useMutation({
    mutationFn: () => fetch('/api/telegram/test', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
      queryClient.invalidateQueries({ queryKey: ['telegram-history'] });
    },
  });

  const customMsgMutation = useMutation({
    mutationFn: (text: string) =>
      fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
      queryClient.invalidateQueries({ queryKey: ['telegram-history'] });
      setCustomText('');
    },
  });

  const listingMutation = useMutation({
    mutationFn: (listingId: string) =>
      fetch('/api/telegram/send-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
      queryClient.invalidateQueries({ queryKey: ['telegram-history'] });
    },
  });

  interface ListingOption {
    id: string;
    label: string;
    retailer: string;
    currentPrice: number | null;
    previousPrice: number | null;
    lowestPrice: number | null;
  }

  const { data: listingOptions } = useQuery<ListingOption[]>({
    queryKey: ['telegram-listings', listingSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (listingSearch) params.set('search', listingSearch);
      return fetch(`/api/telegram/listings?${params}`).then(r => r.json());
    },
  });

  const logs = historyData?.logs ?? [];

  return (
    <div className="space-y-8 animate-float-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Telegram Bildirimleri</h1>
            <p className="text-sm text-text-tertiary">Bot durumu, abone yönetimi ve bildirim geçmişi</p>
          </div>
        </div>
        <Badge
          variant={status?.enabled && status?.workerReachable ? 'success' : 'danger'}
          dot
          size="md"
        >
          {status?.enabled && status?.workerReachable ? 'Aktif' : status?.enabled ? 'Worker Bağlantı Yok' : 'Devre Dışı'}
        </Badge>
      </div>

      {/* ── Status Cards ── */}
      {statusLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            title="Aktif Abone"
            value={status?.subscriberCount ?? 0}
            icon={<Users className="h-4 w-4 text-sky-500" />}
            subtitle={`${subscriberData?.totalCount ?? 0} toplam`}
            accentColor="#0ea5e9"
          />
          <StatCard
            title="Gönderilen"
            value={status?.totalSent ?? 0}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            subtitle={status?.lastSentAt ? formatRelativeDate(status.lastSentAt) : 'Henüz yok'}
            accentColor="#10b981"
          />
          <StatCard
            title="Başarısız"
            value={status?.totalFailed ?? 0}
            icon={<XCircle className="h-4 w-4 text-rose-500" />}
            subtitle={status?.lastFailedAt ? formatRelativeDate(status.lastFailedAt) : 'Yok'}
            accentColor="#f43f5e"
          />
          <StatCard
            title="Atlanan"
            value={status?.totalSkipped ?? 0}
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            subtitle="Anti-spam filtreli"
            accentColor="#f59e0b"
          />
        </div>
      )}

      {/* ── Health + Test Row ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Health Panel */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Sistem Sağlığı</h2>
          </div>
          <div className="space-y-3">
            <HealthRow
              label="Telegram Bot"
              ok={!!status?.enabled}
              detail={status?.enabled ? 'Aktif' : 'Devre dışı'}
            />
            <HealthRow
              label="Worker Bağlantısı"
              ok={!!status?.workerReachable}
              detail={status?.workerReachable ? 'Bağlı' : 'Ulaşılamıyor'}
            />
            <HealthRow
              label="Aktif Aboneler"
              ok={(status?.subscriberCount ?? 0) > 0}
              detail={`${status?.subscriberCount ?? 0} abone`}
            />
            <HealthRow
              label="Son Başarılı Gönderim"
              ok={!!status?.lastSentAt}
              detail={status?.lastSentAt ? formatRelativeDate(status.lastSentAt) : 'Henüz yok'}
            />
            {status?.lastFailedAt && (
              <HealthRow
                label="Son Hata"
                ok={false}
                detail={formatRelativeDate(status.lastFailedAt)}
              />
            )}
          </div>
        </Card>

        {/* Test Panel */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Mesaj Gönder</h2>
          </div>

          {/* Quick test */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Hızlı Test</p>
            <Button
              onClick={() => testMutation.mutate()}
              loading={testMutation.isPending}
              disabled={!status?.enabled || !status?.workerReachable}
              size="sm"
              icon={<Send className="h-3 w-3" />}
            >
              Bağlantı Testi
            </Button>
            <MutationFeedback data={testMutation.data} />
          </div>

          <div className="mb-5 h-px bg-border" />

          {/* Custom message */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Özel Mesaj</p>
            <textarea
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Abonelere göndermek istediğiniz mesajı yazın..."
              rows={3}
              className="mb-2 w-full resize-none rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <Button
              onClick={() => customText.trim() && customMsgMutation.mutate(customText.trim())}
              loading={customMsgMutation.isPending}
              disabled={!status?.enabled || !status?.workerReachable || !customText.trim()}
              size="sm"
              icon={<Send className="h-3 w-3" />}
            >
              Mesajı Gönder
            </Button>
            <MutationFeedback data={customMsgMutation.data} />
          </div>

          <div className="mb-5 h-px bg-border" />

          {/* Listing price alert */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Ürün Fiyat Bildirimi</p>
            <input
              type="text"
              value={listingSearch}
              onChange={e => setListingSearch(e.target.value)}
              placeholder="Ürün veya mağaza ara..."
              className="mb-2 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {listingOptions && listingOptions.length > 0 && (
              <div className="mb-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface-secondary">
                {listingOptions.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedListingId(opt.id)}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-primary-light',
                      selectedListingId === opt.id && 'bg-primary-light'
                    )}
                  >
                    <span className="font-medium text-text-primary truncate mr-2">{opt.label}</span>
                    {opt.currentPrice && (
                      <span className="shrink-0 text-text-secondary">{formatPrice(opt.currentPrice)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <Button
              onClick={() => selectedListingId && listingMutation.mutate(selectedListingId)}
              loading={listingMutation.isPending}
              disabled={!status?.enabled || !status?.workerReachable || !selectedListingId}
              size="sm"
              icon={<Send className="h-3 w-3" />}
            >
              Fiyat Bilgisi Gönder
            </Button>
            <MutationFeedback data={listingMutation.data} />
          </div>

          {(!status?.enabled || !status?.workerReachable) && (
            <p className="mt-3 text-xs text-text-tertiary">
              {!status?.enabled ? 'Telegram disabled. Railway\'da TELEGRAM_ENABLED=true ayarlayın.' : 'Worker\'a ulaşılamıyor.'}
            </p>
          )}
        </Card>
      </div>

      {/* ── Notification Settings ── */}
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Bildirim Ayarları</h2>
          </div>
          {settingsSaved && (
            <span className="text-xs text-emerald-600 font-medium animate-float-in">✓ Kaydedildi</span>
          )}
        </div>

        {settingsLoading || !effectiveSettings ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Master switch */}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">Bildirimleri Aktifleştir</p>
                <p className="text-xs text-text-tertiary">Kapatıldığında hiçbir bildirim gönderilmez</p>
              </div>
              <button
                onClick={() => updateSettingsField('notifyEnabled', !effectiveSettings.notifyEnabled)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  effectiveSettings.notifyEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                    effectiveSettings.notifyEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            {/* Threshold settings */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Drop percent */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Minimum Düşüş Yüzdesi (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={effectiveSettings.notifyDropPercent}
                  onChange={e => updateSettingsField('notifyDropPercent', parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <p className="mt-1 text-[11px] text-text-tertiary">
                  Bu yüzdenin altındaki düşüşlerde bildirim gönderilmez
                </p>
              </div>

              {/* Drop amount */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Minimum Düşüş Tutarı (₺)
                </label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={effectiveSettings.notifyDropAmount}
                  onChange={e => updateSettingsField('notifyDropAmount', parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <p className="mt-1 text-[11px] text-text-tertiary">
                  Bu tutarın altındaki düşüşlerde bildirim gönderilmez
                </p>
              </div>

              {/* Cooldown */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Bildirim Bekleme Süresi (dk)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  step={15}
                  value={effectiveSettings.notifyCooldownMinutes}
                  onChange={e => updateSettingsField('notifyCooldownMinutes', parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <p className="mt-1 text-[11px] text-text-tertiary">
                  Aynı ürün için tekrar bildirim göndermeden önce bekleme süresi
                </p>
              </div>

              {/* All-time low toggle */}
              <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                <input
                  type="checkbox"
                  checked={effectiveSettings.notifyAllTimeLow}
                  onChange={e => updateSettingsField('notifyAllTimeLow', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">En Düşük Fiyat Bildirimi</p>
                  <p className="text-xs text-text-tertiary">
                    Tüm zamanların en düşük fiyatına ulaşıldığında ayrıca bildir
                  </p>
                </div>
              </div>
            </div>

            {/* Price range filters */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Fiyat Aralığı Filtresi</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                    Minimum Fiyat (₺)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={effectiveSettings.notifyMinPrice ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      updateSettingsField('notifyMinPrice', val === '' ? null : parseFloat(val) || 0);
                    }}
                    placeholder="Sınır yok"
                    className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary tabular-nums placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    Sadece bu fiyatın üstündeki ürünler için bildirim gönder
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                    Maksimum Fiyat (₺)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={effectiveSettings.notifyMaxPrice ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      updateSettingsField('notifyMaxPrice', val === '' ? null : parseFloat(val) || 0);
                    }}
                    placeholder="Sınır yok"
                    className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary tabular-nums placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    Sadece bu fiyatın altındaki ürünler için bildirim gönder
                  </p>
                </div>
              </div>
            </div>

            {/* Info summary */}
            <div className="rounded-lg bg-sky-50 border border-sky-100 px-4 py-3 text-xs text-sky-700">
              <p className="font-medium mb-1">Mevcut Bildirim Kuralları</p>
              <ul className="space-y-0.5 text-sky-600">
                <li>• Fiyat düşüşü en az <b>%{effectiveSettings.notifyDropPercent}</b> veya <b>{effectiveSettings.notifyDropAmount.toLocaleString('tr-TR')} ₺</b> olmalı</li>
                <li>• Aynı ürün için <b>{effectiveSettings.notifyCooldownMinutes} dakika</b> ({(effectiveSettings.notifyCooldownMinutes / 60).toFixed(1)} saat) bekleme süresi</li>
                <li>• En düşük fiyat bildirimi: <b>{effectiveSettings.notifyAllTimeLow ? 'Aktif' : 'Kapalı'}</b></li>
                {effectiveSettings.notifyMinPrice != null && (
                  <li>• Sadece <b>{effectiveSettings.notifyMinPrice.toLocaleString('tr-TR')} ₺</b> üstü ürünler</li>
                )}
                {effectiveSettings.notifyMaxPrice != null && (
                  <li>• Sadece <b>{effectiveSettings.notifyMaxPrice.toLocaleString('tr-TR')} ₺</b> altı ürünler</li>
                )}
              </ul>
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <Button
                onClick={() => effectiveSettings && saveSettingsMutation.mutate(effectiveSettings)}
                loading={saveSettingsMutation.isPending}
                size="sm"
                icon={<Save className="h-3 w-3" />}
              >
                Ayarları Kaydet
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Subscribers ── */}
      {subscriberData && subscriberData.subscribers.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-text-tertiary" />
              <h2 className="text-sm font-semibold text-text-primary">Aboneler</h2>
              <Badge variant="info" size="sm">{subscriberData.activeCount} aktif</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  <th className="pb-2 pr-4">Kullanıcı</th>
                  <th className="pb-2 pr-4">Durum</th>
                  <th className="pb-2">Kayıt Tarihi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {subscriberData.subscribers.map(sub => (
                  <tr key={sub.id} className="hover:bg-surface-secondary/50">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-text-primary">
                        {sub.firstName ?? 'Anonim'}
                      </span>
                      {sub.username && (
                        <span className="ml-1.5 text-text-tertiary">@{sub.username}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={sub.isActive ? 'success' : 'default'} dot size="sm">
                        {sub.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-text-secondary">
                      {formatRelativeDate(sub.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Daily Chart ── */}
      {dailyStats && dailyStats.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Son 7 Gün</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyStats} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d + 'T00:00:00');
                    return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  labelFormatter={(d: string) => {
                    const dt = new Date(d + 'T00:00:00');
                    return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" name="Gönderilen" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" name="Başarısız" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Notification History ── */}
      <Card>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Bildirim Geçmişi</h2>
            {historyData && <Badge variant="default" size="sm">{historyData.total} kayıt</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Ürün veya mağaza ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-8 w-48 rounded-lg border border-border bg-surface-secondary pl-8 pr-3 text-xs text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            {/* Period */}
            <FilterSelect
              value={period}
              onChange={setPeriod}
              options={[
                { value: '24h', label: 'Son 24 saat' },
                { value: '7d', label: 'Son 7 gün' },
                { value: '30d', label: 'Son 30 gün' },
                { value: 'all', label: 'Tümü' },
              ]}
            />
            {/* Type */}
            <FilterSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: '', label: 'Tüm tipler' },
                { value: 'PRICE_DROP', label: 'Fiyat Düşüşü' },
                { value: 'ALL_TIME_LOW', label: 'En Düşük' },
                { value: 'TEST_MESSAGE', label: 'Test' },
              ]}
            />
            {/* Status */}
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tüm durumlar' },
                { value: 'SENT', label: 'Gönderildi' },
                { value: 'FAILED', label: 'Başarısız' },
                { value: 'SKIPPED', label: 'Atlandı' },
              ]}
            />
          </div>
        </div>

        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-tertiary">
            Henüz bildirim kaydı yok
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  <th className="pb-2 pr-3">Zaman</th>
                  <th className="pb-2 pr-3">Tip</th>
                  <th className="pb-2 pr-3">Ürün</th>
                  <th className="pb-2 pr-3">Mağaza</th>
                  <th className="pb-2 pr-3 text-right">Eski Fiyat</th>
                  <th className="pb-2 pr-3 text-right">Yeni Fiyat</th>
                  <th className="pb-2 pr-3 text-right">Düşüş</th>
                  <th className="pb-2 pr-3">Durum</th>
                  <th className="pb-2">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {logs.map(log => (
                  <tr
                    key={log.id}
                    className="cursor-pointer hover:bg-surface-secondary/50 transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap text-text-secondary">
                      {formatRelativeDate(log.createdAt)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <MsgTypeBadge type={log.messageType} />
                    </td>
                    <td className="py-2.5 pr-3 max-w-[200px] truncate font-medium text-text-primary">
                      {log.productName ?? '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-text-secondary">
                      {log.retailer ?? '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-text-secondary tabular-nums">
                      {log.oldPrice ? formatPrice(log.oldPrice) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium text-text-primary tabular-nums">
                      {log.newPrice ? formatPrice(log.newPrice) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {log.dropPercent ? (
                        <span className="text-emerald-600 font-medium">%{log.dropPercent.toFixed(1)}</span>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="py-2.5">
                      <button className="text-xs text-primary hover:underline">Görüntüle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Message Preview Modal ── */}
      {selectedLog && (
        <MessagePreviewModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-secondary/60 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {ok ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-rose-500" />
        )}
        <span className="text-sm text-text-primary">{label}</span>
      </div>
      <span className={cn('text-xs font-medium', ok ? 'text-emerald-600' : 'text-rose-600')}>
        {detail}
      </span>
    </div>
  );
}

function MsgTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: 'info' | 'warning' | 'default' }> = {
    PRICE_DROP: { label: 'Fiyat Düşüşü', variant: 'info' },
    ALL_TIME_LOW: { label: 'En Düşük', variant: 'warning' },
    TEST_MESSAGE: { label: 'Test', variant: 'default' },
  };
  const cfg = map[type] ?? { label: type, variant: 'default' as const };
  return <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'default' }> = {
    SENT: { label: 'Gönderildi', variant: 'success' },
    PARTIAL: { label: 'Kısmi', variant: 'warning' },
    FAILED: { label: 'Başarısız', variant: 'danger' },
    SKIPPED: { label: 'Atlandı', variant: 'default' },
  };
  const cfg = map[status] ?? { label: status, variant: 'default' as const };
  return <Badge variant={cfg.variant} dot size="sm">{cfg.label}</Badge>;
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 appearance-none rounded-lg border border-border bg-surface-secondary pl-3 pr-7 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
    </div>
  );
}

function MessagePreviewModal({ log, onClose }: { log: NotificationLog; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    if (log.messageText) {
      // Strip HTML tags for clipboard
      const plain = log.messageText.replace(/<[^>]*>/g, '');
      navigator.clipboard.writeText(plain).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl animate-float-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-text-tertiary" />
            <h3 className="text-sm font-semibold text-text-primary">Bildirim Detayı</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-secondary">
            <X className="h-4 w-4 text-text-tertiary" />
          </button>
        </div>

        {/* Meta */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <MetaItem label="Tip" value={<MsgTypeBadge type={log.messageType} />} />
          <MetaItem label="Durum" value={<StatusBadge status={log.status} />} />
          <MetaItem label="Zaman" value={
            <span className="text-xs text-text-secondary">
              {new Date(log.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
            </span>
          } />
          <MetaItem label="Alıcı" value={
            <span className="text-xs text-text-secondary">
              {log.sentTo} gönderildi{log.failedTo > 0 ? `, ${log.failedTo} başarısız` : ''}
            </span>
          } />
          {log.productName && (
            <MetaItem label="Ürün" value={
              <span className="text-xs font-medium text-text-primary">{log.productName}</span>
            } />
          )}
          {log.retailer && (
            <MetaItem label="Mağaza" value={
              <span className="text-xs text-text-secondary">{log.retailer}</span>
            } />
          )}
          {log.oldPrice && log.newPrice && (
            <Fragment>
              <MetaItem label="Fiyat Değişimi" value={
                <span className="text-xs">
                  <span className="text-text-tertiary line-through">{formatPrice(log.oldPrice)}</span>
                  {' → '}
                  <span className="font-medium text-emerald-600">{formatPrice(log.newPrice)}</span>
                </span>
              } />
              {log.dropPercent && (
                <MetaItem label="Düşüş" value={
                  <span className="text-xs font-medium text-emerald-600">%{log.dropPercent.toFixed(1)}</span>
                } />
              )}
            </Fragment>
          )}
        </div>

        {/* Error */}
        {log.errorMessage && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <span className="font-medium">Hata: </span>{log.errorMessage}
          </div>
        )}

        {/* Message Preview */}
        {log.messageText && (
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-text-tertiary">Mesaj İçeriği</span>
              <button
                onClick={copyText}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-secondary"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Kopyalandı!' : 'Kopyala'}
              </button>
            </div>
            <div
              className="rounded-lg border border-border bg-surface-secondary p-3 text-sm leading-relaxed text-text-primary"
              dangerouslySetInnerHTML={{ __html: log.messageText.replace(/\n/g, '<br/>') }}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Kapat</Button>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      {value}
    </div>
  );
}
