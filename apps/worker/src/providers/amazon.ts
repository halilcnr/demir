import * as cheerio from 'cheerio';
import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeProductTitle } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class AmazonProvider extends BaseProvider {
  retailerSlug = 'amazon';
  retailerName = 'Amazon';

  protected pacing = { baseDelayMs: 2500, jitterMs: 2000, concurrencyLimit: 1 };

  protected getStrategies(): ScrapeStrategy[] {
    return [
      {
        name: 'jsonld',
        run: (html, url, $) => {
          const ld = this.extractJsonLd(html);
          if (!ld) return null;
          const parsed = normalizeProductTitle(ld.name);
          if (!parsed) return null;
          const seller = $('#sellerProfileTriggerId').text().trim() || undefined;
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
          const title = $('#productTitle').text().trim();
          const wholePrice = $('span.a-price-whole').first().text().trim();
          const fractionPrice = $('span.a-price-fraction').first().text().trim();

          if (!title || !wholePrice) return null;

          const parsed = normalizeProductTitle(title);
          if (!parsed) return null;

          const priceStr = `${wholePrice.replace(/[^\d]/g, '')}${fractionPrice ? '.' + fractionPrice.replace(/[^\d]/g, '') : ''}`;
          const price = parseFloat(priceStr);
          if (isNaN(price) || price <= 0) return null;

          const seller = $('#sellerProfileTriggerId').text().trim() || undefined;
          const outOfStock = $('#outOfStock').length > 0 || $('#availability .a-color-price').length > 0;

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
            stockStatus: outOfStock ? 'OUT_OF_STOCK' : 'IN_STOCK',
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

          const parsed = normalizeProductTitle(meta.name);
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
    ];
  }

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`;
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('[data-component-type="s-search-result"]').each((_, el) => {
      try {
        const title = $(el).find('h2 span').text().trim();
        const wholePrice = $(el).find('.a-price-whole').first().text().trim();
        const fractionPrice = $(el).find('.a-price-fraction').first().text().trim();
        const href = $(el).find('h2 a').attr('href');

        if (!title || !wholePrice || !href) return;

        const parsed = normalizeProductTitle(title);
        if (!parsed) return;

        const priceStr = `${wholePrice}${fractionPrice ? '.' + fractionPrice : ''}`.replace(/[^\d.]/g, '');
        const price = parseFloat(priceStr);
        if (isNaN(price) || price < 1000) return;

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
          productUrl: href.startsWith('http') ? href : `https://www.amazon.com.tr${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }
}
