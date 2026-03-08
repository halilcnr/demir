import type { RetailerProvider, ScrapedProduct } from '@repo/shared';

/**
 * Base adapter: Tüm retailer provider'lar bu sınıfı extend eder.
 * Ortak HTTP logic, rate limiting, retry, hata yönetimi burada.
 */
export abstract class BaseProvider implements RetailerProvider {
  abstract retailerSlug: string;
  abstract retailerName: string;

  protected userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  protected async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected async delay(ms: number = 1500): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Retry wrapper with exponential backoff */
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
