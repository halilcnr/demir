# iPhone Price Tracker 🇹🇷

Türkiye e-ticaret sitelerindeki iPhone fiyatlarını takip eden monorepo uygulama.

## Mimari

| Servis | Teknoloji | Deploy |
|--------|-----------|--------|
| **apps/web** | Next.js 15, React 19, TanStack Query, Recharts | Vercel |
| **apps/worker** | TypeScript, Cheerio, node-cron | Railway |
| **packages/shared** | Paylaşılan tipler, utils, Prisma client | — |
| **prisma/** | Prisma schema & seed | Neon PostgreSQL |

## Özellikler

- **Çoklu Mağaza Takibi**: Hepsiburada, Trendyol, N11, Amazon.com.tr
- **Fırsat Tespiti**: 6 farklı fırsat tipi (fiyat düşüşü, tüm zamanların en düşüğü, mağazalar arası vb.)
- **Fiyat Geçmişi**: PriceSnapshot tabanlı, mağaza bazlı line chart
- **Alarm Sistemi**: Yüzdesel düşüş, hedef fiyat, yeni en düşük, mağazalar arası karşılaştırma
- **Otomatik Senkronizasyon**: Worker servisi ile 6 saatlik periyodik scraping
- **Responsive Dashboard**: Mobil uyumlu, fırsat-odaklı admin arayüzü

## Kurulum

### 1. Bağımlılıkları yükle

```bash
pnpm install
```

### 2. Environment değişkenlerini ayarla

```bash
cp .env.example .env
```

`.env` dosyasını düzenle:
- `DATABASE_URL`: Neon PostgreSQL bağlantı string'i (pooled)
- `DIRECT_URL`: Neon PostgreSQL doğrudan bağlantı (migration için)

### 3. Database'i hazırla

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### 4. Geliştirme

```bash
# Tüm servisleri başlat
pnpm dev

# Sadece web
pnpm --filter @repo/web dev

# Sadece worker
pnpm --filter @repo/worker dev
```

## Proje Yapısı

```
├── apps/
│   ├── web/                    # Next.js 15 Frontend & API
│   │   ├── src/app/            # App Router sayfaları
│   │   │   ├── api/            # API Routes
│   │   │   ├── variants/       # Varyant sayfaları
│   │   │   ├── deals/          # Fırsatlar
│   │   │   ├── alerts/         # Alarm yönetimi
│   │   │   ├── sync/           # Sync durumu
│   │   │   └── settings/       # Ayarlar
│   │   └── src/components/     # React bileşenleri
│   └── worker/                 # Scraping Worker (Railway)
│       ├── src/providers/      # Mağaza scraper'ları
│       ├── src/sync.ts         # Senkronizasyon motoru
│       ├── src/deals.ts        # Fırsat tespit motoru
│       ├── src/scheduler.ts    # Zamanlayıcı
│       └── Dockerfile          # Railway deploy
├── packages/
│   └── shared/                 # Paylaşılan kod
│       └── src/
│           ├── types/          # TypeScript tipleri
│           ├── utils/          # Yardımcı fonksiyonlar
│           └── db.ts           # Prisma client singleton
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed verileri
├── pnpm-workspace.yaml         # pnpm workspaces
└── turbo.json                  # Turborepo config
```

## Deployment

### Vercel (Web)

1. Vercel'de yeni proje oluştur, root directory: `apps/web`
2. Environment variables ekle: `DATABASE_URL`, `DIRECT_URL`
3. Framework: Next.js, Build command otomatik algılanır

### Railway (Worker)

1. Railway'de yeni servis oluştur
2. Dockerfile: `apps/worker/Dockerfile`
3. Environment variables: `DATABASE_URL`, `SYNC_INTERVAL_MS`, `USE_MOCK_PROVIDERS`

### Neon (Database)

1. [Neon](https://neon.tech) üzerinden PostgreSQL oluştur
2. Pooled URL → `DATABASE_URL`, Direct URL → `DIRECT_URL`

## Veri Modeli

- **ProductFamily** → iPhone modeli (ör. iPhone 15 Pro Max)
- **ProductVariant** → Renk + depolama (ör. 256GB Natural Titanium)
- **Listing** → Mağaza kaydı (fiyat, stok, fırsat skoru)
- **PriceSnapshot** → Her senkronizasyonda alınan fiyat geçmişi
- **AlertRule / AlertEvent** → Alarm kuralları ve tetiklenen bildirimler

### Faz 3 — Bildirimler
- [ ] Telegram bot entegrasyonu
- [ ] E-posta bildirimleri
- [ ] WhatsApp Business API

### Faz 4 — Gelişmiş Özellikler
- [ ] NextAuth ile çok kullanıcılı sistem
- [ ] Kullanıcı bazlı alarm kuralları
- [ ] Fiyat tahmini (basit trend analizi)
- [ ] CSV/Excel export
- [ ] Renk bazlı filtreleme
- [ ] PWA desteği

## Lisans

Private — Ticari kullanım.
