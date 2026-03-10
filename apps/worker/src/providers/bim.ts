import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class BimProvider extends BaseProvider {
  retailerSlug = 'bim';
  retailerName = 'BİM';

  protected pacing = { baseDelayMs: 2500, jitterMs: 1500, concurrencyLimit: 1 };

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
        name: 'css-selectors',
        run: (_html, url, $) => {
          // BİM online product page selectors
          const title = $('h1.product-title, h1.product-name, .product-detail h1, [class*="productName"]').first().text().trim()
            || $('h1').first().text().trim();

          const priceText = $('[class*="product-price"] .current, .price-new, .product-price .discounted-price, [class*="currentPrice"]').first().text().trim()
            || $('[class*="product-price"], [class*="Price"], .price').first().text().trim();

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
            stockStatus: 'IN_STOCK',
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
        run: (html, url) => {
          const data = this.extractEmbeddedJson(html, [
            /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
            /window\.__NEXT_DATA__\s*=\s*({.+?});/s,
            /window\.__NUXT__\s*=\s*({.+?});/s,
          ]);
          if (!data) return null;

          const product = (data as Record<string, any>).product
            ?? (data as Record<string, any>).props?.pageProps?.product
            ?? (data as Record<string, any>).data?.product;
          if (!product) return null;

          const name = product.name || product.title;
          if (!name) return null;
          const parsed = normalizeIPhoneModel(name);
          if (!parsed) return null;

          const rawPrice = product.price || product.salePrice || product.currentPrice;
          const numPrice = typeof rawPrice === 'number' ? rawPrice : this.parseTurkishPrice(String(rawPrice));
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
            stockStatus: 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
      {
        name: 'regex-fallback',
        run: (html, url) => {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (!titleMatch) return null;
          const parsed = normalizeIPhoneModel(titleMatch[1]);
          if (!parsed) return null;
          const priceMatch = html.match(/"price"\s*:\s*"?(\d[\d.,]+)"?/i);
          if (!priceMatch) return null;
          const price = this.parseTurkishPrice(priceMatch[1]);
          if (!price) return null;
          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: titleMatch[1].trim(),
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

  async search(_query: string): Promise<ScrapedProduct[]> {
    return [];
  }
}
