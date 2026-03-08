/**
 * Manuel ürün URL'leri — iPhone 17 ailesi.
 * Her varyant için hangi mağazada hangi URL olduğunu buraya yazın.
 *
 * Format:
 *   "varyant-slug": { "retailer-slug": "url", ... }
 *
 * Retailer slug'ları: "hepsiburada", "trendyol", "n11", "amazon", "pazarama"
 *
 * Tüm varyantları doldurmak zorunda değilsiniz.
 * URL'si olan ürünler doğrudan sayfadan fiyat çekilir (daha doğru).
 * URL'si olmayanlar arama sistemiyle bulunur (fallback).
 */

export interface ProductUrlMap {
  [variantSlug: string]: {
    [retailerSlug: string]: string;
  };
}

export const PRODUCT_URLS: ProductUrlMap = {
  // ═══════════════════════════════════════════════════════
  // iPhone 17 256GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-siyah-p-HBCV00009Z3Y49',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-siyah-p-985256842',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFBXXWF',
  },
  'iphone-17-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-beyaz-p-HBCV00009Z3YJ1',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-beyaz-p-985256845',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
  },
  'iphone-17-256gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-sis-mavisi-p-HBCV00009Z40TF',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-sis-mavisi-p-985256848',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
  },
  'iphone-17-256gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-lavanta-p-HBCV00009Z3Y37',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-lavanta-p-985256856',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFBYM12',
  },
  'iphone-17-256gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-ada-cayi-p-HBCV00009Z3XZZ',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-ada-cayi-p-985256863',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFVL7G9',
  },

  // ═══════════════════════════════════════════════════════
  // iPhone 17 512GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-siyah-p-HBCV00009Z3V96',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
  },
  'iphone-17-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-beyaz-p-HBCV00009Z3XDK',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-beyaz-p-985256823',
  },
  'iphone-17-512gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-sis-mavisi-p-HBCV00009Z3YPJ',
  },
  'iphone-17-512gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-lavanta-p-HBCV00009Z3SG0',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-lavanta-p-985256833',
  },
  'iphone-17-512gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-ada-cayi-p-HBCV00009Z3XIN',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-ada-cayi-p-985256839',
  },
  // ═══════════════════════════════════════════════════════
  // iPhone 17 Pro 256GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-256gb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-abis-p-HBCV00009Z3YPK',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-abis-p-985256862',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG1C99S',
    pazarama: 'https://www.pazarama.com/iphone-17-pro-256gb-deep-blue-mg8j4tua-p-195950627602',
  },
  'iphone-17-pro-256gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-gumus-p-HBCV00009Z40DM',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-gumus-p-985256847',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFTYPTQ',
  },
  'iphone-17-pro-256gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-kozmik-turuncu-p-HBCV00009Z3XL5',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-kozmik-turuncu-p-985256852',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFYN66J',
  },

  // ═══════════════════════════════════════════════════════
  // iPhone 17 Pro 512GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-512gb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-abis-p-HBCV00009Z3XXB',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-512gb-abis-p-985256849',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
  },
  'iphone-17-pro-512gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-gumus-p-HBCV00009Z3XDN',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
  },
  'iphone-17-pro-512gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-kozmik-turuncu-p-HBCV00009Z3SG2',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
  },

  // ═══════════════════════════════════════════════════════
  // iPhone 17 Pro 1TB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-1tb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-abis-p-HBCV00009Z403Y',
  },
  'iphone-17-pro-1tb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-gumus-p-HBCV00009Z3ZAB',
  },
  'iphone-17-pro-1tb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-kozmik-turuncu-p-HBCV00009Z3Z03',
  },

  // ═══════════════════════════════════════════════════════
  // iPhone 17 Pro Max 256GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-max-256gb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-abis-p-HBCV00009Z3XOE',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-abis-p-985256830',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFVL6DK',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-pro-max-256-gb-siyah-cep-telefonu-apple-turkiye-garantili-p-195950639254',
  },
  'iphone-17-pro-max-256gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-gumus-p-HBCV00009Z3XIO',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-gumus-p-985256821',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG8NP4B',
  },
  'iphone-17-pro-max-256gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-kozmik-turuncu-p-HBCV00009Z3Z8C',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-kozmik-turuncu-p-985256825',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFLHC7F',
  },

  // ═══════════════════════════════════════════════════════
  // iPhone 17 Pro Max 512GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-max-512gb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-abis-p-HBCV00009Z3SG4',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-abis-p-985256867',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFLV8YG',
  },
  'iphone-17-pro-max-512gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-gumus-p-HBCV00009Z6WRA',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-gumus-p-985256835',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG26YH9',
  },
  'iphone-17-pro-max-512gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-kozmik-turuncu-p-HBCV00009Z3XG8',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-kozmik-turuncu-p-985256866',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFJF2DP',
  },

  // ═══════════════════════════════════════════════════════
  // iPhone 17 Pro Max 1TB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-max-1tb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-abis-p-HBCV00009Z3XG9',
  },
  'iphone-17-pro-max-1tb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-gumus-p-HBCV00009Z3U2S',
  },
  'iphone-17-pro-max-1tb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-kozmik-turuncu-p-HBCV00009Z4112',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-1tb-kozmik-turuncu-p-985256869',
  },
};
