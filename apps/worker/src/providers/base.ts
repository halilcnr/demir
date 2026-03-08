import * as cheerio from 'cheerio';
import type { RetailerProvider, ScrapedProduct } from '@repo/shared';
import { parseTurkishPrice } from '@repo/shared';
import {
  ProviderBlockedError,
  RetryableProviderError,
  RetryableNetworkError,
  RateLimitedError,
  ListingNotFoundError,
  ParseError,
  StrategyExhaustedError,
} from '../errors';

// ─── Strategy Types ─────────────────────────────────────────────

export interface ScrapeStrategy {
  name: string;
  run: (html: string, url: string, $: cheerio.CheerioAPI) => ScrapedProduct | null;
}

export interface ScrapeAttemptResult {
  success: boolean;
  strategyUsed: string;
  responseTimeMs: number;
  wasFallbackUsed: boolean;
  parseConfidence: 'high' | 'medium' | 'low';
  product: ScrapedProduct | null;
  failures: { strategy: string; error: string }[];
}

// ─── Per-provider pacing config ─────────────────────────────────

export interface ProviderPacing {
  /** Base delay between requests in ms */
  baseDelayMs: number;
  /** Max random jitter added to delay in ms */
  jitterMs: number;
  /** Max concurrent requests (soft limit via pacing) */
  concurrencyLimit: number;
}

const DEFAULT_PACING: ProviderPacing = {
  baseDelayMs: 1500,
  jitterMs: 1000,
  concurrencyLimit: 1,
};

// ─── Base Provider ──────────────────────────────────────────────

export abstract class BaseProvider implements RetailerProvider {
  abstract retailerSlug: string;
  abstract retailerName: string;

  /** Override in subclass for provider-specific pacing */
  protected pacing: ProviderPacing = DEFAULT_PACING;

  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ];

  protected get userAgent(): string {
    return BaseProvider.USER_AGENTS[Math.floor(Math.random() * BaseProvider.USER_AGENTS.length)];
  }

  /**
   * Subclasses must return their ordered strategy array.
   * Strategies are tried in order; first success wins.
   */
  protected abstract getStrategies(): ScrapeStrategy[];

  /**
   * Fetches a page with browser-like headers and typed error mapping.
   * - 403 → ProviderBlockedError
   * - 404 → ListingNotFoundError
   * - 429 → RateLimitedError
   * - 5xx → RetryableProviderError
   * - network/timeout → RetryableNetworkError
   */
  protected async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'DNT': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (res.status === 403) {
        throw new ProviderBlockedError(this.retailerSlug, url);
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
        throw new RateLimitedError(this.retailerSlug, url, retryAfterMs);
      }

      if (res.status === 404) {
        throw new ListingNotFoundError(this.retailerSlug, url);
      }

      if (res.status >= 500) {
        throw new RetryableProviderError(this.retailerSlug, res.status, url);
      }

      if (!res.ok) {
        throw new RetryableProviderError(this.retailerSlug, res.status, url);
      }

      return await res.text();
    } catch (err) {
      if (
        err instanceof ProviderBlockedError ||
        err instanceof ListingNotFoundError ||
        err instanceof RetryableProviderError ||
        err instanceof RateLimitedError
      ) {
        throw err;
      }
      if (err instanceof DOMException || (err instanceof Error && err.name === 'AbortError')) {
        throw new RetryableNetworkError(this.retailerSlug, url, 'timeout');
      }
      if (err instanceof TypeError && (err as Error).message?.includes('fetch')) {
        throw new RetryableNetworkError(this.retailerSlug, url, 'network');
      }
      throw new RetryableNetworkError(
        this.retailerSlug,
        url,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Sleep with configurable provider-specific jitter */
  protected async pacedDelay(): Promise<void> {
    const jitter = Math.floor(Math.random() * this.pacing.jitterMs);
    const total = this.pacing.baseDelayMs + jitter;
    return new Promise((r) => setTimeout(r, total));
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Status-aware retry wrapper with exponential backoff:
   * - ProviderBlockedError → immediate throw (no retry)
   * - ListingNotFoundError → immediate throw (no retry)
   * - RateLimitedError → backoff with hint from Retry-After
   * - RetryableProviderError / RetryableNetworkError → exponential backoff
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 2,
    baseDelayMs = 3000,
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Non-retryable errors — propagate immediately
        if (err instanceof ProviderBlockedError || err instanceof ListingNotFoundError) {
          throw err;
        }

        if (attempt < maxRetries) {
          let waitMs: number;
          if (err instanceof RateLimitedError && err.retryAfterMs) {
            waitMs = Math.min(err.retryAfterMs, 30_000);
          } else {
            waitMs = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
          }
          console.warn(
            `[${this.retailerSlug}] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${waitMs}ms...`,
          );
          await this.delay(waitMs);
        }
      }
    }
    throw lastError;
  }

  abstract search(query: string): Promise<ScrapedProduct[]>;

  /**
   * Multi-strategy scrape: fetches the page once, then runs strategies in order.
   * Returns first successful result or throws StrategyExhaustedError.
   */
  async scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
    const startMs = Date.now();
    const html = await this.withRetry(() => this.fetchPage(url));
    const fetchMs = Date.now() - startMs;
    const $ = cheerio.load(html);

    const strategies = this.getStrategies();
    const failures: { strategy: string; error: string }[] = [];

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      try {
        const result = strategy.run(html, url, $);
        if (result && result.price > 0) {
          const confidence: 'high' | 'medium' | 'low' = i === 0 ? 'high' : i === 1 ? 'medium' : 'low';
          if (i > 0) {
            console.log(
              `[${this.retailerSlug}] strategy "${strategy.name}" succeeded (fallback #${i}, ${fetchMs}ms) — ${url}`,
            );
          }
          // Attach strategy metadata
          (result as ScrapedProduct & { _meta?: Record<string, unknown> })._meta = {
            strategyUsed: strategy.name,
            responseTimeMs: fetchMs,
            wasFallbackUsed: i > 0,
            parseConfidence: confidence,
          };
          return result;
        }
        failures.push({ strategy: strategy.name, error: 'returned null or invalid price' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ strategy: strategy.name, error: msg });
      }
    }

    // All strategies failed
    console.warn(
      `[${this.retailerSlug}] all ${strategies.length} strategies failed — ${url}: ${failures.map((f) => `${f.strategy}(${f.error})`).join(', ')}`,
    );
    return null;
  }

  // ─── Shared Parsing Utilities ─────────────────────────────────

  /**
   * Extract product data from JSON-LD (schema.org) script tags.
   */
  protected extractJsonLd(html: string): {
    name: string;
    price: number;
    currency: string;
    inStock: boolean;
    image?: string;
  } | null {
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < scripts.length; i++) {
      try {
        const text = $(scripts[i]).html();
        if (!text) continue;
        const raw = JSON.parse(text);

        // Collect candidate Product objects from various structures
        const candidates: Record<string, unknown>[] = [];

        if (Array.isArray(raw)) {
          // Array of LD objects
          for (const item of raw) {
            if (item?.['@type'] === 'Product' || item?.['@type'] === 'ProductGroup') {
              candidates.push(item);
            }
          }
        } else if (raw?.['@graph'] && Array.isArray(raw['@graph'])) {
          // @graph wrapper (common pattern)
          for (const item of raw['@graph']) {
            if (item?.['@type'] === 'Product' || item?.['@type'] === 'ProductGroup') {
              candidates.push(item);
            }
          }
        } else if (raw?.['@type'] === 'Product' || raw?.['@type'] === 'ProductGroup') {
          candidates.push(raw);
        }

        for (const data of candidates) {
          const name: string = (data as any).name || '';
          if (!name) continue;

          const offers = (data as any).offers;
          if (!offers) continue;

          let price: number | undefined;
          let currency = 'TRY';
          let inStock = true;

          const extractFromOffer = (offer: Record<string, any>): boolean => {
            // Handle AggregateOffer with lowPrice/highPrice
            if (offer['@type'] === 'AggregateOffer') {
              const lp = parseFloat(offer.lowPrice);
              if (!isNaN(lp) && lp > 0) {
                price = lp;
                currency = offer.priceCurrency || currency;
                inStock = offer.availability !== 'https://schema.org/OutOfStock';
                return true;
              }
              const hp = parseFloat(offer.highPrice);
              if (!isNaN(hp) && hp > 0) {
                price = hp;
                currency = offer.priceCurrency || currency;
                return true;
              }
              // AggregateOffer may contain nested offers
              if (offer.offers && Array.isArray(offer.offers)) {
                for (const inner of offer.offers) {
                  if (extractFromOffer(inner)) return true;
                }
              }
              return false;
            }
            // Standard Offer
            const p = parseFloat(offer.price);
            if (!isNaN(p) && p > 0) {
              price = p;
              currency = offer.priceCurrency || currency;
              inStock = offer.availability !== 'https://schema.org/OutOfStock';
              return true;
            }
            return false;
          };

          if (Array.isArray(offers)) {
            for (const offer of offers) {
              if (extractFromOffer(offer)) break;
            }
          } else {
            extractFromOffer(offers);
          }

          if (!price || isNaN(price) || price <= 0) continue;

          const image = typeof (data as any).image === 'string'
            ? (data as any).image
            : (data as any).image?.contentUrl?.[0] || (data as any).image?.url || undefined;

          return { name, price, currency, inStock, image };
        }
      } catch {
        // Invalid JSON, skip
      }
    }
    return null;
  }

  /**
   * Extract product data from Open Graph / meta tags.
   */
  protected extractMetaTags($: cheerio.CheerioAPI): {
    name: string | null;
    price: number | null;
    image: string | null;
  } {
    const name = $('meta[property="og:title"]').attr('content')?.trim()
      || $('meta[name="title"]').attr('content')?.trim()
      || null;
    const priceStr = $('meta[property="product:price:amount"]').attr('content')?.trim()
      || $('meta[property="og:price:amount"]').attr('content')?.trim()
      || null;
    const image = $('meta[property="og:image"]').attr('content')?.trim() || null;

    let price: number | null = null;
    if (priceStr) {
      price = this.parseTurkishPrice(priceStr);
    }

    return { name, price, image };
  }

  /**
   * Extract embedded JSON data from script tags (non-JSON-LD).
   * Looks for __NEXT_DATA__, window.__INITIAL_STATE__, etc.
   */
  protected extractEmbeddedJson(html: string, patterns: RegExp[]): Record<string, unknown> | null {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        try {
          return JSON.parse(match[1]);
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  /**
   * Parse a Turkish-formatted price string correctly.
   * Delegates to the shared parseTurkishPrice utility.
   */
  protected parseTurkishPrice(text: string): number | null {
    return parseTurkishPrice(text);
  }
}
