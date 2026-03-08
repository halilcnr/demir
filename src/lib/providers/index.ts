import type { RetailerProvider } from '@/types';
import { HepsiburadaProvider } from './hepsiburada';
import { TrendyolProvider } from './trendyol';
import { N11Provider } from './n11';
import { AmazonProvider } from './amazon';
import { MockProvider } from './mock';

const USE_MOCK = process.env.USE_MOCK_PROVIDERS === 'true';

/** Tüm aktif provider'ları döndürür */
export function getProviders(): RetailerProvider[] {
  if (USE_MOCK) {
    return [
      new MockProvider('hepsiburada', 'Hepsiburada'),
      new MockProvider('trendyol', 'Trendyol'),
      new MockProvider('n11', 'N11'),
      new MockProvider('amazon', 'Amazon'),
    ];
  }

  return [
    new HepsiburadaProvider(),
    new TrendyolProvider(),
    new N11Provider(),
    new AmazonProvider(),
  ];
}

/** Belirli bir retailer slug'ına göre provider döndürür */
export function getProvider(slug: string): RetailerProvider | null {
  const providers = getProviders();
  return providers.find((p) => p.retailerSlug === slug) ?? null;
}

export { HepsiburadaProvider, TrendyolProvider, N11Provider, AmazonProvider, MockProvider };
