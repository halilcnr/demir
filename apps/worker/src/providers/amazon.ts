import * as cheerio from 'cheerio';
import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class AmazonProvider extends BaseProvider {
  retailerSlug = 'amazon';
  retailerName = 'Amazon';

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

        const parsed = normalizeIPhoneModel(title);
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

  async scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
    const html = await this.withRetry(() => this.fetchPage(url));
    const $ = cheerio.load(html);

    // Primary: JSON-LD extraction
    const ld = this.extractJsonLd(html);
    if (ld) {
      const parsed = normalizeIPhoneModel(ld.name);
      if (parsed) {
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
      }
    }

    // Fallback: CSS selectors
    const title = $('#productTitle').text().trim();
    const wholePrice = $('span.a-price-whole').first().text().trim();
    const fractionPrice = $('span.a-price-fraction').first().text().trim();

    if (!title || !wholePrice) {
      console.warn(`[amazon] Empty title/price — title=${!!title}, price=${!!wholePrice}, url=${url}`);
      return null;
    }

    const parsed = normalizeIPhoneModel(title);
    if (!parsed) {
      console.warn(`[amazon] Model parse failed — title="${title.slice(0, 80)}", url=${url}`);
      return null;
    }

    const priceStr = `${wholePrice.replace(/[^\d]/g, '')}${fractionPrice ? '.' + fractionPrice.replace(/[^\d]/g, '') : ''}`;
    const price = parseFloat(priceStr);
    if (isNaN(price)) {
      console.warn(`[amazon] Price parse failed — priceStr="${priceStr}", url=${url}`);
      return null;
    }

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
  }
}
