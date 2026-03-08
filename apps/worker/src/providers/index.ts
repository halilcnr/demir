import type { RetailerProvider } from '@repo/shared';
import { HepsiburadaProvider } from './hepsiburada';
import { TrendyolProvider } from './trendyol';
import { N11Provider } from './n11';
import { AmazonProvider } from './amazon';
import { PazaramaProvider } from './pazarama';
import { IdefixProvider } from './idefix';
import { MediaMarktProvider } from './mediamarkt';
import { A101Provider } from './a101';
import { MigrosProvider } from './migros';
import { MockProvider } from './mock';

const USE_MOCK = process.env.USE_MOCK_PROVIDERS === 'true';

const ALL_RETAILER_SLUGS = [
  'hepsiburada', 'trendyol', 'n11', 'amazon', 'pazarama',
  'idefix', 'mediamarkt', 'a101', 'migros',
] as const;

/** Tüm aktif provider'ları döndürür */
export function getProviders(): RetailerProvider[] {
  if (USE_MOCK) {
    return ALL_RETAILER_SLUGS.map(slug =>
      new MockProvider(slug, slug.charAt(0).toUpperCase() + slug.slice(1)),
    );
  }

  return [
    new HepsiburadaProvider(),
    new TrendyolProvider(),
    new N11Provider(),
    new AmazonProvider(),
    new PazaramaProvider(),
    new IdefixProvider(),
    new MediaMarktProvider(),
    new A101Provider(),
    new MigrosProvider(),
  ];
}

/** Belirli bir retailer slug'ına göre provider döndürür */
export function getProvider(slug: string): RetailerProvider | null {
  const providers = getProviders();
  return providers.find((p) => p.retailerSlug === slug) ?? null;
}

export {
  HepsiburadaProvider, TrendyolProvider, N11Provider,
  AmazonProvider, PazaramaProvider, IdefixProvider,
  MediaMarktProvider, A101Provider, MigrosProvider,
  MockProvider,
};
