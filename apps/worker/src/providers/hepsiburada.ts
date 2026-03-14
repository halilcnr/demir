import * as cheerio from 'cheerio';
import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';
import { ListingNotFoundError } from '../errors';

export class HepsiburadaProvider extends BaseProvider {
  retailerSlug = 'hepsiburada';
  retailerName = 'Hepsiburada';

  protected pacing = { baseDelayMs: 1800, jitterMs: 1200, concurrencyLimit: 1 };

  /**
   * Override: Try Hepsiburada's internal product detail API first,
   * then fall back to HTML-based strategies.
   */
  async scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
    // Extract product code from URL (e.g. -p-HBCV00000ODHHF)
    const codeMatch = url.match(/-p-([A-Za-z0-9]+)(?:\?|$)/);
    if (codeMatch) {
      try {
        const apiResult = await this.scrapeViaApi(codeMatch[1], url);
        if (apiResult) {
          console.log(`[hepsiburada] API strategy succeeded for ${url}`);
          return apiResult;
        }
      } catch (err) {
        console.warn(`[hepsiburada] API strategy error:`, err instanceof Error ? err.message : err);
      }
    }

    // Fallback to HTML-based strategies (jsonld, css-selectors, meta-tags, next-data, regex)
    const result = await super.scrapeProductPage(url);

    // Detect delisted products: HB returns 200 with a page that has no product data
    // If API failed AND all HTML strategies failed, this listing is likely gone
    if (!result && codeMatch) {
      // Verify by checking if the page is a "not found" type page
      // (API was tried and failed + all 5 HTML strategies returned null = strong signal)
      console.warn(`[hepsiburada] Product likely delisted (API + all HTML strategies failed): ${url}`);
      throw new ListingNotFoundError(this.retailerSlug, url);
    }

    return result;
  }

  /**
   * Try Hepsiburada's product detail API directly.
   */
  private async scrapeViaApi(productCode: string, originalUrl: string): Promise<ScrapedProduct | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    // Try multiple known HB API patterns
    const apiUrls = [
      `https://www.hepsiburada.com/product-detail/api/productdetails/${productCode}`,
      `https://www.hepsiburada.com/api/product/${productCode}`,
    ];

    try {
      for (const apiUrl of apiUrls) {
        try {
          const res = await fetch(apiUrl, {
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'tr-TR,tr;q=0.9',
              'Referer': 'https://www.hepsiburada.com/',
              'Origin': 'https://www.hepsiburada.com',
            },
            signal: controller.signal,
          });

          if (!res.ok) continue;

          const data = (await res.json()) as Record<string, unknown>;
          const parsed = this.parseApiResponse(data, originalUrl);
          if (parsed) return parsed;
        } catch {
          continue;
        }
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseApiResponse(data: Record<string, unknown>, url: string): ScrapedProduct | null {
    // Try multiple known response structures
    const obj = data as Record<string, any>;
    const name = obj?.product?.name || obj?.name || obj?.productDetail?.name
      || obj?.listing?.name || obj?.detail?.name;
    const rawPrice = obj?.product?.price || obj?.price || obj?.productDetail?.price
      || obj?.listing?.price || obj?.product?.currentPrice || obj?.currentPrice
      || obj?.detail?.price || obj?.product?.salePrice;

    if (!name || !rawPrice) return null;

    const parsed = normalizeIPhoneModel(String(name));
    if (!parsed) return null;

    const numPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice));
    if (!numPrice || numPrice <= 0) return null;

    return {
      retailerSlug: this.retailerSlug,
      retailerName: this.retailerName,
      rawTitle: String(name),
      normalizedModel: parsed.model,
      normalizedColor: parsed.color,
      normalizedStorageGb: parsed.storageGb,
      price: numPrice,
      currency: 'TRY',
      stockStatus: 'IN_STOCK',
      productUrl: url,
      fetchedAt: new Date(),
    };
  }

  protected getStrategies(): ScrapeStrategy[] {
    return [
      {
        name: 'jsonld',
        run: (html, url) => {
          const ld = this.extractJsonLd(html);
          if (!ld) return null;
          const parsed = normalizeIPhoneModel(ld.name);
          if (!parsed) return null;
          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: ld.name,
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price: ld.price,
            currency: 'TRY',
            imageUrl: ld.image,
            stockStatus: ld.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
      {
        name: 'next-data',
        run: (_html, url, $) => {
          const nextDataScript = $('#__NEXT_DATA__').html();
          if (!nextDataScript) return null;

          try {
            const data = JSON.parse(nextDataScript);
            // Navigate possible Hepsiburada __NEXT_DATA__ structures
            const product = data?.props?.pageProps?.product
              || data?.props?.pageProps?.productDetail
              || data?.props?.pageProps?.data?.product
              || data?.props?.pageProps?.initialState?.product;

            if (!product) return null;

            const name = product.name || product.title || product.productName;
            if (!name) return null;

            const parsed = normalizeIPhoneModel(name);
            if (!parsed) return null;

            const price = product.price || product.currentPrice || product.salePrice
              || product.listing?.price || product.offers?.price;
            const numPrice = typeof price === 'number' ? price : parseFloat(String(price));
            if (!numPrice || numPrice <= 0) return null;

            return {
              retailerSlug: this.retailerSlug,
              retailerName: this.retailerName,
              rawTitle: name,
              normalizedModel: parsed.model,
              normalizedColor: parsed.color,
              normalizedStorageGb: parsed.storageGb,
              price: numPrice,
              currency: 'TRY',
              imageUrl: product.image || product.imageUrl || product.images?.[0],
              stockStatus: product.inStock !== false ? 'IN_STOCK' : 'OUT_OF_STOCK',
              productUrl: url,
              fetchedAt: new Date(),
            };
          } catch {
            return null;
          }
        },
      },
      {
        name: 'css-selectors',
        run: (_html, url, $) => {
          const title = $('h1[data-test-id="product-name"]').text().trim()
            || $('h1#product-name').text().trim()
            || $('[data-test-id="product-name-text"]').text().trim()
            || $('h1.product-name').text().trim()
            || $('h1').first().text().trim();

          const priceText = $('[data-test-id="price-current-price"]').text().trim()
            || $('[data-test-id="checkout-price"]').text().trim()
            || $('span[data-bind="markupText:\'currentPriceBeforePoint\'"]').text().trim()
            || $('[id="offering-price"] .price-value').text().trim()
            || $('.product-price').text().trim();

          if (!title || !priceText) return null;

          const parsed = normalizeIPhoneModel(title);
          if (!parsed) return null;

          const price = this.parseTurkishPrice(priceText);
          if (!price) return null;

          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: title,
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price,
            currency: 'TRY',
            stockStatus: $('.out-of-stock-text').length ? 'OUT_OF_STOCK' : 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
      {
        name: 'meta-tags',
        run: (_html, url, $) => {
          const meta = this.extractMetaTags($);
          if (!meta.name || !meta.price) return null;

          const parsed = normalizeIPhoneModel(meta.name);
          if (!parsed) return null;

          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: meta.name,
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price: meta.price,
            currency: 'TRY',
            imageUrl: meta.image ?? undefined,
            stockStatus: 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
      {
        name: 'regex-embedded',
        run: (html, url) => {
          // Last resort: search for price data anywhere in the HTML/script tags
          const titleMatch = html.match(/"name"\s*:\s*"([^"]*[iI]phone[^"]*)"/);
          if (!titleMatch) return null;

          const parsed = normalizeIPhoneModel(titleMatch[1]);
          if (!parsed) return null;

          const pricePatterns = [
            /"price"\s*:\s*"?(\d[\d.,]+)"?/,
            /"currentPrice"\s*:\s*"?(\d[\d.,]+)"?/,
            /"salePrice"\s*:\s*"?(\d[\d.,]+)"?/,
            /"lowPrice"\s*:\s*"?(\d[\d.,]+)"?/,
            /"highPrice"\s*:\s*"?(\d[\d.,]+)"?/,
            /"discountedPrice"\s*:\s*"?(\d[\d.,]+)"?/,
            /"sellingPrice"\s*:\s*"?(\d[\d.,]+)"?/,
            /data-price="(\d[\d.,]+)"/,
            /price['"]\s*:\s*(\d{4,})/,
          ];

          let price: number | null = null;
          for (const pattern of pricePatterns) {
            const match = html.match(pattern);
            if (match) {
              price = this.parseTurkishPrice(match[1]);
              if (price && price > 1000) break;
              price = null;
            }
          }

          if (!price) return null;

          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: titleMatch[1],
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price,
            currency: 'TRY',
            stockStatus: 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
    ];
  }

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`;
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('[data-test-id="product-card-item"]').each((_, el) => {
      try {
        const title = $(el).find('[data-test-id="product-card-name"]').text().trim();
        const priceText = $(el).find('[data-test-id="price-current-price"]').text().trim();
        const href = $(el).find('a').attr('href');

        if (!title || !priceText || !href) return;

        const parsed = normalizeIPhoneModel(title);
        if (!parsed) return;

        const price = this.parseTurkishPrice(priceText);
        if (!price || price < 1000) return;

        results.push({
          retailerSlug: this.retailerSlug,
          retailerName: this.retailerName,
          rawTitle: title,
          normalizedModel: parsed.model,
          normalizedColor: parsed.color,
          normalizedStorageGb: parsed.storageGb,
          price,
          currency: 'TRY',
          stockStatus: 'IN_STOCK',
          productUrl: href.startsWith('http') ? href : `https://www.hepsiburada.com${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }
}
