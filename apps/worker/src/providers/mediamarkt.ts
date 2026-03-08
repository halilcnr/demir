import * as cheerio from 'cheerio';
import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class MediaMarktProvider extends BaseProvider {
  retailerSlug = 'mediamarkt';
  retailerName = 'MediaMarkt';

  protected pacing = { baseDelayMs: 2500, jitterMs: 2000, concurrencyLimit: 1 };

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
          const title = $('h1[data-test="product-title"], h1.product-title, h1.product-name').first().text().trim()
            || $('[class*="ProductHeader"] h1, [class*="product-detail"] h1').first().text().trim()
            || $('h1').first().text().trim();

          const priceText = $('[data-test="product-price"], [class*="product-price"] .price, [class*="Price"] [class*="current"]').first().text().trim()
            || $('[class*="price-box"] [class*="price"], .product-price .price').first().text().trim();

          if (!title || !priceText) return null;
          const parsed = normalizeIPhoneModel(title);
          if (!parsed) return null;
          const price = this.parseTurkishPrice(priceText);
          if (!price) return null;

          const inStock = $('[class*="out-of-stock"], [class*="OutOfStock"]').length === 0;

          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: title,
            normalizedModel: parsed.model,
            normalizedColor: parsed.color,
            normalizedStorageGb: parsed.storageGb,
            price,
            currency: 'TRY',
            stockStatus: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
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
            /window\.__PRELOADED_STATE__\s*=\s*({.+?});/s,
            /window\.dataLayer\.push\(({.+?})\)/s,
          ]);
          if (!data) return null;

          const product = (data as Record<string, any>).product
            ?? (data as Record<string, any>).ecommerce?.detail?.products?.[0];
          if (!product) return null;

          const name = product.name || product.title;
          if (!name) return null;
          const parsed = normalizeIPhoneModel(name);
          if (!parsed) return null;

          const rawPrice = product.price || product.salePrice;
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
