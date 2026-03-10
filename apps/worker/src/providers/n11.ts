import * as cheerio from 'cheerio';
import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeIPhoneModel, parseTurkishPrice as sharedParseTurkishPrice } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class N11Provider extends BaseProvider {
  retailerSlug = 'n11';
  retailerName = 'N11';

  protected pacing = { baseDelayMs: 2200, jitterMs: 1500, concurrencyLimit: 1 };

  protected getStrategies(): ScrapeStrategy[] {
    return [
      {
        name: 'jsonld',
        run: (html, url, $) => {
          const ld = this.extractJsonLd(html);
          if (!ld) return null;
          const parsed = normalizeIPhoneModel(ld.name);
          if (!parsed) return null;
          const seller = $('.sallerName a').text().trim() || undefined;
          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: ld.name,
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price: ld.price,
            currency: 'TRY',
            sellerName: seller,
            imageUrl: ld.image,
            stockStatus: ld.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
      {
        name: 'css-selectors',
        run: (_html, url, $) => {
          const title = $('h1.proName').text().trim()
            || $('h1.product-name').text().trim();
          const priceText = $('.newPrice ins').text().trim()
            || $('.newPrice').text().trim()
            || $('#unf-price').text().trim();

          if (!title || !priceText) return null;

          const parsed = normalizeIPhoneModel(title);
          if (!parsed) return null;

          const price = this.parseTurkishPrice(priceText);
          if (!price) return null;

          const seller = $('.sallerName a').text().trim() || undefined;

          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: title,
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price,
            currency: 'TRY',
            sellerName: seller,
            stockStatus: $('.unf-p-summary-out-of-stock').length ? 'OUT_OF_STOCK' : 'IN_STOCK',
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
        name: 'embedded-json',
        run: (html, url, $) => {
          // N11 sometimes embeds product data in inline scripts (window.__PRODUCT_DATA__, dataLayer, etc.)
          const scripts = $('script:not([src])');
          for (let i = 0; i < scripts.length; i++) {
            const text = $(scripts[i]).html() || '';

            // Pattern 1: window.__PRODUCT_DATA__ or similar object assignment
            const objMatch = text.match(/(?:window\.__PRODUCT_DATA__|window\.productData|var\s+productData)\s*=\s*(\{[\s\S]*?\});/);
            if (objMatch) {
              try {
                const data = JSON.parse(objMatch[1]);
                const title = data.name || data.title || data.productName;
                const price = data.price || data.salePrice || data.discountedPrice;
                if (title && price) {
                  const parsed = normalizeIPhoneModel(title);
                  if (!parsed) continue;
                  const numPrice = typeof price === 'number' ? price : sharedParseTurkishPrice(String(price));
                  if (!numPrice) continue;
                  return {
                    retailerSlug: this.retailerSlug,
                    retailerName: this.retailerName,
                    rawTitle: title,
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
              } catch { /* not valid JSON */ }
            }

            // Pattern 2: dataLayer push with ecommerce data
            const dlMatch = text.match(/dataLayer\.push\((\{[\s\S]*?"ecommerce"[\s\S]*?\})\)/);
            if (dlMatch) {
              try {
                const dl = JSON.parse(dlMatch[1]);
                const items = dl.ecommerce?.items || dl.ecommerce?.detail?.products || [];
                const item = items[0];
                if (item?.name && item?.price) {
                  const parsed = normalizeIPhoneModel(item.name);
                  if (!parsed) continue;
                  const numPrice = typeof item.price === 'number' ? item.price : sharedParseTurkishPrice(String(item.price));
                  if (!numPrice) continue;
                  return {
                    retailerSlug: this.retailerSlug,
                    retailerName: this.retailerName,
                    rawTitle: item.name,
                    normalizedModel: parsed.model,
                    normalizedColor: parsed.color,
                    normalizedStorageGb: parsed.storageGb,
                    price: numPrice,
                    currency: 'TRY',
                    sellerName: item.brand || undefined,
                    stockStatus: 'IN_STOCK',
                    productUrl: url,
                    fetchedAt: new Date(),
                  };
                }
              } catch { /* not valid JSON */ }
            }
          }
          return null;
        },
      },
      {
        name: 'regex-fallback',
        run: (html, url) => {
          // Last-resort: extract data from raw HTML using regex patterns
          const titleMatch = html.match(/<h1[^>]*class="[^"]*proName[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
            || html.match(/<h1[^>]*>([\s\S]*?iPhone[\s\S]*?)<\/h1>/);
          if (!titleMatch) return null;
          const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

          const parsed = normalizeIPhoneModel(title);
          if (!parsed) return null;

          // Try multiple price patterns
          const pricePatterns = [
            /"price"\s*:\s*"?([\d.,]+)"?/,
            /class="[^"]*newPrice[^"]*"[\s\S]*?>([\d.,]+\s*TL)/,
            /data-price="([\d.,]+)"/,
            /content="([\d.,]+)"[^>]*property="product:price:amount"/,
            /property="product:price:amount"[^>]*content="([\d.,]+)"/,
          ];

          let price: number | null = null;
          for (const pattern of pricePatterns) {
            const m = html.match(pattern);
            if (m) {
              price = sharedParseTurkishPrice(m[1]);
              if (price && price > 1000) break;
              price = null;
            }
          }
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
            stockStatus: 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
    ];
  }

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.n11.com/arama?q=${encodeURIComponent(query)}`;
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('.columnContent .pro').each((_, el) => {
      try {
        const title = $(el).find('.productName').text().trim();
        const priceText = $(el).find('.newPrice ins').text().trim()
          || $(el).find('.newPrice').text().trim();
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
          productUrl: href.startsWith('http') ? href : `https://www.n11.com${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }
}
