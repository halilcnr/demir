import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class PazaramaProvider extends BaseProvider {
  retailerSlug = 'pazarama';
  retailerName = 'Pazarama';

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.pazarama.com/search?q=${encodeURIComponent(query)}`;
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('[data-testid="product-card"], .product-card, .product-item').each((_, el) => {
      try {
        const title = $(el).find('.product-card__title, .product-name, h3').text().trim();
        const priceText = $(el).find('.product-card__price, .price, .discounted-price').text().trim();
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
          productUrl: href.startsWith('http') ? href : `https://www.pazarama.com${href}`,
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

    const title = $('h1.product-detail__title, h1.product-name, h1').first().text().trim();
    const priceText = $('span.product-detail__price, .price .discounted-price, .product-price').first().text().trim();

    if (!title || !priceText) {
      console.warn(`[pazarama] Empty title/price — title=${!!title}, price=${!!priceText}, url=${url}`);
      return null;
    }

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) {
      console.warn(`[pazarama] Model parse failed — title="${title.slice(0, 80)}", url=${url}`);
      return null;
    }

    const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) {
      console.warn(`[pazarama] Price parse failed — priceText="${priceText}", url=${url}`);
      return null;
    }

    const seller = $('.seller-name, .merchant-name').text().trim() || undefined;

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
      stockStatus: $('.out-of-stock, .sold-out').length ? 'OUT_OF_STOCK' : 'IN_STOCK',
      productUrl: url,
      fetchedAt: new Date(),
    };
  }
}
