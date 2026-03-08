import * as cheerio from 'cheerio';
import { TRUSTED_RETAILERS, parseTurkishPrice } from '@repo/shared';
import type { TrustedRetailer } from '@repo/shared';

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
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
};

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

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`[discovery] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[discovery] Fetch error for ${url}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Product Name Parsing & Matching ────────────────────────────

interface ParsedProductName {
  family: string;       // "iPhone 15", "iPhone 17 Pro Max"
  modelNumber: string;  // "15", "17"
  variant: string;      // "Pro Max", "Plus", "Air", ""
  storageGb: number;
  color: string | null; // normalized English color or null
}

/**
 * Parse an iPhone product name from a comparison site listing.
 * Handles Turkish and English names like:
 *   "iPhone 15 256 GB Mavi"
 *   "Apple iPhone 17 Pro Max 512 GB Gümüş"
 *   "iPhone 13 128GB Beyaz"
 */
function parseProductName(title: string): ParsedProductName | null {
  const lower = title.toLowerCase();

  // Must contain "iphone"
  if (!lower.includes('iphone')) return null;

  // Extract model number and variant
  const modelMatch = lower.match(/iphone\s*(\d{2,3})\s*(pro\s*max|pro|plus|mini|air)?/);
  if (!modelMatch) return null;

  const modelNumber = modelMatch[1];
  const rawVariant = modelMatch[2] || '';
  const variant = rawVariant
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const family = `iPhone ${modelNumber}${variant ? ' ' + variant : ''}`;

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

  return { family, modelNumber, variant, storageGb, color };
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
    const expectedModelMatch = expectedFamilyLower.match(/iphone\s*(\d+)/);
    if (expectedModelMatch && parsed.modelNumber === expectedModelMatch[1]) {
      // Same iPhone number but different variant (e.g. Pro vs Pro Max)
      // This is NOT a match
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

  const html = await fetchWithTimeout(searchUrl);
  if (!html) {
    errors.push({
      type: 'fallback_search_failed',
      source: 'akakce',
      message: `Failed to fetch search page`,
      timestamp: new Date().toISOString(),
    });
    return { results, errors };
  }

  const $ = cheerio.load(html);

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
      const jsonMatches = content.matchAll(/"(?:url|link|href)"\s*:\s*"(https?:\/\/[^"]+(?:hepsiburada|trendyol|n11|amazon|pazarama)[^"]*)"/gi);
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

  const html = await fetchWithTimeout(searchUrl);
  if (!html) {
    errors.push({
      type: 'fallback_search_failed',
      source: 'cimri',
      message: `Failed to fetch search page`,
      timestamp: new Date().toISOString(),
    });
    return { results, errors };
  }

  const $ = cheerio.load(html);

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

  // Query active sources in parallel (akakce + cimri only)
  const [akakceResult, cimriResult] = await Promise.allSettled([
    queryAkakce(searchQuery, familyName, storageGb, color),
    queryCimri(searchQuery, familyName, storageGb, color),
  ]);

  const allResults: DiscoveryResult[] = [];
  const allErrors: DiscoveryError[] = [];
  const sourcesQueried: string[] = [];

  for (const [name, result] of [
    ['akakce', akakceResult],
    ['cimri', cimriResult],
  ] as const) {
    sourcesQueried.push(name);
    if (result.status === 'fulfilled') {
      allResults.push(...result.value.results);
      allErrors.push(...result.value.errors);
    } else {
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
