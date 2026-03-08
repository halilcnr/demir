import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@/lib/utils';
import type { ScrapedProduct } from '@/types';

export class N11Provider extends BaseProvider {
  retailerSlug = 'n11';
  retailerName = 'N11';

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.n11.com/arama?q=${encodeURIComponent(query)}`;
    const html = await this.fetchPage(url);
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
          title,
          model: parsed.model,
          storage: parsed.storage,
          color: parsed.color,
          price,
          url: href.startsWith('http') ? href : `https://www.n11.com${href}`,
          inStock: true,
          retailerSlug: this.retailerSlug,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }

  async scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
    const html = await this.fetchPage(url);
    const $ = cheerio.load(html);

    const title = $('h1.proName').text().trim();
    const priceText = $('.newPrice ins').text().trim()
      || $('.newPrice').text().trim();

    if (!title || !priceText) return null;

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) return null;

    const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) return null;

    const seller = $('.sallerName a').text().trim() || undefined;

    return {
      title,
      model: parsed.model,
      storage: parsed.storage,
      color: parsed.color,
      price,
      url,
      seller,
      inStock: !$('.unf-p-summary-out-of-stock').length,
      retailerSlug: this.retailerSlug,
      fetchedAt: new Date(),
    };
  }
}
