import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class N11Provider extends BaseProvider {
  retailerSlug = 'n11';
  retailerName = 'N11';

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
          productUrl: href.startsWith('http') ? href : `https://www.n11.com${href}`,
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

    const title = $('h1.proName').text().trim();
    const priceText = $('.newPrice ins').text().trim()
      || $('.newPrice').text().trim();

    if (!title || !priceText) {
      console.warn(`[n11] Empty title/price — title=${!!title}, price=${!!priceText}, url=${url}`);
      return null;
    }

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) {
      console.warn(`[n11] Model parse failed — title="${title.slice(0, 80)}", url=${url}`);
      return null;
    }

    const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) {
      console.warn(`[n11] Price parse failed — priceText="${priceText}", url=${url}`);
      return null;
    }

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
  }
}
