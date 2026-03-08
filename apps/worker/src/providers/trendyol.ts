import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class TrendyolProvider extends BaseProvider {
  retailerSlug = 'trendyol';
  retailerName = 'Trendyol';

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

        const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
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
          productUrl: href.startsWith('http') ? href : `https://www.trendyol.com${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }

  async scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);

    const title = $('h1.pr-new-br span').text().trim()
      + ' ' + $('h1.pr-new-br .product-detail-name').text().trim();

    const priceText = $('span.prc-dsc').text().trim()
      || $('span.prc-slg').text().trim();

    if (!title.trim() || !priceText) return null;

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) return null;

    const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) return null;

    const seller = $('.seller-name-text').text().trim() || undefined;

    return {
      retailerSlug: this.retailerSlug,
      retailerName: this.retailerName,
      rawTitle: title.trim(),
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
  }
}
