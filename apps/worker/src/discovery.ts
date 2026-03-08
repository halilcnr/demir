import * as cheerio from 'cheerio';
import { TRUSTED_RETAILERS, type TrustedRetailer } from '@repo/shared';

/**
 * Result from a fallback discovery source.
 * These sites aggregate prices and link to actual retailers.
 * We ONLY extract links pointing to trusted retailers.
 */
export interface DiscoveryResult {
  source: string;
  retailerSlug: TrustedRetailer;
  productUrl: string;
  price: number | null;
  title: string;
  confidence: number; // 0-1
}

// Mapping from discovery-site retailer names to our slugs
const RETAILER_ALIASES: Record<string, TrustedRetailer> = {
  'hepsiburada': 'hepsiburada',
  'hepsiburada.com': 'hepsiburada',
  'trendyol': 'trendyol',
  'trendyol.com': 'trendyol',
  'n11': 'n11',
  'n11.com': 'n11',
  'amazon': 'amazon',
  'amazon.com.tr': 'amazon',
  'pazarama': 'pazarama',
  'pazarama.com': 'pazarama',
};

function resolveRetailerFromUrl(url: string): TrustedRetailer | null {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [alias, slug] of Object.entries(RETAILER_ALIASES)) {
      if (hostname.includes(alias)) return slug;
    }
  } catch { /* invalid URL */ }
  return null;
}

function resolveRetailerFromName(name: string): TrustedRetailer | null {
  const lower = name.toLowerCase().trim();
  for (const [alias, slug] of Object.entries(RETAILER_ALIASES)) {
    if (lower.includes(alias)) return slug;
  }
  return null;
}

function isTrustedRetailer(slug: string): slug is TrustedRetailer {
  return (TRUSTED_RETAILERS as readonly string[]).includes(slug);
}

/**
 * Checks if a discovery result matches the expected product.
 */
function matchesProduct(
  title: string,
  expectedFamily: string,
  expectedStorageGb: number
): { matches: boolean; confidence: number } {
  const lower = title.toLowerCase();
  const familyLower = expectedFamily.toLowerCase();

  // Must contain the iPhone model
  if (!lower.includes(familyLower.replace('iphone ', 'iphone'))) {
    // Try looser match
    const modelMatch = familyLower.match(/iphone\s*(\d+)\s*(.*)/);
    if (!modelMatch) return { matches: false, confidence: 0 };
    const num = modelMatch[1];
    const suffix = modelMatch[2].trim();
    if (!lower.includes(`iphone ${num}`) && !lower.includes(`iphone${num}`)) {
      return { matches: false, confidence: 0 };
    }
    if (suffix && !lower.includes(suffix)) {
      return { matches: false, confidence: 0 };
    }
  }

  // Check storage
  const storageStr = expectedStorageGb >= 1024
    ? `${expectedStorageGb / 1024} tb`
    : `${expectedStorageGb} gb`;
  const hasStorage = lower.includes(storageStr) || lower.includes(storageStr.replace(' ', ''));

  if (!hasStorage) return { matches: false, confidence: 0 };

  return { matches: true, confidence: 0.7 };
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
};

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Akakce discovery — scrapes akakce.com search results.
 * Extracts links to trusted retailers only.
 */
async function queryAkakce(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];
  const url = `https://www.akakce.com/arama/?q=${encodeURIComponent(searchQuery)}`;

  const html = await fetchWithTimeout(url);
  if (!html) return results;

  const $ = cheerio.load(html);

  // Akakce uses product listing cards with links to retailers
  $('li[class*="product"], div[class*="product"], .prc_list li, ul.prc_list li').each((_, el) => {
    try {
      const title = $(el).find('a').first().text().trim()
        || $(el).find('.pn_w, .product-name, h3, h2').text().trim();

      const link = $(el).find('a[href*="hepsiburada"], a[href*="trendyol"], a[href*="n11"], a[href*="amazon"], a[href*="pazarama"]').attr('href')
        || $(el).find('a').attr('href');

      if (!title || !link) return;

      // Check if link goes to a trusted retailer
      let retailerSlug: TrustedRetailer | null = null;

      if (link.startsWith('http')) {
        retailerSlug = resolveRetailerFromUrl(link);
      }

      // Also check retailer name text
      if (!retailerSlug) {
        const sellerText = $(el).find('.merchant, .seller, .store, .shop_name').text().trim();
        retailerSlug = resolveRetailerFromName(sellerText);
      }

      if (!retailerSlug) return;

      const match = matchesProduct(title, expectedFamily, expectedStorageGb);
      if (!match.matches) return;

      const priceText = $(el).find('.price, .prc, .fiyat, [class*="price"]').text().trim();
      let price: number | null = null;
      if (priceText) {
        const cleaned = priceText.replace(/[^\d.,]/g, '');
        if (cleaned) {
          // Turkish price format
          const parts = cleaned.split('.');
          if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            price = parseFloat(cleaned.replace(/\./g, ''));
          } else {
            price = parseFloat(cleaned.replace(',', '.'));
          }
        }
      }

      const productUrl = link.startsWith('http') ? link : `https://www.akakce.com${link}`;

      results.push({
        source: 'akakce',
        retailerSlug,
        productUrl,
        price,
        title,
        confidence: match.confidence,
      });
    } catch { /* skip */ }
  });

  return results;
}

/**
 * Cimri discovery — scrapes cimri.com search results.
 */
async function queryCimri(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];
  const url = `https://www.cimri.com/arama?q=${encodeURIComponent(searchQuery)}`;

  const html = await fetchWithTimeout(url);
  if (!html) return results;

  const $ = cheerio.load(html);

  $('[class*="ProductCard"], [data-testid*="product"], .product-card, article').each((_, el) => {
    try {
      const title = $(el).find('h3, h2, [class*="title"], [class*="name"]').text().trim();
      const link = $(el).find('a').attr('href');

      if (!title || !link) return;

      const match = matchesProduct(title, expectedFamily, expectedStorageGb);
      if (!match.matches) return;

      // Cimri usually links to its own product page, then shows retailer links
      const sellerText = $(el).find('[class*="merchant"], [class*="seller"], [class*="store"]').text().trim();
      const retailerSlug = resolveRetailerFromName(sellerText);

      if (!retailerSlug) return;

      const priceText = $(el).find('[class*="price"], [class*="fiyat"]').text().trim();
      let price: number | null = null;
      if (priceText) {
        const cleaned = priceText.replace(/[^\d.,]/g, '');
        if (cleaned) {
          const parts = cleaned.split('.');
          if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            price = parseFloat(cleaned.replace(/\./g, ''));
          } else {
            price = parseFloat(cleaned.replace(',', '.'));
          }
        }
      }

      const productUrl = link.startsWith('http') ? link : `https://www.cimri.com${link}`;

      results.push({
        source: 'cimri',
        retailerSlug,
        productUrl,
        price,
        title,
        confidence: match.confidence,
      });
    } catch { /* skip */ }
  });

  return results;
}

/**
 * Epey discovery — scrapes epey.com search results.
 */
async function queryEpey(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];
  const url = `https://www.epey.com/ara/${encodeURIComponent(searchQuery)}`;

  const html = await fetchWithTimeout(url);
  if (!html) return results;

  const $ = cheerio.load(html);

  // Epey lists product cards with retailer links
  $('.listele li, .urunler li, .product-list li, article').each((_, el) => {
    try {
      const title = $(el).find('a, h3, .title, .name').first().text().trim();
      const link = $(el).find('a').attr('href');

      if (!title || !link) return;

      const match = matchesProduct(title, expectedFamily, expectedStorageGb);
      if (!match.matches) return;

      const sellerText = $(el).find('.seller, .magaza, .merchant').text().trim();
      let retailerSlug = resolveRetailerFromName(sellerText);
      if (!retailerSlug && link.startsWith('http')) {
        retailerSlug = resolveRetailerFromUrl(link);
      }

      if (!retailerSlug) return;

      const priceText = $(el).find('.fiyat, .price, [class*="price"]').text().trim();
      let price: number | null = null;
      if (priceText) {
        const cleaned = priceText.replace(/[^\d.,]/g, '');
        if (cleaned) {
          const parts = cleaned.split('.');
          if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            price = parseFloat(cleaned.replace(/\./g, ''));
          } else {
            price = parseFloat(cleaned.replace(',', '.'));
          }
        }
      }

      const productUrl = link.startsWith('http') ? link : `https://www.epey.com${link}`;

      results.push({
        source: 'epey',
        retailerSlug,
        productUrl,
        price,
        title,
        confidence: match.confidence,
      });
    } catch { /* skip */ }
  });

  return results;
}

/**
 * EnUygun discovery — scrapes enuygun.com search results.
 */
async function queryEnuygun(
  searchQuery: string,
  expectedFamily: string,
  expectedStorageGb: number
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];
  const url = `https://www.enuygun.com/search?q=${encodeURIComponent(searchQuery)}`;

  const html = await fetchWithTimeout(url);
  if (!html) return results;

  const $ = cheerio.load(html);

  $('[class*="product"], article, li[class*="item"]').each((_, el) => {
    try {
      const title = $(el).find('h3, h2, a, [class*="title"]').first().text().trim();
      const link = $(el).find('a').attr('href');

      if (!title || !link) return;

      const match = matchesProduct(title, expectedFamily, expectedStorageGb);
      if (!match.matches) return;

      const sellerText = $(el).find('[class*="merchant"], [class*="seller"]').text().trim();
      let retailerSlug = resolveRetailerFromName(sellerText);
      if (!retailerSlug && link.startsWith('http')) {
        retailerSlug = resolveRetailerFromUrl(link);
      }

      if (!retailerSlug) return;

      const priceText = $(el).find('[class*="price"], [class*="fiyat"]').text().trim();
      let price: number | null = null;
      if (priceText) {
        const cleaned = priceText.replace(/[^\d.,]/g, '');
        if (cleaned) {
          const parts = cleaned.split('.');
          if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            price = parseFloat(cleaned.replace(/\./g, ''));
          } else {
            price = parseFloat(cleaned.replace(',', '.'));
          }
        }
      }

      const productUrl = link.startsWith('http') ? link : `https://www.enuygun.com${link}`;

      results.push({
        source: 'enuygun',
        retailerSlug,
        productUrl,
        price,
        title,
        confidence: match.confidence,
      });
    } catch { /* skip */ }
  });

  return results;
}

/**
 * Query all fallback discovery sources for a product.
 * Only returns results that point to trusted retailers.
 */
export async function queryFallbackSources(
  familyName: string,
  storageGb: number,
  color?: string
): Promise<DiscoveryResult[]> {
  const storageLabel = storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`;
  const searchQuery = `Apple ${familyName} ${storageLabel}${color ? ' ' + color : ''}`;

  console.log(`[discovery] Querying fallback sources for: ${searchQuery}`);

  // Query all sources in parallel
  const [akakce, cimri, epey, enuygun] = await Promise.allSettled([
    queryAkakce(searchQuery, familyName, storageGb),
    queryCimri(searchQuery, familyName, storageGb),
    queryEpey(searchQuery, familyName, storageGb),
    queryEnuygun(searchQuery, familyName, storageGb),
  ]);

  const allResults: DiscoveryResult[] = [];

  for (const result of [akakce, cimri, epey, enuygun]) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      console.warn(`[discovery] Source failed:`, result.reason?.message ?? result.reason);
    }
  }

  // Filter only trusted retailers, deduplicate by retailer
  const seen = new Set<string>();
  const filtered = allResults.filter((r) => {
    if (!isTrustedRetailer(r.retailerSlug)) return false;
    const key = r.retailerSlug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[discovery] Found ${filtered.length} trusted retailer links from ${allResults.length} total results`);
  return filtered;
}
