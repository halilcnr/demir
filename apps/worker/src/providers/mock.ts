import { BaseProvider, type ScrapeStrategy } from './base';
import { normalizeProductTitle } from '@repo/shared';
import type { ScrapedProduct } from '@repo/shared';

/**
 * Mock provider: Gerçek scraping olmadan rastgele fiyat verisi üretir.
 * Geliştirme ve test aşamasında kullanılır.
 */
export class MockProvider extends BaseProvider {
  retailerSlug: string;
  retailerName: string;

  constructor(slug: string, name: string) {
    super();
    this.retailerSlug = slug;
    this.retailerName = name;
  }

  protected getStrategies(): ScrapeStrategy[] {
    return [
      {
        name: 'mock',
        run: () => null,
      },
    ];
  }

  async search(query: string): Promise<ScrapedProduct[]> {
    await this.delay(200);

    const parsed = normalizeProductTitle(query);
    if (!parsed) return [];

    const basePrice = 30000 + Math.random() * 50000;
    const price = Math.round(basePrice / 100) * 100;
    const slug = parsed.model.toLowerCase().replace(/\s+/g, '-');

    return [
      {
        retailerSlug: this.retailerSlug,
        retailerName: this.retailerName,
        rawTitle: `Apple ${parsed.model} ${parsed.storageGb}GB ${parsed.color}`,
        normalizedModel: parsed.model,
        normalizedColor: parsed.color,
        normalizedStorageGb: parsed.storageGb,
        price,
        currency: 'TRY',
        stockStatus: Math.random() > 0.1 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        productUrl: `https://example.com/${this.retailerSlug}/${slug}`,
        fetchedAt: new Date(),
      },
    ];
  }
}
