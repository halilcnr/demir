import { BaseProvider } from './base';
import { normalizeIPhoneModel } from '@/lib/utils';
import type { ScrapedProduct } from '@/types';

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

  async search(query: string): Promise<ScrapedProduct[]> {
    await this.delay(200); // Simüle gecikme

    const parsed = normalizeIPhoneModel(query);
    if (!parsed) return [];

    const basePrice = 30000 + Math.random() * 50000;
    const price = Math.round(basePrice / 100) * 100;

    return [
      {
        title: `Apple ${parsed.model} ${parsed.storage}`,
        model: parsed.model,
        storage: parsed.storage,
        price,
        url: `https://example.com/${this.retailerSlug}/${parsed.model.toLowerCase().replace(/\s+/g, '-')}`,
        inStock: Math.random() > 0.1,
        retailerSlug: this.retailerSlug,
        fetchedAt: new Date(),
      },
    ];
  }

  async scrapeProductPage(_url: string): Promise<ScrapedProduct | null> {
    return null;
  }
}
