# iPhone Price Tracker 🇹🇷

Türkiye e-ticaret sitelerindeki iPhone fiyatlarını takip eden admin dashboard uygulaması.

## Özellikler

- **Çoklu Mağaza Takibi**: Hepsiburada, Trendyol, N11, Amazon.com.tr
- **Fiyat Karşılaştırma**: Tüm mağazaları tek panelden görüntüleme
- **Fiyat Geçmişi**: Line chart ile geçmiş veri görselleştirme
- **Fiyat Alarmları**: Yüzdesel düşüş, hedef fiyat, yeni en düşük fiyat alarmları
- **Otomatik Senkronizasyon**: Vercel Cron ile 6 saatlik otomatik güncelleme
- **Responsive Dashboard**: Mobil uyumlu, modern admin arayüzü

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL + Prisma ORM
- **Charts**: Recharts
- **State**: TanStack React Query
- **Deployment**: Vercel
- **DB Hosting**: Neon PostgreSQL (önerilen)

## Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Environment değişkenlerini ayarla

```bash
cp .env.example .env
```

`.env` dosyasını düzenle:
- `DATABASE_URL`: PostgreSQL bağlantı string'i
- `NEXTAUTH_SECRET`: Rastgele güçlü bir secret
- `CRON_SECRET`: Cron endpoint koruması için secret
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: Admin giriş bilgileri

### 3. Database'i hazırla

```bash
npx prisma db push
npm run db:seed
```

### 4. Geliştirme sunucusu

```bash
npm run dev
```

## Proje Yapısı

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   │   ├── products/       # Ürün CRUD
│   │   ├── deals/          # Fırsat endpoint'i
│   │   ├── alerts/         # Alarm CRUD
│   │   ├── sync/           # Senkronizasyon
│   │   ├── dashboard/      # Dashboard özet
│   │   └── cron/           # Cron job endpoint
│   ├── products/           # Ürün sayfaları
│   ├── deals/              # Fırsatlar sayfası
│   ├── alerts/             # Alarm yönetimi
│   ├── sync/               # Sync admin paneli
│   └── settings/           # Ayarlar
├── components/
│   ├── charts/             # Recharts bileşenleri
│   ├── layout/             # Sidebar, Header
│   ├── providers/          # React Query provider
│   └── ui/                 # Paylaşılan UI bileşenleri
├── lib/
│   ├── providers/          # Scraping provider'lar
│   │   ├── base.ts         # Abstract base provider
│   │   ├── hepsiburada.ts  # Hepsiburada scraper
│   │   ├── trendyol.ts     # Trendyol scraper
│   │   ├── n11.ts          # N11 scraper
│   │   ├── amazon.ts       # Amazon scraper
│   │   ├── mock.ts         # Mock provider (dev)
│   │   └── index.ts        # Provider registry
│   ├── db.ts               # Prisma client singleton
│   ├── sync.ts             # Sync engine
│   └── utils.ts            # Yardımcı fonksiyonlar
└── types/
    └── index.ts            # TypeScript type tanımları
```

## Deployment (Vercel)

### 1. PostgreSQL Database
[Neon](https://neon.tech) üzerinden ücretsiz PostgreSQL oluştur.

### 2. Vercel'de Environment Variables

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | Neon PostgreSQL bağlantı URL'i |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` ile üret |
| `CRON_SECRET` | Cron endpoint güvenliği |
| `ADMIN_EMAIL` | Admin e-posta |
| `ADMIN_PASSWORD` | Admin şifre |
| `USE_MOCK_PROVIDERS` | `true` ise mock data kullanır |

### 3. Deploy

```bash
vercel deploy --prod
```

### 4. Database Migration

```bash
npx prisma db push
npm run db:seed
```

## Geliştirme Roadmap

### Faz 1 — MVP ✅
- [x] Proje iskeleti ve konfigürasyon
- [x] Database schema (Prisma)
- [x] Mock provider ile veri simülasyonu
- [x] Dashboard sayfası
- [x] Ürün listeleme ve detay
- [x] Fiyat grafiği (Recharts)
- [x] Temel alarm sistemi
- [x] Vercel deployment

### Faz 2 — Gerçek Veri
- [ ] Provider'ları gerçek scraping'e geçir
- [ ] Anti-bot stratejileri (proxy, rate limit)
- [ ] HTML selector bakımı ve monitoring
- [ ] Hata recovery ve retry mekanizması

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
