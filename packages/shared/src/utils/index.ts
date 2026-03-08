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

  const modelMatch = lower.match(/iphone\s*(\d{2,3})\s*(pro\s*max|pro|plus|mini|air)?/);
  if (!modelMatch) return null;

  const number = modelMatch[1];
  const variant = modelMatch[2]
    ? modelMatch[2].replace(/\s+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';

  const model = `iPhone ${number}${variant ? ' ' + variant : ''}`;

  const storageMatch = lower.match(/(\d+)\s*(gb|tb)/i);
  let storageGb = 128;
  if (storageMatch) {
    const num = parseInt(storageMatch[1], 10);
    const unit = storageMatch[2].toLowerCase();
    storageGb = unit === 'tb' ? num * 1024 : num;
  }

  const color = detectColor(title);

  return { model, color, storageGb };
}

const COLOR_MAP: Record<string, string> = {
  // Basic colors — map Turkish retailer names to English DB names
  'siyah': 'Black', 'black': 'Black', 'midnight': 'Black', 'gece yarısı': 'Black',
  'beyaz': 'White', 'white': 'White', 'starlight': 'White', 'yıldız ışığı': 'White',
  'mavi': 'Blue', 'blue': 'Blue',
  'yeşil': 'Green', 'green': 'Green', 'yesil': 'Green',
  'pembe': 'Pink', 'pink': 'Pink',
  'kırmızı': 'Red', 'red': 'Red', 'product red': 'Red',
  'mor': 'Purple', 'purple': 'Purple',
  'sarı': 'Yellow', 'yellow': 'Yellow', 'sari': 'Yellow',
  'turuncu': 'Orange', 'orange': 'Orange',
  'teal': 'Teal', 'deniz mavisi': 'Teal',
  'ultramarine': 'Ultramarine', 'lacivert taş': 'Ultramarine', 'lacivert tas': 'Ultramarine', 'laciverttaş': 'Ultramarine', 'laciverttas': 'Ultramarine',
  // Titanium variants
  'natural titanium': 'Natural Titanium', 'doğal titanyum': 'Natural Titanium',
  'blue titanium': 'Blue Titanium', 'mavi titanyum': 'Blue Titanium',
  'white titanium': 'White Titanium', 'beyaz titanyum': 'White Titanium',
  'black titanium': 'Black Titanium', 'siyah titanyum': 'Black Titanium',
  'desert titanium': 'Desert Titanium', 'çöl titanyum': 'Desert Titanium',
  // iPhone 17 colors
  'fog blue': 'Fog Blue', 'sis mavisi': 'Fog Blue', 'sis mavi': 'Fog Blue',
  'lavender': 'Lavender', 'lavanta': 'Lavender',
  'sage': 'Sage', 'ada çayı': 'Sage', 'ada cayi': 'Sage', 'adaçayı': 'Sage',
  // iPhone 17 Pro / Pro Max colors
  'obsidian': 'Obsidian', 'obsidyen': 'Obsidian', 'abis': 'Obsidian',
  'silver': 'Silver', 'gümüş': 'Silver', 'gumus': 'Silver', 'gümüş rengi': 'Silver',
  'cosmic orange': 'Cosmic Orange', 'kozmik turuncu': 'Cosmic Orange',
  // Space Black (iPhone 14 Pro etc.)
  'space black': 'Space Black', 'uzay siyahı': 'Space Black',
  'gold': 'Gold', 'altın': 'Gold',
  'deep purple': 'Deep Purple', 'derin mor': 'Deep Purple',
};

function detectColor(title: string): string {
  const lower = title.toLowerCase();
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
    pazarama: '#00b900',
    idefix: '#00a1e4',
    mediamarkt: '#df0000',
    a101: '#004e9a',
    migros: '#f26f21',
  };
  return colors[slug] ?? '#6b7280';
}

/**
 * Robust Turkish price normalization.
 *
 * Supported formats:
 *   ₺74.499       → 74499
 *   74.499 TL      → 74499
 *   74.499,00 TL   → 74499
 *   ₺74,499.00     → 74499 (misformatted — treat comma as thousands)
 *   74499           → 74499
 *   74.499,99       → 74499.99
 *   1.234.567       → 1234567
 *
 * Rules:
 *   1. Strip ₺, TL, whitespace, non-numeric except . and ,
 *   2. If BOTH dot and comma present → decide by position:
 *      last separator is decimal, previous ones are thousands
 *   3. If only comma → check digit count after it:
 *      ≤2 digits = decimal, 3 digits = thousands
 *   4. If only dot → check digit count after last dot:
 *      3 digits = thousands, otherwise decimal
 *   5. Never return < 1 for iPhone prices
 */
export function parseTurkishPrice(text: string): number | null {
  // Strip currency symbols, letters, whitespace
  let cleaned = text.replace(/[₺\s]/g, '').replace(/TL/gi, '').trim();
  if (!cleaned) return null;

  // Remove any remaining non-numeric chars except . and ,
  cleaned = cleaned.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  let result: number;

  if (hasDot && hasComma) {
    // Both present — the LAST separator is decimal
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');

    if (lastComma > lastDot) {
      // e.g. "74.499,00" → comma is decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // e.g. "74,499.00" → dot is decimal
      cleaned = cleaned.replace(/,/g, '');
    }
    result = parseFloat(cleaned);
  } else if (hasComma) {
    const parts = cleaned.split(',');
    const afterComma = parts[parts.length - 1];
    if (afterComma.length === 3) {
      // "74,499" → thousands separator
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // "74,50" → decimal
      cleaned = cleaned.replace(',', '.');
    }
    result = parseFloat(cleaned);
  } else if (hasDot) {
    const parts = cleaned.split('.');
    const afterLastDot = parts[parts.length - 1];
    if (afterLastDot.length === 3) {
      // "74.499" or "1.234.567" → thousands separator
      cleaned = cleaned.replace(/\./g, '');
    }
    // else: "74.50" → keep as decimal
    result = parseFloat(cleaned);
  } else {
    result = parseFloat(cleaned);
  }

  return !isNaN(result) && result > 0 ? result : null;
}

// ─── Provider Health Status Derivation ───────────────────────────
import type { ProviderStatus } from '../types';

const PROVIDER_HEALTHY_WINDOW_MS = 15 * 60 * 1000; // 15 min
const PROVIDER_WARNING_WINDOW_MS = 30 * 60 * 1000; // 30 min
const PROVIDER_FAILURE_THRESHOLD = 5;

/**
 * Derive provider health status from DB fields.
 * Shared between worker and web API to avoid logic duplication.
 * The worker wraps this with additional in-memory cooldown awareness.
 */
export function deriveProviderStatus(retailer: {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastBlockedAt: Date | null;
  consecutiveFailures: number;
}): ProviderStatus {
  const now = Date.now();

  // Blocked takes priority
  if (
    retailer.lastBlockedAt &&
    (!retailer.lastSuccessAt || retailer.lastBlockedAt > retailer.lastSuccessAt)
  ) {
    return 'blocked';
  }

  // Consecutive failure threshold
  if (retailer.consecutiveFailures >= PROVIDER_FAILURE_THRESHOLD) {
    return 'error';
  }

  // Recent success → healthy
  if (retailer.lastSuccessAt && now - retailer.lastSuccessAt.getTime() < PROVIDER_HEALTHY_WINDOW_MS) {
    return 'healthy';
  }

  // No recent success but within warning window
  if (retailer.lastSuccessAt && now - retailer.lastSuccessAt.getTime() < PROVIDER_WARNING_WINDOW_MS) {
    return 'warning';
  }

  // No success at all, no failures either — unknown/warning
  if (!retailer.lastSuccessAt && retailer.consecutiveFailures === 0) {
    return 'warning';
  }

  return 'error';
}
