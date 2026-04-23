/**
 * Advanced scraping mechanisms for anti-detection and resilience.
 *
 * 1. Fingerprint Rotation – per-request browser profiles
 * 2. Header Morphing – realistic header variation
 * 3. Smart Backoff – adaptive backoff based on response patterns
 * 4. Drift Detection – detect page structure changes
 * 5. Validation Engine – cross-check scraped data
 * 6. Session Persistence – maintain cookies across requests
 * 7. HTML Snapshotting – store raw HTML for debugging
 */

// ─── 1. Fingerprint Rotation ────────────────────────────────────

interface BrowserProfile {
  userAgent: string;
  secChUa: string;
  secChUaPlatform: string;
  secChUaMobile: string;
  acceptLanguage: string;
  viewport: { width: number; height: number };
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
    acceptLanguage: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    viewport: { width: 1920, height: 1080 },
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"macOS"',
    secChUaMobile: '?0',
    acceptLanguage: 'tr-TR,tr;q=0.9,en;q=0.8',
    viewport: { width: 1440, height: 900 },
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    secChUa: '',
    secChUaPlatform: '',
    secChUaMobile: '',
    acceptLanguage: 'tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3',
    viewport: { width: 1920, height: 1080 },
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    secChUa: '',
    secChUaPlatform: '',
    secChUaMobile: '',
    acceptLanguage: 'tr-TR,tr;q=0.9',
    viewport: { width: 1440, height: 900 },
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaPlatform: '"Linux"',
    secChUaMobile: '?0',
    acceptLanguage: 'en-US,en;q=0.9,tr;q=0.8',
    viewport: { width: 1920, height: 1080 },
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    secChUa: '"Microsoft Edge";v="130", "Chromium";v="130", "Not_A Brand";v="24"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
    acceptLanguage: 'tr,en;q=0.9,en-GB;q=0.8',
    viewport: { width: 1536, height: 864 },
  },
];

// Track which profile was used per provider to avoid immediate repeats
const lastProfileIndex = new Map<string, number>();

export function getRotatedProfile(providerSlug: string): BrowserProfile {
  const last = lastProfileIndex.get(providerSlug) ?? -1;
  let idx: number;
  do {
    idx = Math.floor(Math.random() * BROWSER_PROFILES.length);
  } while (idx === last && BROWSER_PROFILES.length > 1);
  lastProfileIndex.set(providerSlug, idx);
  return BROWSER_PROFILES[idx];
}

// ─── 2. Header Morphing ─────────────────────────────────────────

const REFERERS = [
  'https://www.google.com.tr/',
  'https://www.google.com/',
  'https://www.google.com/search?q=iphone+fiyat',
  '', // Direct navigation (no referer)
];

const ACCEPT_VARIANTS = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
];

export function buildMorphedHeaders(profile: BrowserProfile): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': profile.userAgent,
    'Accept': ACCEPT_VARIANTS[Math.floor(Math.random() * ACCEPT_VARIANTS.length)],
    'Accept-Language': profile.acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'DNT': '1',
  };

  // Add sec-ch-ua headers for Chromium browsers
  if (profile.secChUa) {
    h['Sec-Ch-Ua'] = profile.secChUa;
    h['Sec-Ch-Ua-Platform'] = profile.secChUaPlatform;
    h['Sec-Ch-Ua-Mobile'] = profile.secChUaMobile;
    h['Sec-Fetch-Dest'] = 'document';
    h['Sec-Fetch-Mode'] = 'navigate';
    h['Sec-Fetch-Site'] = 'none';
    h['Sec-Fetch-User'] = '?1';
  }

  // Random referer — sometimes direct, sometimes google
  const ref = REFERERS[Math.floor(Math.random() * REFERERS.length)];
  if (ref) h['Referer'] = ref;

  // Sometimes include Cache-Control, sometimes not
  if (Math.random() > 0.5) {
    h['Cache-Control'] = Math.random() > 0.5 ? 'max-age=0' : 'no-cache';
  }

  return h;
}

// ─── 3. Smart Backoff ───────────────────────────────────────────

interface BackoffState {
  consecutiveBlocks: number;
  lastBlockAt: number;
  currentDelayMs: number;
}

const backoffStates = new Map<string, BackoffState>();

export function getSmartBackoff(providerSlug: string, baseDelayMs: number): number {
  const state = backoffStates.get(providerSlug);
  if (!state) return baseDelayMs;

  // If we were recently blocked, increase delay exponentially
  const timeSinceBlock = Date.now() - state.lastBlockAt;
  if (timeSinceBlock < 600_000) { // within 10 minutes
    return state.currentDelayMs;
  }

  // Decay back toward base delay over time
  const decayFactor = Math.max(0.5, 1 - timeSinceBlock / 3_600_000);
  return Math.max(baseDelayMs, state.currentDelayMs * decayFactor);
}

export function recordSmartBackoffBlock(providerSlug: string, baseDelayMs: number): void {
  const existing = backoffStates.get(providerSlug);
  const blocks = (existing?.consecutiveBlocks ?? 0) + 1;
  const delay = Math.min(baseDelayMs * Math.pow(2, blocks), 60_000); // max 60s
  backoffStates.set(providerSlug, {
    consecutiveBlocks: blocks,
    lastBlockAt: Date.now(),
    currentDelayMs: delay,
  });
}

export function recordSmartBackoffSuccess(providerSlug: string): void {
  const existing = backoffStates.get(providerSlug);
  if (existing) {
    existing.consecutiveBlocks = Math.max(0, existing.consecutiveBlocks - 1);
    if (existing.consecutiveBlocks === 0) {
      backoffStates.delete(providerSlug);
    }
  }
}

// ─── 4. Drift Detection ─────────────────────────────────────────

interface PageSignature {
  selectorHits: Record<string, boolean>;
  jsonLdPresent: boolean;
  metaTagCount: number;
  capturedAt: number;
}

const pageSignatures = new Map<string, PageSignature>();

export function detectPageDrift(
  providerSlug: string,
  selectors: string[],
  html: string,
): { drifted: boolean; missing: string[]; added: string[] } {
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html);

  const current: Record<string, boolean> = {};
  for (const sel of selectors) {
    current[sel] = $(sel).length > 0;
  }

  const previous = pageSignatures.get(providerSlug);
  const missing: string[] = [];
  const added: string[] = [];

  if (previous) {
    for (const sel of selectors) {
      if (previous.selectorHits[sel] && !current[sel]) missing.push(sel);
      if (!previous.selectorHits[sel] && current[sel]) added.push(sel);
    }
  }

  // Update stored signature
  pageSignatures.set(providerSlug, {
    selectorHits: current,
    jsonLdPresent: $('script[type="application/ld+json"]').length > 0,
    metaTagCount: $('meta').length,
    capturedAt: Date.now(),
  });

  return { drifted: missing.length > 0, missing, added };
}

// ─── 5. Validation Engine ────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
}

export function validateScrapedPrice(
  price: number,
  productName: string,
  retailerSlug: string,
  historicalPrices?: number[],
): ValidationResult {
  const warnings: string[] = [];

  // Basic range check for iPhone prices in TRY
  if (price < 5000) {
    warnings.push(`Fiyat çok düşük: ${price} TL`);
  }
  if (price > 200000) {
    warnings.push(`Fiyat çok yüksek: ${price} TL`);
  }

  // Round number check — suspiciously round prices may indicate parse errors
  if (price > 0 && price === Math.round(price / 1000) * 1000 && price > 10000) {
    warnings.push(`Yuvarlak sayı şüphesi: ${price} TL`);
  }

  // Historical deviation check
  if (historicalPrices && historicalPrices.length >= 3) {
    const avg = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
    const deviation = Math.abs(price - avg) / avg;
    if (deviation > 0.3) {
      warnings.push(`Tarihsel ortalamadan %${(deviation * 100).toFixed(0)} sapma`);
    }
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (warnings.length >= 2) confidence = 'low';
  else if (warnings.length === 1) confidence = 'medium';

  return { valid: warnings.length === 0, warnings, confidence };
}

// ─── 6. Session Persistence ──────────────────────────────────────

const sessionCookies = new Map<string, string[]>();

export function getSessionCookies(providerSlug: string): string | undefined {
  const cookies = sessionCookies.get(providerSlug);
  if (!cookies || cookies.length === 0) return undefined;
  return cookies.join('; ');
}

export function storeResponseCookies(providerSlug: string, setCookieHeaders: string[]): void {
  if (!setCookieHeaders.length) return;
  const existing = sessionCookies.get(providerSlug) ?? [];
  const cookieMap = new Map<string, string>();

  // Parse existing
  for (const c of existing) {
    const [name] = c.split('=');
    if (name) cookieMap.set(name.trim(), c);
  }

  // Add/override new
  for (const raw of setCookieHeaders) {
    const cookiePart = raw.split(';')[0];
    if (cookiePart) {
      const [name] = cookiePart.split('=');
      if (name) cookieMap.set(name.trim(), cookiePart);
    }
  }

  sessionCookies.set(providerSlug, [...cookieMap.values()]);
}

export function clearSessionCookies(providerSlug: string): void {
  sessionCookies.delete(providerSlug);
}

// ─── 7. HTML Snapshotting (in-memory ring buffer) ────────────────

export type SnapshotOutcome =
  | 'ok'                // 200 parsed successfully
  | 'strategy-failed'   // 200 but no strategy produced a price
  | 'blocked'           // 403
  | 'rate-limited'      // 429
  | 'http-error'        // other 4xx/5xx
  | 'network-error';    // fetch failed, timeout, DNS, etc.

interface HtmlSnapshot {
  url: string;
  providerSlug: string;
  html: string;
  capturedAt: number;
  success: boolean;
  status: number | null;       // HTTP status code (null if request never completed)
  outcome: SnapshotOutcome;
  note?: string;               // optional free-form detail (e.g. network error message)
}

const MAX_SNAPSHOTS = 40;
const snapshots: HtmlSnapshot[] = [];

export function storeSnapshot(
  providerSlug: string,
  url: string,
  html: string,
  success: boolean,
  meta?: { status?: number | null; outcome?: SnapshotOutcome; note?: string },
): void {
  // Keep only a hash-sized excerpt to avoid memory bloat
  const excerpt = html.substring(0, 8000);
  const outcome: SnapshotOutcome =
    meta?.outcome ?? (success ? 'ok' : 'strategy-failed');
  snapshots.push({
    url,
    providerSlug,
    html: excerpt,
    capturedAt: Date.now(),
    success,
    status: meta?.status ?? null,
    outcome,
    note: meta?.note,
  });
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift();
  }
}

export function getRecentSnapshots(providerSlug?: string): HtmlSnapshot[] {
  if (providerSlug) {
    return snapshots.filter(s => s.providerSlug === providerSlug);
  }
  return [...snapshots];
}

export function getFailedSnapshots(): HtmlSnapshot[] {
  return snapshots.filter(s => !s.success);
}
