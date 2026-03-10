/**
 * Playwright-based Catalog URL Discovery Agent
 *
 * Scans Turkish e-commerce retailers with a real browser to find missing
 * product URLs for the iPhone variant catalog.
 *
 * Usage:
 *   npx playwright install chromium   # first-time setup
 *   npx tsx prisma/catalog-discovery.ts              # scan all gaps
 *   npx tsx prisma/catalog-discovery.ts --family "iPhone 16 Pro"  # filter
 *   npx tsx prisma/catalog-discovery.ts --retailer hepsiburada    # filter
 *   npx tsx prisma/catalog-discovery.ts --dry-run                 # no file changes
 *   npx tsx prisma/catalog-discovery.ts --headed                  # visible browser
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ──────────────────────────────────────────────

const PRODUCT_URLS_PATH = path.join(__dirname, 'product-urls.ts');
const RESULTS_PATH = path.join(__dirname, 'discovery-results.json');

const FAMILIES = [
  { name: 'iPhone 17', storages: [256, 512], colors: ['Black', 'White', 'Fog Blue', 'Lavender', 'Sage'] },
  { name: 'iPhone 17 Air', storages: [256, 512], colors: ['Black', 'White', 'Fog Blue', 'Lavender', 'Sage'] },
  { name: 'iPhone 17 Pro', storages: [256, 512, 1024], colors: ['Obsidian', 'Silver', 'Cosmic Orange'] },
  { name: 'iPhone 17 Pro Max', storages: [256, 512, 1024], colors: ['Obsidian', 'Silver', 'Cosmic Orange'] },
  { name: 'iPhone 16', storages: [128, 256, 512], colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'] },
  { name: 'iPhone 16 Pro', storages: [128, 256, 512, 1024], colors: ['Natural Titanium', 'Black Titanium', 'White Titanium', 'Desert Titanium'] },
  { name: 'iPhone 16 Pro Max', storages: [256, 512, 1024], colors: ['Natural Titanium', 'Black Titanium', 'White Titanium', 'Desert Titanium'] },
  { name: 'iPhone 15', storages: [128, 256, 512], colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] },
  { name: 'iPhone 14', storages: [128, 256, 512], colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red', 'Yellow'] },
  { name: 'iPhone 13', storages: [128, 256, 512], colors: ['Midnight', 'Starlight', 'Blue', 'Pink', 'Green', 'Red'] },
];

// Turkish color names for search queries
const COLOR_TR: Record<string, string> = {
  'Black': 'Siyah', 'White': 'Beyaz', 'Pink': 'Pembe', 'Blue': 'Mavi',
  'Green': 'Yeşil', 'Yellow': 'Sarı', 'Red': 'Kırmızı', 'Purple': 'Mor',
  'Teal': 'Turkuaz', 'Ultramarine': 'Ultramarin', 'Midnight': 'Gece Yarısı',
  'Starlight': 'Yıldız Işığı', 'Lavender': 'Lavanta', 'Sage': 'Adaçayı',
  'Fog Blue': 'Sis Mavisi', 'Obsidian': 'Obsidyen', 'Silver': 'Gümüş',
  'Cosmic Orange': 'Kozmik Turuncu',
  'Natural Titanium': 'Naturel Titanyum', 'Black Titanium': 'Siyah Titanyum',
  'White Titanium': 'Beyaz Titanyum', 'Desert Titanium': 'Çöl Titanyum',
};

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function storageLabel(gb: number): string {
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
}

function storageLabelForSearch(gb: number): string {
  return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
}

// ─── Types ───────────────────────────────────────────────

interface Gap {
  slug: string;
  family: string;
  storage: number;
  color: string;
  retailer: string;
}

interface DiscoveryResult {
  slug: string;
  retailer: string;
  url: string;
  verified: boolean;
  timestamp: string;
}

// ─── Retailer Search Strategies ─────────────────────────

interface RetailerStrategy {
  slug: string;
  name: string;
  searchUrl: (query: string) => string;
  resultSelector: string;
  /** Extract product URL from result element. Return null to skip. */
  extractUrl: (page: Page, resultEl: string) => Promise<string | null>;
  /** Verify the product page matches the expected variant */
  verify: (page: Page, family: string, storage: number, color: string) => Promise<boolean>;
  /** Per-retailer delay between requests (ms) */
  delay: number;
}

function buildSearchQuery(family: string, storage: number, color: string, useTurkish: boolean): string {
  const storageStr = storageLabelForSearch(storage);
  const colorName = useTurkish ? (COLOR_TR[color] ?? color) : color;
  return `Apple ${family} ${storageStr} ${colorName}`;
}

const STRATEGIES: RetailerStrategy[] = [
  {
    slug: 'hepsiburada',
    name: 'Hepsiburada',
    searchUrl: (q) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}`,
    resultSelector: '[data-test-id="product-card-item"] a, .productListContent a.hb-product-card',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.hepsiburada.com${href}`;
    },
    verify: async (page, family, storage, color) => {
      const title = await page.title();
      const text = title.toLowerCase();
      const familyLower = family.toLowerCase();
      const storageLower = storageLabelForSearch(storage).toLowerCase();
      return text.includes('iphone') && text.includes(storageLower.replace(' ', ''));
    },
  },
  {
    slug: 'trendyol',
    name: 'Trendyol',
    searchUrl: (q) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&qt=${encodeURIComponent(q)}&st=${encodeURIComponent(q)}`,
    resultSelector: '.p-card-wrppr a, div[data-testid="product-card"] a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.trendyol.com${href}`;
    },
    verify: async (page, family, storage, color) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'n11',
    name: 'N11',
    searchUrl: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}`,
    resultSelector: '.resultItem a.plink, .columnContent .pro a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      return await el.getAttribute('href');
    },
    verify: async (page, family, storage) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'amazon',
    name: 'Amazon',
    searchUrl: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}`,
    resultSelector: '.s-result-item[data-asin] h2 a',
    delay: 4000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      // Extract dp URL
      const dpMatch = href.match(/\/dp\/([A-Z0-9]+)/);
      if (dpMatch) return `https://www.amazon.com.tr/dp/${dpMatch[1]}`;
      return href.startsWith('http') ? href : `https://www.amazon.com.tr${href}`;
    },
    verify: async (page, family, storage) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'pazarama',
    name: 'Pazarama',
    searchUrl: (q) => `https://www.pazarama.com/search?q=${encodeURIComponent(q)}`,
    resultSelector: 'a[href*="/apple-iphone"], .product-card a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.pazarama.com${href}`;
    },
    verify: async (page, family, storage) => {
      const text = (await page.textContent('body')) ?? '';
      return text.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'mediamarkt',
    name: 'MediaMarkt',
    searchUrl: (q) => `https://www.mediamarkt.com.tr/tr/search.html?query=${encodeURIComponent(q)}`,
    resultSelector: 'a[href*="apple-iphone"], .product-wrapper a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.mediamarkt.com.tr${href}`;
    },
    verify: async (page, family, storage) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'idefix',
    name: 'Idefix',
    searchUrl: (q) => `https://www.idefix.com/search?q=${encodeURIComponent(q)}&cat=c-elektronik`,
    resultSelector: 'a[href*="apple-iphone"], .product-list a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.idefix.com${href}`;
    },
    verify: async (page, family, storage) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'migros',
    name: 'Migros',
    searchUrl: (q) => `https://www.migros.com.tr/arama?q=${encodeURIComponent(q)}`,
    resultSelector: 'a[href*="apple-iphone"], .product-card a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.migros.com.tr${href}`;
    },
    verify: async (page, family, storage) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
  {
    slug: 'a101',
    name: 'A101',
    searchUrl: (q) => `https://www.a101.com.tr/arama/?q=${encodeURIComponent(q)}`,
    resultSelector: 'a[href*="iphone"], .product-card a',
    delay: 3000,
    extractUrl: async (page, selector) => {
      const el = await page.$(selector);
      if (!el) return null;
      const href = await el.getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `https://www.a101.com.tr${href}`;
    },
    verify: async (page, family, storage) => {
      const title = await page.title();
      return title.toLowerCase().includes('iphone');
    },
  },
];

// ─── Gap Analysis ────────────────────────────────────────

function parseExistingUrls(): Map<string, Set<string>> {
  const content = fs.readFileSync(PRODUCT_URLS_PATH, 'utf8');
  const result = new Map<string, Set<string>>();

  const keyRe = /^\s+'([a-z0-9-]+)':\s*\{/gm;
  let match: RegExpExecArray | null;

  while ((match = keyRe.exec(content)) !== null) {
    const slug = match[1];
    const blockStart = match.index;
    const blockEnd = content.indexOf('},', blockStart);
    if (blockEnd === -1) continue;

    const block = content.substring(blockStart, blockEnd);
    const retailers = new Set<string>();

    for (const strategy of STRATEGIES) {
      if (block.includes(`${strategy.slug}:`)) {
        retailers.add(strategy.slug);
      }
    }
    result.set(slug, retailers);
  }

  return result;
}

function findGaps(
  filterFamily?: string,
  filterRetailer?: string,
): Gap[] {
  const existing = parseExistingUrls();
  const gaps: Gap[] = [];

  for (const family of FAMILIES) {
    if (filterFamily && !family.name.toLowerCase().includes(filterFamily.toLowerCase())) {
      continue;
    }
    for (const storage of family.storages) {
      for (const color of family.colors) {
        const slug = `${slugify(family.name)}-${storageLabel(storage).toLowerCase()}-${slugify(color)}`;
        const existingRetailers = existing.get(slug) ?? new Set();

        for (const strategy of STRATEGIES) {
          if (filterRetailer && strategy.slug !== filterRetailer) continue;
          if (!existingRetailers.has(strategy.slug)) {
            gaps.push({
              slug,
              family: family.name,
              storage,
              color,
              retailer: strategy.slug,
            });
          }
        }
      }
    }
  }

  return gaps;
}

// ─── Browser Discovery ──────────────────────────────────

async function delay(ms: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 1000);
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

async function discoverUrl(
  context: BrowserContext,
  gap: Gap,
  strategy: RetailerStrategy,
): Promise<DiscoveryResult | null> {
  const page = await context.newPage();

  try {
    // Build search query (Turkish for local retailers)
    const useTurkish = !['amazon'].includes(strategy.slug);
    const query = buildSearchQuery(gap.family, gap.storage, gap.color, useTurkish);

    console.log(`  🔍 [${strategy.name}] Searching: "${query}"`);

    // Navigate to search page
    await page.goto(strategy.searchUrl(query), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for results to load
    await page.waitForTimeout(2000);

    // Handle cookie consent banners
    for (const btnSelector of [
      'button:has-text("Kabul")',
      'button:has-text("kabul")',
      'button:has-text("Anladım")',
      '#onetrust-accept-btn-handler',
      '[data-testid="accept-cookies"]',
    ]) {
      const btn = await page.$(btnSelector);
      if (btn) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }

    // Try to find result
    const url = await strategy.extractUrl(page, strategy.resultSelector);
    if (!url) {
      console.log(`  ❌ [${strategy.name}] No results for ${gap.slug}`);
      return null;
    }

    // Navigate to product page and verify
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);

    const verified = await strategy.verify(page, gap.family, gap.storage, gap.color);
    if (!verified) {
      console.log(`  ⚠️  [${strategy.name}] Result didn't verify for ${gap.slug}: ${url}`);
      return { slug: gap.slug, retailer: gap.retailer, url, verified: false, timestamp: new Date().toISOString() };
    }

    // Clean the URL (remove tracking params)
    const cleanUrl = url.split('?')[0];
    console.log(`  ✅ [${strategy.name}] Found: ${cleanUrl}`);

    return {
      slug: gap.slug,
      retailer: gap.retailer,
      url: cleanUrl,
      verified: true,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  💥 [${strategy.name}] Error for ${gap.slug}: ${msg}`);
    return null;
  } finally {
    await page.close();
  }
}

// ─── File Update ─────────────────────────────────────────

function applyResults(results: DiscoveryResult[]): number {
  const verified = results.filter((r) => r.verified);
  if (verified.length === 0) return 0;

  let content = fs.readFileSync(PRODUCT_URLS_PATH, 'utf8');
  let applied = 0;

  // Group by slug
  const bySlug = new Map<string, DiscoveryResult[]>();
  for (const r of verified) {
    const list = bySlug.get(r.slug) ?? [];
    list.push(r);
    bySlug.set(r.slug, list);
  }

  for (const [slug, discoveries] of bySlug) {
    // Find the entry block for this slug
    const keyPattern = new RegExp(`'${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*\\{([^}]*)\\}`, 's');
    const match = keyPattern.exec(content);
    if (!match) {
      console.warn(`  ⚠️  Could not find entry for ${slug} in file`);
      continue;
    }

    const existingBlock = match[1];
    let newLines = existingBlock.trimEnd();

    for (const disc of discoveries) {
      // Skip if retailer already present
      if (existingBlock.includes(`${disc.retailer}:`)) continue;

      const strategy = STRATEGIES.find((s) => s.slug === disc.retailer);
      if (!strategy) continue;

      // Add trailing comma if needed
      if (newLines.trim() && !newLines.trimEnd().endsWith(',')) {
        newLines += ',';
      }
      newLines += `\n    ${disc.retailer}: '${disc.url}',`;
      applied++;
    }

    if (newLines !== existingBlock.trimEnd()) {
      content = content.replace(match[0], `'${slug}': {${newLines}\n  }`);
    }
  }

  if (applied > 0) {
    fs.writeFileSync(PRODUCT_URLS_PATH, content, 'utf8');
  }
  return applied;
}

// ─── Progress Report ─────────────────────────────────────

function printReport(gaps: Gap[], results: DiscoveryResult[]): void {
  const verified = results.filter((r) => r.verified);
  const unverified = results.filter((r) => !r.verified);

  console.log('\n═══════════════════════════════════════════');
  console.log('  CATALOG DISCOVERY REPORT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Gaps scanned:   ${gaps.length}`);
  console.log(`  URLs found:     ${results.length}`);
  console.log(`  Verified:       ${verified.length}`);
  console.log(`  Unverified:     ${unverified.length}`);
  console.log(`  Still missing:  ${gaps.length - verified.length}`);
  console.log('═══════════════════════════════════════════\n');

  if (unverified.length > 0) {
    console.log('Unverified results (review manually):');
    for (const r of unverified) {
      console.log(`  ${r.slug} → ${r.retailer}: ${r.url}`);
    }
    console.log('');
  }
}

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const headed = args.includes('--headed');
  const dryRun = args.includes('--dry-run');

  let filterFamily: string | undefined;
  let filterRetailer: string | undefined;

  const famIdx = args.indexOf('--family');
  if (famIdx !== -1 && args[famIdx + 1]) filterFamily = args[famIdx + 1];

  const retIdx = args.indexOf('--retailer');
  if (retIdx !== -1 && args[retIdx + 1]) filterRetailer = args[retIdx + 1];

  // ── Analyze gaps ──────────────────────────────────────
  const gaps = findGaps(filterFamily, filterRetailer);

  console.log(`\n📊 Found ${gaps.length} missing URLs`);
  if (gaps.length === 0) {
    console.log('🎉 Catalog is complete! No gaps to fill.');
    return;
  }

  // Group gaps for display
  const gapsByRetailer = new Map<string, number>();
  for (const g of gaps) {
    gapsByRetailer.set(g.retailer, (gapsByRetailer.get(g.retailer) ?? 0) + 1);
  }
  console.log('Gaps per retailer:');
  for (const [ret, count] of [...gapsByRetailer.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ret}: ${count}`);
  }
  console.log('');

  // ── Launch browser ────────────────────────────────────
  const browser: Browser = await chromium.launch({
    headless: !headed,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1366, height: 768 },
  });

  const results: DiscoveryResult[] = [];

  try {
    // Process gaps grouped by retailer to minimize context-switching
    const gapsGrouped = new Map<string, Gap[]>();
    for (const g of gaps) {
      const list = gapsGrouped.get(g.retailer) ?? [];
      list.push(g);
      gapsGrouped.set(g.retailer, list);
    }

    for (const [retailerSlug, retailerGaps] of gapsGrouped) {
      const strategy = STRATEGIES.find((s) => s.slug === retailerSlug);
      if (!strategy) continue;

      console.log(`\n🏪 ${strategy.name} — ${retailerGaps.length} gaps to fill`);

      for (const gap of retailerGaps) {
        const result = await discoverUrl(context, gap, strategy);
        if (result) results.push(result);

        // Respect rate limits
        await delay(strategy.delay);
      }
    }
  } finally {
    await browser.close();
  }

  // ── Save results ──────────────────────────────────────
  // Merge with existing results file
  let existingResults: DiscoveryResult[] = [];
  if (fs.existsSync(RESULTS_PATH)) {
    try {
      existingResults = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    } catch { /* ignore parse errors */ }
  }

  const allResults = [...existingResults, ...results];
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n💾 Results saved to ${RESULTS_PATH}`);

  // ── Apply to product-urls.ts ──────────────────────────
  if (!dryRun && results.length > 0) {
    const applied = applyResults(results);
    console.log(`✏️  Applied ${applied} new URLs to product-urls.ts`);
  } else if (dryRun) {
    console.log('🔒 Dry run — no changes written to product-urls.ts');
  }

  // ── Report ────────────────────────────────────────────
  printReport(gaps, results);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
