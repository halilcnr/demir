import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatRelativeDate(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  return formatDate(date);
}

export function calculateChangePercent(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** iPhone model adını, rengi ve depolamayı normalize eder */
export function normalizeIPhoneModel(
  title: string
): { model: string; color: string; storageGb: number } | null {
  const lower = title.toLowerCase();

  // iPhone model pattern: iPhone XX (Pro|Pro Max|Plus|Mini)?
  const modelMatch = lower.match(/iphone\s*(\d{2,3})\s*(pro\s*max|pro|plus|mini|air)?/);
  if (!modelMatch) return null;

  const number = modelMatch[1];
  const variant = modelMatch[2]
    ? modelMatch[2].replace(/\s+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';

  const model = `iPhone ${number}${variant ? ' ' + variant : ''}`;

  // Storage pattern
  const storageMatch = lower.match(/(\d+)\s*(gb|tb)/i);
  let storageGb = 128; // default
  if (storageMatch) {
    const num = parseInt(storageMatch[1], 10);
    const unit = storageMatch[2].toLowerCase();
    storageGb = unit === 'tb' ? num * 1024 : num;
  }

  // Color detection
  const color = detectColor(title);

  return { model, color, storageGb };
}

const COLOR_MAP: Record<string, string> = {
  // Türkçe & İngilizce renk eşlemeleri
  'siyah': 'Siyah', 'black': 'Siyah', 'midnight': 'Siyah', 'gece yarısı': 'Siyah',
  'beyaz': 'Beyaz', 'white': 'Beyaz', 'starlight': 'Beyaz', 'yıldız ışığı': 'Beyaz',
  'mavi': 'Mavi', 'blue': 'Mavi', 'ultramarine': 'Mavi',
  'yeşil': 'Yeşil', 'green': 'Yeşil',
  'pembe': 'Pembe', 'pink': 'Pembe',
  'kırmızı': 'Kırmızı', 'red': 'Kırmızı', 'product red': 'Kırmızı',
  'mor': 'Mor', 'purple': 'Mor',
  'sarı': 'Sarı', 'yellow': 'Sarı',
  'turuncu': 'Turuncu', 'orange': 'Turuncu',
  'natural titanium': 'Natural Titanium', 'doğal titanyum': 'Natural Titanium',
  'blue titanium': 'Blue Titanium', 'mavi titanyum': 'Blue Titanium',
  'white titanium': 'White Titanium', 'beyaz titanyum': 'White Titanium',
  'black titanium': 'Black Titanium', 'siyah titanyum': 'Black Titanium',
  'desert titanium': 'Desert Titanium', 'çöl titanyum': 'Desert Titanium',
  'teal': 'Teal',
};

function detectColor(title: string): string {
  const lower = title.toLowerCase();
  // Longer keys first to match "natural titanium" before "natural"
  const sortedKeys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      return COLOR_MAP[key];
    }
  }
  return 'Bilinmiyor';
}

export function getRetailerColor(slug: string): string {
  const colors: Record<string, string> = {
    hepsiburada: '#ff6000',
    trendyol: '#f27a1a',
    n11: '#7849b8',
    amazon: '#ff9900',
  };
  return colors[slug] ?? '#6b7280';
}
