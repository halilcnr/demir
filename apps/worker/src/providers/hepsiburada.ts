import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class HepsiburadaProvider extends BaseProvider {
  retailerSlug = 'hepsiburada';
  retailerName = 'Hepsiburada';

  async search(query: string): Promise<ScrapedProduct[]> {
    const url = `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`;
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);
    const results: ScrapedProduct[] = [];

    $('[data-test-id="product-card-item"]').each((_, el) => {
      try {
        const title = $(el).find('[data-test-id="product-card-name"]').text().trim();
        const priceText = $(el).find('[data-test-id="price-current-price"]').text().trim();
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
          productUrl: href.startsWith('http') ? href : `https://www.hepsiburada.com${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // Selector değişmiş olabilir, skip
      }
    });

    return results;
  }

  async scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);

    // Primary: JSON-LD extraction (stable, standard)
    const ld = this.extractJsonLd(html);
    if (ld) {
      const parsed = normalizeIPhoneModel(ld.name);
      if (parsed) {
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
      }
    }

    // Fallback: CSS selectors
    const title = $('h1[data-test-id="product-name"]').text().trim()
      || $('h1#product-name').text().trim()
      || $('h1').first().text().trim();

    const priceText = $('[data-test-id="price-current-price"]').text().trim()
      || $('span[data-bind="markupText:\'currentPriceBeforePoint\'"]').text().trim();

    if (!title || !priceText) {
      console.warn(`[hepsiburada] Empty title/price — title=${!!title}, price=${!!priceText}, url=${url}`);
      return null;
    }

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) {
      console.warn(`[hepsiburada] Model parse failed — title="${title.slice(0, 80)}", url=${url}`);
      return null;
    }

    const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) {
      console.warn(`[hepsiburada] Price parse failed — priceText="${priceText}", url=${url}`);
      return null;
    }

    return {
      retailerSlug: this.retailerSlug,
      retailerName: this.retailerName,
      rawTitle: title,
      normalizedModel: parsed.model,
      normalizedColor: parsed.color,
      normalizedStorageGb: parsed.storageGb,
      price,
      currency: 'TRY',
      stockStatus: $('.out-of-stock-text').length ? 'OUT_OF_STOCK' : 'IN_STOCK',
      productUrl: url,
      fetchedAt: new Date(),
    };
  }
}
