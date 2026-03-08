/**
 * Manuel ürün URL'leri.
 * Her varyant için hangi mağazada hangi URL olduğunu buraya yazın.
 *
 * Format:
 *   "varyant-slug": { "retailer-slug": "url", ... }
 *
 * Örnek varyant slug: "iphone-16-pro-max-256gb-natural-titanium"
 * Retailer slug'ları: "hepsiburada", "trendyol", "n11", "amazon"
 *
 * Tüm varyantları doldurmak zorunda değilsiniz.
 * URL'si olan ürünler doğrudan sayfadan fiyat çekilir (daha doğru).
 * URL'si olmayanlar eski arama sistemiyle bulunur (fallback).
 */

export interface ProductUrlMap {
  [variantSlug: string]: {
    [retailerSlug: string]: string;
  };
}

export const PRODUCT_URLS: ProductUrlMap = {
  // ─── iPhone 13 128GB ──────────────────────────────────
  'iphone-13-128gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-siyah-p-HBCV00000ODHHF',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-siyah-cep-telefonu-apple-turkiye-garantili-p-150058735',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    amazon: 'https://www.amazon.com.tr/dp/B09G9RQTP3',
  },
  'iphone-13-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-beyaz-p-HBCV00000ODHHO',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-yildiz-isigi-cep-telefonu-apple-turkiye-garantili-p-150059024',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    amazon: 'https://www.amazon.com.tr/dp/B09G9RGQ6T',
  },
  'iphone-13-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-mavi-p-HBCV00000ODHHV',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },
  'iphone-13-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-yesil-p-HBCV00001T9W5S',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },
  'iphone-13-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-128-gb-pembe-p-HBCV00000ODHHZ',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },

  // ─── iPhone 13 256GB ──────────────────────────────────
  'iphone-13-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-256-gb-mavi-p-HBCV00000ODHWO',
  },

  // ─── iPhone 14 128GB ──────────────────────────────────
  'iphone-14-128gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-siyah-p-HBCV00002VUQ7R',
  },
  'iphone-14-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-beyaz-p-HBCV00002VUQ7S',
  },
  'iphone-14-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-mavi-p-HBCV00002VUQ7U',
  },

  // ─── iPhone 14 256GB ──────────────────────────────────
  'iphone-14-256gb-blue': {
    amazon: 'https://www.amazon.com.tr/dp/B0BDJDQRLD',
  },

  // ─── iPhone 15 128GB ──────────────────────────────────
  'iphone-15-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-siyah-p-HBCV00004X9ZCH',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-762254878',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXCFS1J',
  },
  'iphone-15-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-mavi-p-HBCV00004X9ZCK',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-mavi-p-762254881',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXGB3NG',
  },
  'iphone-15-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-p-HBCV00004X9ZCL',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXMLVKJ',
  },
  'iphone-15-128gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-sari-p-HBCV00004X9ZCJ',
    amazon: 'https://www.amazon.com.tr/dp/B0CHWZC5D7',
  },
  'iphone-15-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-pembe-p-HBCV00004X9ZCI',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXFG737',
  },

  // ─── iPhone 15 256GB ──────────────────────────────────
  'iphone-15-256gb-black': {
    amazon: 'https://www.amazon.com.tr/dp/B0CHXRNHC4',
  },
  'iphone-15-256gb-blue': {
    amazon: 'https://www.amazon.com.tr/dp/B0CHX43FKD',
  },
  'iphone-15-256gb-pink': {
    amazon: 'https://www.amazon.com.tr/dp/B0CHX9D18W',
  },

  // ─── iPhone 16 128GB ──────────────────────────────────
  'iphone-16-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-siyah-p-HBCV00006Y4HFJ',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-siyah-p-857296095',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJZWQX',
  },
  'iphone-16-128gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-beyaz-p-HBCV00006Y4HFL',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-beyaz-p-857296082',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJPYGP',
  },
  'iphone-16-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-pembe-p-HBCV00006Y4HU3',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-pembe-p-857296122',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJQYLQB',
  },
  'iphone-16-128gb-teal': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-deniz-mavisi-p-HBCV00006Y4HFP',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-deniz-mavisi-p-857296127',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ6B6SM',
  },
  'iphone-16-128gb-ultramarine': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-lacivert-tas-p-HBCV00006Y4HFN',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-laciverttas-p-857296121',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ9XTZ1',
  },

  // ─── iPhone 16 Pro 128GB ──────────────────────────────
  'iphone-16-pro-128gb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-siyah-p-HBCV00006Y4HBH',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-128gb-siyah-titanyum-p-857296083',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJKMM4B',
  },
  'iphone-16-pro-128gb-white-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-beyaz-p-HBCV00006Y4HBJ',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ9QW7D',
  },
  'iphone-16-pro-128gb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-naturel-titanyum-p-HBCV00006Y4HBL',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJQXCTP',
  },
  'iphone-16-pro-128gb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-col-titanyum-p-HBCV00006Y4HGL',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJFQTFN',
  },

  // ─── iPhone 16 Pro Max 256GB ──────────────────────────
  'iphone-16-pro-max-256gb-black-titanium': {
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-256gb-siyah-titanyum-p-857296077',
  },
};
