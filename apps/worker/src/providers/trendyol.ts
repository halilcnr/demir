import * as cheerio from 'cheerio';
import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class TrendyolProvider extends BaseProvider {
  retailerSlug = 'trendyol';
  retailerName = 'Trendyol';

  protected pacing = { baseDelayMs: 2000, jitterMs: 1500, concurrencyLimit: 1 };

  protected getStrategies(): ScrapeStrategy[] {
    return [
      {
        name: 'jsonld',
        run: (html, url, $) => {
          const ld = this.extractJsonLd(html);
          if (!ld) return null;
          const parsed = normalizeIPhoneModel(ld.name);
          if (!parsed) return null;
          const seller = $('.seller-name-text').text().trim() || undefined;
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
          const title = $('h1[data-testid="product-title"]').text().trim()
            || ($('h1.pr-new-br span').text().trim() + ' ' + $('h1.pr-new-br .product-detail-name').text().trim()).trim();

          const priceText = $('span.discounted').first().text().trim()
            || $('span.prc-dsc').text().trim()
            || $('span.prc-slg').text().trim();

          if (!title || !priceText) return null;

          const parsed = normalizeIPhoneModel(title);
          if (!parsed) return null;

          const price = this.parseTurkishPrice(priceText);
          if (!price) return null;

          const seller = $('.seller-name-text').text().trim() || undefined;

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
            stockStatus: $('.out-of-stock-container').length ? 'OUT_OF_STOCK' : 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
      {
        name: 'embedded-json',
        run: (html, url) => {
          const data = this.extractEmbeddedJson(html, [
            /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s,
            /window\.__SEARCH_INITIAL_STATE__\s*=\s*({.+?});/s,
          ]);
          if (!data) return null;

          const product = (data as Record<string, unknown>).product as Record<string, unknown> | undefined;
          if (!product) return null;

          const name = (product.name as string) || (product.title as string) || '';
          if (!name) return null;

          const parsed = normalizeIPhoneModel(name);
          if (!parsed) return null;

          const priceRaw = (product.price as Record<string, unknown>)?.sellingPrice
            ?? (product.price as Record<string, unknown>)?.originalPrice
            ?? product.price;
          const price = typeof priceRaw === 'number' ? priceRaw : this.parseTurkishPrice(String(priceRaw));
          if (!price || price <= 0) return null;

          return {
            retailerSlug: this.retailerSlug,
            retailerName: this.retailerName,
            rawTitle: name,
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
    const url = `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`;
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('.p-card-wrppr').each((_, el) => {
      try {
        const title = $(el).find('.prdct-desc-cntnr-name').text().trim()
          || $(el).find('.product-desc-sub-text').text().trim();
        const priceText = $(el).find('.prc-box-dscntd').text().trim()
          || $(el).find('.prc-box-sllng').text().trim();
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
          productUrl: href.startsWith('http') ? href : `https://www.trendyol.com${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }
}
