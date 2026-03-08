import type { RetailerProvider, ScrapedProduct } from '@repo/shared';
import {
  ProviderBlockedError,
  RetryableProviderError,
  ListingNotFoundError,
} from '../errors';

/**
 * Base adapter: Tüm retailer provider'lar bu sınıfı extend eder.
 * Ortak HTTP logic, rate limiting, retry, hata yönetimi burada.
 */
export abstract class BaseProvider implements RetailerProvider {
  abstract retailerSlug: string;
  abstract retailerName: string;

  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  ];

  protected get userAgent(): string {
    return BaseProvider.USER_AGENTS[Math.floor(Math.random() * BaseProvider.USER_AGENTS.length)];
  }

  /**
   * Fetches a page and throws typed errors based on HTTP status:
   * - 403 → ProviderBlockedError (do NOT retry)
   * - 404 → ListingNotFoundError (mark listing invalid)
   * - 5xx → RetryableProviderError (retry with backoff)
   * - network/timeout → plain Error (retry)
   */
  protected async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (res.status === 403) {
        throw new ProviderBlockedError(this.retailerSlug, url);
      }

      if (res.status === 404) {
        throw new ListingNotFoundError(this.retailerSlug, url);
      }

      if (res.status >= 500) {
        throw new RetryableProviderError(this.retailerSlug, res.status, url);
      }

      if (!res.ok) {
        throw new Error(`[${this.retailerSlug}] HTTP ${res.status} — ${url}`);
      }

      return await res.text();
    } catch (err) {
      // Re-throw our typed errors as-is
      if (
        err instanceof ProviderBlockedError ||
        err instanceof ListingNotFoundError ||
        err instanceof RetryableProviderError
      ) {
        throw err;
      }
      // Network / abort errors
      if (err instanceof DOMException || (err instanceof Error && err.name === 'AbortError')) {
        throw new Error(`[${this.retailerSlug}] timeout — ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected async delay(ms: number = 1500): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Status-aware retry wrapper:
   * - ProviderBlockedError → immediate throw (no retry)
   * - ListingNotFoundError → immediate throw (no retry)
   * - RetryableProviderError / network errors → exponential backoff
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 2000
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
          const waitMs = baseDelayMs * Math.pow(2, attempt);
          console.warn(
            `[${this.retailerSlug}] Attempt ${attempt + 1} failed, retrying in ${waitMs}ms...`
          );
          await this.delay(waitMs);
        }
      }
    }
    throw lastError;
  }

  abstract search(query: string): Promise<ScrapedProduct[]>;
  abstract scrapeProductPage(url: string): Promise<ScrapedProduct | null>;
}
