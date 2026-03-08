import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@/lib/utils';
import type { ScrapedProduct } from '@/types';

export class AmazonProvider extends BaseProvider {
  retailerSlug = 'amazon';
  retailerName = 'Amazon';

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`;
    const html = await this.fetchPage(url);
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('[data-component-type="s-search-result"]').each((_, el) => {
      try {
        const title = $(el).find('h2 span').text().trim();
        const wholePrice = $(el).find('.a-price-whole').first().text().trim();
        const fractionPrice = $(el).find('.a-price-fraction').first().text().trim();
        const href = $(el).find('h2 a').attr('href');

        if (!title || !wholePrice || !href) return;

        const parsed = normalizeIPhoneModel(title);
        if (!parsed) return;

        const priceStr = `${wholePrice}${fractionPrice ? '.' + fractionPrice : ''}`.replace(/[^\d.]/g, '');
        const price = parseFloat(priceStr);
        if (isNaN(price) || price < 1000) return;

        results.push({
          title,
          model: parsed.model,
          storage: parsed.storage,
          color: parsed.color,
          price,
          url: href.startsWith('http') ? href : `https://www.amazon.com.tr${href}`,
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

    const title = $('#productTitle').text().trim();
    const wholePrice = $('span.a-price-whole').first().text().trim();
    const fractionPrice = $('span.a-price-fraction').first().text().trim();

    if (!title || !wholePrice) return null;

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) return null;

    const priceStr = `${wholePrice}${fractionPrice ? '.' + fractionPrice : ''}`.replace(/[^\d.]/g, '');
    const price = parseFloat(priceStr);
    if (isNaN(price)) return null;

    const seller = $('#sellerProfileTriggerId').text().trim() || undefined;
    const outOfStock = $('#outOfStock').length > 0 || $('#availability .a-color-price').length > 0;

    return {
      title,
      model: parsed.model,
      storage: parsed.storage,
      color: parsed.color,
      price,
      url,
      seller,
      inStock: !outOfStock,
      retailerSlug: this.retailerSlug,
      fetchedAt: new Date(),
    };
  }
}
