import * as cheerio from 'cheerio';
import { TRUSTED_RETAILERS, parseTurkishPrice } from '@repo/shared';
import type { TrustedRetailer } from '@repo/shared';
import {
  isDiscoverySourceAvailable,
  recordDiscoverySuccess,
  recordDiscoveryFailure,
  recordDiscoveryBlocked,
} from './provider-health';
import { logDiscoveryAttempt } from './sync-logger';

// ─── Types ──────────────────────────────────────────────────────

export interface DiscoveryResult {
  source: string;
  retailerSlug: TrustedRetailer;
  productUrl: string;
  price: number | null;
  title: string;
  confidence: number; // 0-1
  matchDetails: MatchDetails;
}

export interface MatchDetails {
  familyMatch: boolean;
  storageMatch: boolean;
  colorMatch: 'exact' | 'partial' | 'missing' | 'mismatch';
  titleSimilarity: number; // 0-1
  domainVerified: boolean;
}

export type DiscoveryErrorType =
  | 'direct_scrape_failed'
  | 'fallback_search_failed'
  | 'no_trusted_offer'
  | 'confidence_too_low'
  | 'outbound_link_invalid'
  | 'parse_failed'
  | 'blocked_by_provider';

export interface DiscoveryError {
  type: DiscoveryErrorType;
  source: string;
  message: string;
  timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.55;

// Retailer domain → slug mapping
const RETAILER_DOMAINS: Record<string, TrustedRetailer> = {
  'hepsiburada.com': 'hepsiburada',
  'trendyol.com': 'trendyol',
  'n11.com': 'n11',
  'amazon.com.tr': 'amazon',
  'pazarama.com': 'pazarama',
  'idefix.com': 'idefix',
  'mediamarkt.com.tr': 'mediamarkt',
  'a101.com.tr': 'a101',
  'migros.com.tr': 'migros',
  'bim.com.tr': 'bim',
  'sokmarket.com.tr': 'sok',
  'beymen.com': 'beymen',
};

// Retailer name aliases → slug (case-insensitive matching)
const RETAILER_NAME_ALIASES: Record<string, TrustedRetailer> = {
  'hepsiburada': 'hepsiburada',
  'hepsiburada.com': 'hepsiburada',
  'trendyol': 'trendyol',
  'trendyol.com': 'trendyol',
  'n11': 'n11',
  'n11.com': 'n11',
  'amazon': 'amazon',
  'amazon.com.tr': 'amazon',
  'amazon türkiye': 'amazon',
  'pazarama': 'pazarama',
  'pazarama.com': 'pazarama',
  'idefix': 'idefix',
  'idefix.com': 'idefix',
  'İdefix': 'idefix',
  'mediamarkt': 'mediamarkt',
  'media markt': 'mediamarkt',
  'mediamarkt.com.tr': 'mediamarkt',
  'a101': 'a101',
  'a101.com.tr': 'a101',
  'migros': 'migros',
  'migros.com.tr': 'migros',
  'bim': 'bim',
  'bim.com.tr': 'bim',
  'BİM': 'bim',
  'sok': 'sok',
  'sokmarket.com.tr': 'sok',
  'şok': 'sok',
  'ŞOK': 'sok',
  'şok market': 'sok',
  'beymen': 'beymen',
  'beymen.com': 'beymen',
  'Beymen': 'beymen',
};

// Turkish color name → English normalized color (for matching)
const TURKISH_COLOR_MAP: Record<string, string> = {
  'siyah': 'black', 'black': 'black', 'midnight': 'black', 'gece yarısı': 'black',
  'beyaz': 'white', 'white': 'white', 'starlight': 'white', 'yıldız ışığı': 'white',
  'mavi': 'blue', 'blue': 'blue',
  'yeşil': 'green', 'green': 'green', 'yesil': 'green',
  'pembe': 'pink', 'pink': 'pink',
  'kırmızı': 'red', 'red': 'red', 'product red': 'red',
  'mor': 'purple', 'purple': 'purple',
  'sarı': 'yellow', 'yellow': 'yellow', 'sari': 'yellow',
  'turuncu': 'orange', 'orange': 'orange',
  'teal': 'teal', 'deniz mavisi': 'teal',
  'natural titanium': 'natural titanium', 'doğal titanyum': 'natural titanium',
  'blue titanium': 'blue titanium', 'mavi titanyum': 'blue titanium',
  'white titanium': 'white titanium', 'beyaz titanyum': 'white titanium',
  'black titanium': 'black titanium', 'siyah titanyum': 'black titanium',
  'desert titanium': 'desert titanium', 'çöl titanyum': 'desert titanium',
  'fog blue': 'fog blue', 'sis mavisi': 'fog blue', 'sis mavi': 'fog blue',
  'lavender': 'lavender', 'lavanta': 'lavender',
  'sage': 'sage', 'ada çayı': 'sage', 'adaçayı': 'sage',
  'obsidian': 'obsidian', 'obsidyen': 'obsidian',
  'silver': 'silver', 'gümüş': 'silver', 'gumus': 'silver',
  'cosmic orange': 'cosmic orange', 'kozmik turuncu': 'cosmic orange',
  'space black': 'space black', 'uzay siyahı': 'space black',
  'gold': 'gold', 'altın': 'gold',
  'deep purple': 'deep purple', 'derin mor': 'deep purple',
  'ultramarine': 'ultramarine', 'lacivert taş': 'ultramarine',
  // Samsung colors
  'titanium black': 'titanium black', 'titanyum siyah': 'titanium black',
  'titanium gray': 'titanium gray', 'titanyum gri': 'titanium gray',
  'titanium blue': 'titanium blue', 'titanyum mavi': 'titanium blue',
  'titanium silverblue': 'titanium silverblue', 'titanyum gümüş mavi': 'titanium silverblue',
  'titanium violet': 'titanium violet', 'titanyum mor': 'titanium violet',
  'titanium yellow': 'titanium yellow', 'titanyum sarı': 'titanium yellow',
  'lilac': 'lilac', 'leylak': 'lilac', 'lila': 'lilac',
  'navy': 'navy', 'lacivert': 'navy',
  'gri': 'gray', 'gray': 'gray', 'grey': 'gray',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
];

function getBrowserHeaders(): Record<string, string> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com.tr/',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'DNT': '1',
  };
}

// ─── Utility Functions ──────────────────────────────────────────

function isTrustedRetailer(slug: string): slug is TrustedRetailer {
  return (TRUSTED_RETAILERS as readonly string[]).includes(slug);
}

function resolveRetailerFromUrl(url: string): TrustedRetailer | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, slug] of Object.entries(RETAILER_DOMAINS)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) return slug;
    }
  } catch { /* invalid URL */ }
  return null;
}

function resolveRetailerFromName(name: string): TrustedRetailer | null {
  const lower = name.toLowerCase().trim();
  // Try exact match first
  if (RETAILER_NAME_ALIASES[lower]) return RETAILER_NAME_ALIASES[lower];
  // Then substring match (sorted longest-first for precision)
  const sorted = Object.keys(RETAILER_NAME_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    if (lower.includes(alias)) return RETAILER_NAME_ALIASES[alias];
  }
  return null;
}

/**
 * Verifies that an outbound URL's domain matches the expected retailer.
 */
function verifyRetailerDomain(url: string, expectedSlug: TrustedRetailer): boolean {
  const resolved = resolveRetailerFromUrl(url);
  return resolved === expectedSlug;
}

/**
 * Follows redirect URLs from comparison sites to find the final retailer URL.
 * Many comparison sites use redirect URLs like /redirect?url=... or /go/...
 */
function extractRedirectTarget(href: string, baseUrl: string): string {
  // Try to extract direct URL from redirect patterns
  try {
    const url = new URL(href, baseUrl);
    // Common redirect parameter patterns
    for (const param of ['url', 'redirect', 'target', 'goto', 'to', 'ref', 'link']) {
      const target = url.searchParams.get(param);
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        return target;
      }
    }
  } catch { /* ignore */ }
  return href.startsWith('http') ? href : '';
}

interface FetchResult {
  html: string | null;
  status: number | null;
  blocked: boolean;
  error?: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<FetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: getBrowserHeaders(),
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      const blocked = res.status === 403 || res.status === 429;
      console.warn(`[discovery] HTTP ${res.status} for ${url}`);
      return { html: null, status: res.status, blocked };
    }
    const html = await res.text();
    return { html, status: res.status, blocked: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[discovery] Fetch error for ${url}: ${msg}`);
    return { html: null, status: null, blocked: false, error: msg };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Product Name Parsing & Matching ────────────────────────────

interface ParsedProductName {
  brand: 'Apple' | 'Samsung';
  family: string;       // "iPhone 15", "Galaxy S25 Ultra"
  modelNumber: string;  // "15", "S25"
  variant: string;      // "Pro Max", "Ultra", ""
  storageGb: number;
  color: string | null; // normalized English color or null
}

/**
 * Parse a product name from a comparison site listing.
 * Handles both iPhone and Samsung Galaxy titles in Turkish and English.
 */
function parseProductName(title: string): ParsedProductName | null {
  const lower = title.toLowerCase();

  let brand: 'Apple' | 'Samsung';
  let family: string;
  let modelNumber: string;
  let variant: string;

  if (lower.includes('galaxy') || lower.includes('samsung')) {
    // Samsung Galaxy parsing
    // Matches: Galaxy S25 Ultra, Galaxy S24 Ultra, Galaxy A56, Galaxy A36, etc.
    const galaxyMatch = lower.match(/galaxy\s*(s|a)(\d{2,3})\s*(ultra|plus|fe)?/);
    if (!galaxyMatch) return null;

    brand = 'Samsung';
    const series = galaxyMatch[1].toUpperCase(); // S or A
    modelNumber = `${series}${galaxyMatch[2]}`; // e.g. "S25", "A56"
    const rawVariant = galaxyMatch[3] || '';
    variant = rawVariant
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    family = `Galaxy ${modelNumber}${variant ? ' ' + variant : ''}`;
  } else if (lower.includes('iphone')) {
    // iPhone parsing
    const iphoneMatch = lower.match(/iphone\s*(\d{2,3})\s*(pro\s*max|pro|plus|mini|air)?/);
    if (!iphoneMatch) return null;

    brand = 'Apple';
    modelNumber = iphoneMatch[1];
    const rawVariant = iphoneMatch[2] || '';
    variant = rawVariant
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    family = `iPhone ${modelNumber}${variant ? ' ' + variant : ''}`;
  } else {
    return null;
  }

  // Extract storage
  const storageMatch = lower.match(/(\d+)\s*(gb|tb)/i);
  let storageGb = 0;
  if (storageMatch) {
    const num = parseInt(storageMatch[1], 10);
    const unit = storageMatch[2].toLowerCase();
    storageGb = unit === 'tb' ? num * 1024 : num;
  }
  if (storageGb === 0) return null; // Storage is required for matching

  // Extract color
  let color: string | null = null;
  const sortedColorKeys = Object.keys(TURKISH_COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedColorKeys) {
    if (lower.includes(key)) {
      color = TURKISH_COLOR_MAP[key];
      break;
    }
  }

  return { brand, family, modelNumber, variant, storageGb, color };
}

/**
 * Match a parsed product name against expected variant attributes.
 * Returns a confidence score and match details.
 */
function computeMatchConfidence(
  parsed: ParsedProductName,
  expectedFamily: string,
  expectedStorageGb: number,
  expectedColor?: string
): { confidence: number; details: MatchDetails } {
  let score = 0;
  const details: MatchDetails = {
    familyMatch: false,
    storageMatch: false,
    colorMatch: 'missing',
    titleSimilarity: 0,
    domainVerified: false, // set later
  };

  // Family match (0.4 weight)
  const expectedFamilyLower = expectedFamily.toLowerCase();
  const parsedFamilyLower = parsed.family.toLowerCase();
  if (parsedFamilyLower === expectedFamilyLower) {
    details.familyMatch = true;
    score += 0.4;
  } else {
    // Partial match: same model number, different variant
    const expectedModelMatch = expectedFamilyLower.match(/(?:iphone|galaxy\s*[sa])\s*(\w+)/);
    if (expectedModelMatch && parsed.modelNumber === expectedModelMatch[1]) {
      // Same model number but different variant (e.g. Pro vs Pro Max, or S25 vs S25 Ultra)
      return { confidence: 0, details };
    }
    return { confidence: 0, details };
  }

  // Storage match (0.35 weight)
  if (parsed.storageGb === expectedStorageGb) {
    details.storageMatch = true;
    score += 0.35;
  } else {
    // Wrong storage is a hard fail
    return { confidence: 0, details };
  }

  // Color match (0.15 weight)
  if (expectedColor && parsed.color) {
    const expectedColorLower = expectedColor.toLowerCase();
    // Check if colors match (comparing normalized English colors)
    const normalizedExpected = TURKISH_COLOR_MAP[expectedColorLower] || expectedColorLower;
    if (parsed.color === normalizedExpected) {
      details.colorMatch = 'exact';
      score += 0.15;
    } else {
      details.colorMatch = 'mismatch';
      // Color mismatch reduces confidence but doesn't disqualify
      // (comparison sites may show color-agnostic results)
      score += 0.02;
    }
  } else if (!expectedColor && !parsed.color) {
    details.colorMatch = 'missing';
    score += 0.08;
  } else if (parsed.color && !expectedColor) {
    details.colorMatch = 'partial';
    score += 0.05;
  } else {
    details.colorMatch = 'missing';
    score += 0.08;
  }

  // Title similarity bonus (0.1 weight) - awarded when we got this far
  details.titleSimilarity = score > 0.7 ? 0.9 : 0.6;
  score += details.titleSimilarity * 0.1;

  return { confidence: Math.min(1, score), details };
}

// ─── Akakçe Parser ──────────────────────────────────────────────

/**
 * Akakçe product page parser.
 * Akakçe shows product cards with multiple seller offers.
 * Structure:
 *   - Product listing items with product name and price
 *   - Each listing may have retailer links/buttons
 *   - Prices shown with Turkish formatting
 *   - Outbound links to retailer product pages
 *
 * Also supports searching via product pages that show seller offers.
 */
async function queryAkakce(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number,
  expectedColor?: string
): Promise<{ results: DiscoveryResult[]; errors: DiscoveryError[] }> {
  const results: DiscoveryResult[] = [];
  const errors: DiscoveryError[] = [];

  // Try search results page
  const searchUrl = `https://www.akakce.com/arama/?q=${encodeURIComponent(searchQuery)}`;
  console.log(`[discovery:akakce] Searching: ${searchUrl}`);

  const fetchResult = await fetchWithTimeout(searchUrl);
  if (fetchResult.blocked) {
    recordDiscoveryBlocked('akakce');
    logDiscoveryAttempt({ source: 'akakce', status: 'blocked', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'akakce', message: `Blocked (HTTP ${fetchResult.status})`, timestamp: new Date().toISOString() });
    return { results, errors };
  }
  if (!fetchResult.html) {
    recordDiscoveryFailure('akakce');
    logDiscoveryAttempt({ source: 'akakce', status: 'failed', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'akakce', message: `Failed to fetch search page`, timestamp: new Date().toISOString() });
    return { results, errors };
  }

  const $ = cheerio.load(fetchResult.html);

  // Strategy 1: Product listing items on search results
  // Akakçe search results typically have product cards with names, prices and store links
  $('li, div.p, div[class*="product"], article').each((_, el) => {
    try {
      const $el = $(el);

      // Get product title from various possible locations
      const title = $el.find('a.pn_w, a[class*="name"], h3, h2, .pn_w, span.pn_w').first().text().trim()
        || $el.find('a').first().text().trim();

      if (!title || title.length < 8) return;

      const parsed = parseProductName(title);
      if (!parsed) return;

      const { confidence, details } = computeMatchConfidence(parsed, expectedFamily, expectedStorageGb, expectedColor);
      if (confidence < 0.3) return;

      // Extract all links and check for trusted retailer links
      $el.find('a[href]').each((_, linkEl) => {
        const href = $(linkEl).attr('href') || '';
        if (!href) return;

        // Resolve redirect URLs
        const resolvedUrl = extractRedirectTarget(href, 'https://www.akakce.com');
        const checkUrl = resolvedUrl || (href.startsWith('http') ? href : `https://www.akakce.com${href}`);

        const retailerSlug = resolveRetailerFromUrl(checkUrl);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;

        // Extract price near this link or from the product card
        const priceText = $el.find('.pt_v, .fyt, span[class*="price"], .prc, [class*="fiyat"]').first().text().trim()
          || $(linkEl).closest('[class*="price"], [class*="fiyat"]').text().trim()
          || $(linkEl).text().trim();

        const price = parseTurkishPrice(priceText);

        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };
        const finalConfidence = finalDetails.domainVerified ? confidence + 0.05 : confidence;

        results.push({
          source: 'akakce',
          retailerSlug,
          productUrl: checkUrl,
          price: price && price > 1000 ? price : null,
          title,
          confidence: Math.min(1, finalConfidence),
          matchDetails: finalDetails,
        });
      });

      // Strategy 2: Look for seller name text + price blocks
      // Akakçe often shows seller names as buttons/badges
      $el.find('[class*="seller"], [class*="merchant"], [class*="magaza"], button, .v_a, .v_i').each((_, sellerEl) => {
        const sellerText = $(sellerEl).text().trim();
        const retailerSlug = resolveRetailerFromName(sellerText);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;

        // Find associated link
        const link = $(sellerEl).closest('a').attr('href')
          || $(sellerEl).find('a').attr('href')
          || $(sellerEl).parent().find('a').attr('href');

        if (!link) return;

        const resolvedUrl = extractRedirectTarget(link, 'https://www.akakce.com');
        const checkUrl = resolvedUrl || (link.startsWith('http') ? link : `https://www.akakce.com${link}`);

        const priceText = $(sellerEl).closest('li, div, tr')
          .find('[class*="price"], .pt_v, .fyt, [class*="fiyat"]').text().trim()
          || $(sellerEl).parent().text().trim();

        const price = parseTurkishPrice(priceText);

        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };
        const finalConfidence = finalDetails.domainVerified ? confidence + 0.05 : confidence;

        results.push({
          source: 'akakce',
          retailerSlug,
          productUrl: checkUrl,
          price: price && price > 1000 ? price : null,
          title,
          confidence: Math.min(1, finalConfidence),
          matchDetails: finalDetails,
        });
      });
    } catch { /* skip malformed elements */ }
  });

  // Strategy 3: Extract from script/JSON data embedded in page
  try {
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html() || '';
      // Look for JSON data with product/price info
      const jsonMatches = content.matchAll(/"(?:url|link|href)"\s*:\s*"(https?:\/\/[^"]+(?:hepsiburada|trendyol|n11|amazon|pazarama|idefix|mediamarkt|a101|migros)[^"]*)"/gi);
      for (const match of jsonMatches) {
        const url = match[1];
        const retailerSlug = resolveRetailerFromUrl(url);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) continue;

        // Try to find price near this URL in the JSON
        const priceMatch = content.substring(Math.max(0, match.index! - 200), match.index! + match[0].length + 200)
          .match(/"(?:price|fiyat|amount)"\s*:\s*"?(\d[\d.,]+)"?/i);
        const price = priceMatch ? parseTurkishPrice(priceMatch[1]) : null;

        results.push({
          source: 'akakce',
          retailerSlug,
          productUrl: url,
          price: price && price > 1000 ? price : null,
          title: searchQuery,
          confidence: 0.5, // Lower confidence for JSON-extracted URLs
          matchDetails: {
            familyMatch: true,
            storageMatch: true,
            colorMatch: 'missing',
            titleSimilarity: 0.5,
            domainVerified: verifyRetailerDomain(url, retailerSlug),
          },
        });
      }
    }
  } catch { /* ignore script parsing errors */ }

  if (results.length === 0) {
    errors.push({
      type: 'no_trusted_offer',
      source: 'akakce',
      message: `No trusted retailer offers found for "${searchQuery}"`,
      timestamp: new Date().toISOString(),
    });
  }

  return { results, errors };
}

// ─── Cimri Parser ───────────────────────────────────────────────

/**
 * Cimri.com parser.
 * Cimri shows product cards with seller offers.
 * Product page URL pattern: /cep-telefonlari/...
 * Search URL pattern: /arama?q=...
 */
async function queryCimri(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number,
  expectedColor?: string
): Promise<{ results: DiscoveryResult[]; errors: DiscoveryError[] }> {
  const results: DiscoveryResult[] = [];
  const errors: DiscoveryError[] = [];

  const searchUrl = `https://www.cimri.com/arama?q=${encodeURIComponent(searchQuery)}`;
  console.log(`[discovery:cimri] Searching: ${searchUrl}`);

  const fetchResult = await fetchWithTimeout(searchUrl);
  if (fetchResult.blocked) {
    recordDiscoveryBlocked('cimri');
    logDiscoveryAttempt({ source: 'cimri', status: 'blocked', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'cimri', message: `Blocked (HTTP ${fetchResult.status})`, timestamp: new Date().toISOString() });
    return { results, errors };
  }
  if (!fetchResult.html) {
    recordDiscoveryFailure('cimri');
    logDiscoveryAttempt({ source: 'cimri', status: 'failed', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'cimri', message: `Failed to fetch search page`, timestamp: new Date().toISOString() });
    return { results, errors };
  }

  const $ = cheerio.load(fetchResult.html);

  // Strategy 1: Product cards with retailer info
  $('[class*="ProductCard"], [data-testid*="product"], .product-card, article, [class*="product-item"]').each((_, el) => {
    try {
      const $el = $(el);
      const title = $el.find('h3, h2, [class*="title"], [class*="name"], [class*="ProductName"]').first().text().trim();
      if (!title || title.length < 8) return;

      const parsed = parseProductName(title);
      if (!parsed) return;

      const { confidence, details } = computeMatchConfidence(parsed, expectedFamily, expectedStorageGb, expectedColor);
      if (confidence < 0.3) return;

      // Look for retailer links
      $el.find('a[href]').each((_, linkEl) => {
        const href = $(linkEl).attr('href') || '';
        const resolvedUrl = extractRedirectTarget(href, 'https://www.cimri.com');
        const checkUrl = resolvedUrl || (href.startsWith('http') ? href : '');
        if (!checkUrl) return;

        const retailerSlug = resolveRetailerFromUrl(checkUrl);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;

        const priceText = $el.find('[class*="price"], [class*="fiyat"], [class*="Price"]').first().text().trim();
        const price = parseTurkishPrice(priceText);

        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };

        results.push({
          source: 'cimri',
          retailerSlug,
          productUrl: checkUrl,
          price: price && price > 1000 ? price : null,
          title,
          confidence: Math.min(1, finalDetails.domainVerified ? confidence + 0.05 : confidence),
          matchDetails: finalDetails,
        });
      });

      // Check seller name text
      $el.find('[class*="merchant"], [class*="seller"], [class*="store"], [class*="Merchant"]').each((_, sellerEl) => {
        const sellerText = $(sellerEl).text().trim();
        const retailerSlug = resolveRetailerFromName(sellerText);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;

        const link = $(sellerEl).closest('a').attr('href')
          || $(sellerEl).find('a').attr('href');
        if (!link) return;

        const resolvedUrl = extractRedirectTarget(link, 'https://www.cimri.com');
        const checkUrl = resolvedUrl || (link.startsWith('http') ? link : '');
        if (!checkUrl) return;

        const priceText = $(sellerEl).closest('[class*="Card"], li, div')
          .find('[class*="price"], [class*="fiyat"]').text().trim();
        const price = parseTurkishPrice(priceText);

        results.push({
          source: 'cimri',
          retailerSlug,
          productUrl: checkUrl,
          price: price && price > 1000 ? price : null,
          title,
          confidence: Math.min(1, confidence),
          matchDetails: { ...details, domainVerified: false },
        });
      });
    } catch { /* skip */ }
  });

  // Strategy 2: Cimri's embedded JSON/Next.js data
  try {
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      const data = JSON.parse(nextDataScript);
      const products = data?.props?.pageProps?.products
        || data?.props?.pageProps?.searchResult?.products
        || data?.props?.pageProps?.initialData?.products
        || [];

      for (const product of (Array.isArray(products) ? products : [])) {
        const title = product?.name || product?.title || '';
        if (!title) continue;

        const parsed = parseProductName(title);
        if (!parsed) continue;

        const { confidence, details } = computeMatchConfidence(parsed, expectedFamily, expectedStorageGb, expectedColor);
        if (confidence < 0.3) continue;

        // Extract merchant offers from product
        const offers = product?.merchants || product?.offers || product?.sellers || [];
        for (const offer of (Array.isArray(offers) ? offers : [])) {
          const merchantName = offer?.merchantName || offer?.name || offer?.sellerName || '';
          const retailerSlug = resolveRetailerFromName(merchantName);
          if (!retailerSlug || !isTrustedRetailer(retailerSlug)) continue;

          const url = offer?.url || offer?.link || offer?.productUrl || '';
          if (!url) continue;

          const price = typeof offer?.price === 'number' ? offer.price : parseTurkishPrice(String(offer?.price || ''));

          results.push({
            source: 'cimri',
            retailerSlug,
            productUrl: url,
            price: price && price > 1000 ? price : null,
            title,
            confidence: Math.min(1, verifyRetailerDomain(url, retailerSlug) ? confidence + 0.05 : confidence),
            matchDetails: { ...details, domainVerified: verifyRetailerDomain(url, retailerSlug) },
          });
        }
      }
    }
  } catch { /* ignore JSON parsing errors */ }

  if (results.length === 0) {
    errors.push({
      type: 'no_trusted_offer',
      source: 'cimri',
      message: `No trusted retailer offers found for "${searchQuery}"`,
      timestamp: new Date().toISOString(),
    });
  }

  return { results, errors };
}

// ─── EnUygun Parser ─────────────────────────────────────────────

async function queryEnuygun(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number,
  expectedColor?: string
): Promise<{ results: DiscoveryResult[]; errors: DiscoveryError[] }> {
  const results: DiscoveryResult[] = [];
  const errors: DiscoveryError[] = [];

  const searchUrl = `https://www.enuygun.com/arama/?q=${encodeURIComponent(searchQuery)}`;
  console.log(`[discovery:enuygun] Searching: ${searchUrl}`);

  const fetchResult = await fetchWithTimeout(searchUrl);
  if (fetchResult.blocked) {
    recordDiscoveryBlocked('enuygun');
    logDiscoveryAttempt({ source: 'enuygun', status: 'blocked', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'enuygun', message: `Blocked (HTTP ${fetchResult.status})`, timestamp: new Date().toISOString() });
    return { results, errors };
  }
  if (!fetchResult.html) {
    recordDiscoveryFailure('enuygun');
    logDiscoveryAttempt({ source: 'enuygun', status: 'failed', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'enuygun', message: 'Failed to fetch search page', timestamp: new Date().toISOString() });
    return { results, errors };
  }

  const $ = cheerio.load(fetchResult.html);

  $('[class*="ProductCard"], [class*="product-card"], article, [class*="product-item"], li[class*="product"]').each((_, el) => {
    try {
      const $el = $(el);
      const title = $el.find('h3, h2, [class*="title"], [class*="name"]').first().text().trim();
      if (!title || title.length < 8) return;
      const parsed = parseProductName(title);
      if (!parsed) return;
      const { confidence, details } = computeMatchConfidence(parsed, expectedFamily, expectedStorageGb, expectedColor);
      if (confidence < 0.3) return;

      $el.find('a[href]').each((_, linkEl) => {
        const href = $(linkEl).attr('href') || '';
        const resolvedUrl = extractRedirectTarget(href, 'https://www.enuygun.com');
        const checkUrl = resolvedUrl || (href.startsWith('http') ? href : '');
        if (!checkUrl) return;
        const retailerSlug = resolveRetailerFromUrl(checkUrl);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;
        const priceText = $el.find('[class*="price"], [class*="fiyat"]').first().text().trim();
        const price = parseTurkishPrice(priceText);
        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };
        results.push({
          source: 'enuygun', retailerSlug, productUrl: checkUrl,
          price: price && price > 1000 ? price : null, title,
          confidence: Math.min(1, finalDetails.domainVerified ? confidence + 0.05 : confidence),
          matchDetails: finalDetails,
        });
      });

      $el.find('[class*="seller"], [class*="merchant"], [class*="magaza"]').each((_, sellerEl) => {
        const sellerText = $(sellerEl).text().trim();
        const retailerSlug = resolveRetailerFromName(sellerText);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;
        const link = $(sellerEl).closest('a').attr('href') || $(sellerEl).find('a').attr('href');
        if (!link) return;
        const resolvedUrl = extractRedirectTarget(link, 'https://www.enuygun.com');
        const checkUrl = resolvedUrl || (link.startsWith('http') ? link : '');
        if (!checkUrl) return;
        const priceText = $(sellerEl).closest('li, div, tr').find('[class*="price"], [class*="fiyat"]').text().trim();
        const price = parseTurkishPrice(priceText);
        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };
        results.push({
          source: 'enuygun', retailerSlug, productUrl: checkUrl,
          price: price && price > 1000 ? price : null, title,
          confidence: Math.min(1, finalDetails.domainVerified ? confidence + 0.05 : confidence),
          matchDetails: finalDetails,
        });
      });
    } catch { /* skip */ }
  });

  // Try embedded JSON
  try {
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      const data = JSON.parse(nextDataScript);
      const products = data?.props?.pageProps?.products || data?.props?.pageProps?.searchResult?.products || [];
      for (const product of (Array.isArray(products) ? products : [])) {
        const title = product?.name || product?.title || '';
        if (!title) continue;
        const parsed = parseProductName(title);
        if (!parsed) continue;
        const { confidence, details } = computeMatchConfidence(parsed, expectedFamily, expectedStorageGb, expectedColor);
        if (confidence < 0.3) continue;
        const offers = product?.merchants || product?.offers || product?.sellers || [];
        for (const offer of (Array.isArray(offers) ? offers : [])) {
          const merchantName = offer?.merchantName || offer?.name || offer?.sellerName || '';
          const retailerSlug = resolveRetailerFromName(merchantName);
          if (!retailerSlug || !isTrustedRetailer(retailerSlug)) continue;
          const url = offer?.url || offer?.link || offer?.productUrl || '';
          if (!url) continue;
          const price = typeof offer?.price === 'number' ? offer.price : parseTurkishPrice(String(offer?.price || ''));
          results.push({
            source: 'enuygun', retailerSlug, productUrl: url,
            price: price && price > 1000 ? price : null, title,
            confidence: Math.min(1, verifyRetailerDomain(url, retailerSlug) ? confidence + 0.05 : confidence),
            matchDetails: { ...details, domainVerified: verifyRetailerDomain(url, retailerSlug) },
          });
        }
      }
    }
  } catch { /* ignore */ }

  if (results.length === 0) {
    errors.push({ type: 'no_trusted_offer', source: 'enuygun', message: `No trusted retailer offers found for "${searchQuery}"`, timestamp: new Date().toISOString() });
  }
  return { results, errors };
}

// ─── Epey Parser ────────────────────────────────────────────────

async function queryEpey(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number,
  expectedColor?: string
): Promise<{ results: DiscoveryResult[]; errors: DiscoveryError[] }> {
  const results: DiscoveryResult[] = [];
  const errors: DiscoveryError[] = [];

  const searchUrl = `https://www.epey.com/ara/${encodeURIComponent(searchQuery.replace(/\s+/g, '+'))}`;
  console.log(`[discovery:epey] Searching: ${searchUrl}`);

  const fetchResult = await fetchWithTimeout(searchUrl);
  if (fetchResult.blocked) {
    recordDiscoveryBlocked('epey');
    logDiscoveryAttempt({ source: 'epey', status: 'blocked', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'epey', message: `Blocked (HTTP ${fetchResult.status})`, timestamp: new Date().toISOString() });
    return { results, errors };
  }
  if (!fetchResult.html) {
    recordDiscoveryFailure('epey');
    logDiscoveryAttempt({ source: 'epey', status: 'failed', httpStatus: fetchResult.status ?? undefined });
    errors.push({ type: 'fallback_search_failed', source: 'epey', message: 'Failed to fetch search page', timestamp: new Date().toISOString() });
    return { results, errors };
  }

  const $ = cheerio.load(fetchResult.html);

  // Epey shows product cards with seller offer links
  $('[class*="product"], article, li[class*="item"], .listele .row, [class*="compare-item"]').each((_, el) => {
    try {
      const $el = $(el);
      const title = $el.find('h3, h2, a[class*="name"], [class*="title"], [class*="urun-adi"]').first().text().trim();
      if (!title || title.length < 8) return;
      const parsed = parseProductName(title);
      if (!parsed) return;
      const { confidence, details } = computeMatchConfidence(parsed, expectedFamily, expectedStorageGb, expectedColor);
      if (confidence < 0.3) return;

      $el.find('a[href]').each((_, linkEl) => {
        const href = $(linkEl).attr('href') || '';
        const resolvedUrl = extractRedirectTarget(href, 'https://www.epey.com');
        const checkUrl = resolvedUrl || (href.startsWith('http') ? href : '');
        if (!checkUrl) return;
        const retailerSlug = resolveRetailerFromUrl(checkUrl);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;
        const priceText = $el.find('[class*="price"], [class*="fiyat"]').first().text().trim();
        const price = parseTurkishPrice(priceText);
        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };
        results.push({
          source: 'epey', retailerSlug, productUrl: checkUrl,
          price: price && price > 1000 ? price : null, title,
          confidence: Math.min(1, finalDetails.domainVerified ? confidence + 0.05 : confidence),
          matchDetails: finalDetails,
        });
      });

      $el.find('[class*="magaza"], [class*="seller"], [class*="merchant"]').each((_, sellerEl) => {
        const sellerText = $(sellerEl).text().trim();
        const retailerSlug = resolveRetailerFromName(sellerText);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) return;
        const link = $(sellerEl).closest('a').attr('href') || $(sellerEl).find('a').attr('href');
        if (!link) return;
        const resolvedUrl = extractRedirectTarget(link, 'https://www.epey.com');
        const checkUrl = resolvedUrl || (link.startsWith('http') ? link : '');
        if (!checkUrl) return;
        const priceText = $(sellerEl).closest('li, div, tr').find('[class*="price"], [class*="fiyat"]').text().trim();
        const price = parseTurkishPrice(priceText);
        const finalDetails = { ...details, domainVerified: verifyRetailerDomain(checkUrl, retailerSlug) };
        results.push({
          source: 'epey', retailerSlug, productUrl: checkUrl,
          price: price && price > 1000 ? price : null, title,
          confidence: Math.min(1, finalDetails.domainVerified ? confidence + 0.05 : confidence),
          matchDetails: finalDetails,
        });
      });
    } catch { /* skip */ }
  });

  // Try embedded data
  try {
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html() || '';
      const jsonMatches = content.matchAll(/"(?:url|link|href)"\s*:\s*"(https?:\/\/[^"]+(?:hepsiburada|trendyol|n11|amazon|pazarama|idefix|mediamarkt|a101|migros)[^"]*)"/gi);
      for (const match of jsonMatches) {
        const url = match[1];
        const retailerSlug = resolveRetailerFromUrl(url);
        if (!retailerSlug || !isTrustedRetailer(retailerSlug)) continue;
        const priceMatch = content.substring(Math.max(0, match.index! - 200), match.index! + match[0].length + 200)
          .match(/"(?:price|fiyat|amount)"\s*:\s*"?(\d[\d.,]+)"?/i);
        const price = priceMatch ? parseTurkishPrice(priceMatch[1]) : null;
        results.push({
          source: 'epey', retailerSlug, productUrl: url,
          price: price && price > 1000 ? price : null, title: searchQuery,
          confidence: 0.5,
          matchDetails: { familyMatch: true, storageMatch: true, colorMatch: 'missing', titleSimilarity: 0.5, domainVerified: verifyRetailerDomain(url, retailerSlug) },
        });
      }
    }
  } catch { /* ignore */ }

  if (results.length === 0) {
    errors.push({ type: 'no_trusted_offer', source: 'epey', message: `No trusted retailer offers found for "${searchQuery}"`, timestamp: new Date().toISOString() });
  }
  return { results, errors };
}

// ─── Main Discovery Orchestrator ────────────────────────────────

export interface FallbackDiscoveryResult {
  results: DiscoveryResult[];
  errors: DiscoveryError[];
  sourcesQueried: string[];
  totalCandidates: number;
  acceptedCandidates: number;
  rejectedLowConfidence: number;
}

/**
 * Query all fallback discovery sources for a product.
 * Only returns results that point to trusted retailers above confidence threshold.
 *
 * Flow:
 * 1. Build search queries with product info
 * 2. Query all 4 sources in parallel
 * 3. Filter to trusted retailers only
 * 4. Apply confidence threshold
 * 5. Deduplicate by retailer (keep highest confidence)
 * 6. Return ranked results
 */
export async function queryFallbackSources(
  familyName: string,
  storageGb: number,
  color?: string
): Promise<DiscoveryResult[]> {
  const result = await queryFallbackSourcesDetailed(familyName, storageGb, color);
  return result.results;
}

export async function queryFallbackSourcesDetailed(
  familyName: string,
  storageGb: number,
  color?: string
): Promise<FallbackDiscoveryResult> {
  const storageLabel = storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`;
  const searchQuery = `Apple ${familyName} ${storageLabel}${color ? ' ' + color : ''}`;

  console.log(`[discovery] Querying fallback sources for: ${searchQuery}`);

  // Build the list of sources to query, skipping any that are blocked/in cooldown
  type SourceEntry = { name: string; fn: () => Promise<{ results: DiscoveryResult[]; errors: DiscoveryError[] }> };
  const sources: SourceEntry[] = [
    { name: 'akakce', fn: () => queryAkakce(searchQuery, familyName, storageGb, color) },
    { name: 'cimri', fn: () => queryCimri(searchQuery, familyName, storageGb, color) },
    { name: 'enuygun', fn: () => queryEnuygun(searchQuery, familyName, storageGb, color) },
    { name: 'epey', fn: () => queryEpey(searchQuery, familyName, storageGb, color) },
  ];

  const allResults: DiscoveryResult[] = [];
  const allErrors: DiscoveryError[] = [];
  const sourcesQueried: string[] = [];

  const activeSources = sources.filter(s => {
    if (!isDiscoverySourceAvailable(s.name)) {
      console.log(`[discovery] Skipping ${s.name} — blocked/cooldown`);
      allErrors.push({
        type: 'fallback_search_failed',
        source: s.name,
        message: 'Skipped: source in cooldown',
        timestamp: new Date().toISOString(),
      });
      return false;
    }
    return true;
  });

  // Query available sources in parallel
  const settled = await Promise.allSettled(activeSources.map(s => s.fn()));

  for (let i = 0; i < activeSources.length; i++) {
    const name = activeSources[i].name;
    const result = settled[i];
    sourcesQueried.push(name);
    if (result.status === 'fulfilled') {
      const hasResults = result.value.results.length > 0;
      if (hasResults) {
        recordDiscoverySuccess(name);
        logDiscoveryAttempt({ source: name, status: 'success', candidateCount: result.value.results.length });
      }
      allResults.push(...result.value.results);
      allErrors.push(...result.value.errors);
    } else {
      recordDiscoveryFailure(name);
      logDiscoveryAttempt({ source: name, status: 'failed', error: result.reason?.message ?? String(result.reason) });
      console.warn(`[discovery] ${name} failed:`, result.reason?.message ?? result.reason);
      allErrors.push({
        type: 'fallback_search_failed',
        source: name,
        message: result.reason?.message ?? String(result.reason),
        timestamp: new Date().toISOString(),
      });
    }
  }

  const totalCandidates = allResults.length;

  // Filter: only trusted retailers
  let filtered = allResults.filter(r => isTrustedRetailer(r.retailerSlug));

  // Apply confidence threshold
  let rejectedLowConfidence = 0;
  filtered = filtered.filter(r => {
    if (r.confidence >= CONFIDENCE_THRESHOLD) return true;
    rejectedLowConfidence++;
    console.log(`[discovery] Rejected low-confidence result: ${r.source}→${r.retailerSlug} (${r.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`);
    return false;
  });

  // Deduplicate by retailer: keep the highest-confidence result per retailer
  const bestByRetailer = new Map<string, DiscoveryResult>();
  for (const result of filtered) {
    const existing = bestByRetailer.get(result.retailerSlug);
    if (!existing || result.confidence > existing.confidence) {
      bestByRetailer.set(result.retailerSlug, result);
    } else if (result.confidence === existing.confidence) {
      // Same confidence: prefer one with a verified domain
      if (result.matchDetails.domainVerified && !existing.matchDetails.domainVerified) {
        bestByRetailer.set(result.retailerSlug, result);
      }
      // Same confidence and same domain verification: prefer one with price
      else if (result.price && !existing.price) {
        bestByRetailer.set(result.retailerSlug, result);
      }
    }
  }

  const finalResults = [...bestByRetailer.values()]
    .sort((a, b) => b.confidence - a.confidence);

  console.log(
    `[discovery] Found ${finalResults.length} trusted retailer links from ${totalCandidates} total candidates ` +
    `(${rejectedLowConfidence} rejected for low confidence)`
  );

  return {
    results: finalResults,
    errors: allErrors,
    sourcesQueried,
    totalCandidates,
    acceptedCandidates: finalResults.length,
    rejectedLowConfidence,
  };
}
