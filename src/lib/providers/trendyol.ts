import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@/lib/utils';
import type { ScrapedProduct } from '@/types';

export class TrendyolProvider extends BaseProvider {
  retailerSlug = 'trendyol';
  retailerName = 'Trendyol';

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`;
    const html = await this.fetchPage(url);
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
          title,
          model: parsed.model,
          storage: parsed.storage,
          color: parsed.color,
          price,
          url: href.startsWith('http') ? href : `https://www.trendyol.com${href}`,
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
      title: title.trim(),
      model: parsed.model,
      storage: parsed.storage,
      color: parsed.color,
      price,
      url,
      seller,
      inStock: !$('.out-of-stock-container').length,
      retailerSlug: this.retailerSlug,
      fetchedAt: new Date(),
    };
  }
}
