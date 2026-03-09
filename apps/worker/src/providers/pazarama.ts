import * as cheerio from 'cheerio';
import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeIPhoneModel } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

export class PazaramaProvider extends BaseProvider {
  retailerSlug = 'pazarama';
  retailerName = 'Pazarama';

  protected pacing = { baseDelayMs: 2000, jitterMs: 1200, concurrencyLimit: 1 };

  protected getStrategies(): ScrapeStrategy[] {
    return [
      {
        name: 'jsonld',
        run: (html, url, $) => {
          const ld = this.extractJsonLd(html);
          if (!ld) return null;
          const parsed = normalizeIPhoneModel(ld.name);
          if (!parsed) return null;
          const seller = $('.seller-name, .merchant-name').text().trim() || undefined;
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
          const title = $('h1.product-detail__title, h1.product-name, h1').first().text().trim();
          const priceText = $('span.product-detail__price, .price .discounted-price, .product-price').first().text().trim();

          if (!title || !priceText) return null;

          const parsed = normalizeIPhoneModel(title);
          if (!parsed) return null;

          const price = this.parseTurkishPrice(priceText);
          if (!price) return null;

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
        },
      },
      {
        name: 'next-data',
        run: (html, url) => {
          const data = this.extractEmbeddedJson(html, [
            /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
          ]);
          if (!data) return null;

          const props = (data as Record<string, unknown>).props as Record<string, unknown> | undefined;
          const pageProps = props?.pageProps as Record<string, unknown> | undefined;
          const product = (pageProps?.product ?? pageProps?.productDetail) as Record<string, unknown> | undefined;
          if (!product) return null;

          const name = (product.name as string) || (product.title as string) || '';
          if (!name) return null;

          const parsed = normalizeIPhoneModel(name);
          if (!parsed) return null;

          const priceRaw = product.price ?? product.salePrice ?? product.listPrice;
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
            imageUrl: (product.imageUrl ?? product.image) as string | undefined,
            stockStatus: 'IN_STOCK',
            productUrl: url,
            fetchedAt: new Date(),
          };
        },
      },
    ];
  }

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
          productUrl: href.startsWith('http') ? href : `https://www.pazarama.com${href}`,
          fetchedAt: new Date(),
        });
      } catch {
        // skip
      }
    });

    return results;
  }
}
