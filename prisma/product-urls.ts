/**
 * Manuel ürün URL'leri — iPhone 13–17 Pro Max aileleri.
 * Her varyant için hangi mağazada hangi URL olduğunu buraya yazın.
 *
 * Format:
 *   "varyant-slug": { "retailer-slug": "url", ... }
 *
 * Retailer slug'ları: "hepsiburada", "trendyol", "n11", "amazon", "pazarama"
 */

export interface ProductUrlMap {
  [variantSlug: string]: {
    [retailerSlug: string]: string;
  };
}

export const PRODUCT_URLS: ProductUrlMap = {

  // ═══════════════════════════════════════════════════════
  //  iPhone 13 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-13-128gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-siyah-p-HBCV00000ODHHF',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-siyah-cep-telefonu-apple-turkiye-garantili-p-150058735',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    amazon: 'https://www.amazon.com.tr/dp/B09G9RQTP3',
    pazarama: 'https://www.pazarama.com/iphone-13-128-gb-gece-yarisi-p-194252707258',
  },
  'iphone-13-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-beyaz-p-HBCV00000ODHHO',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-yildiz-isigi-cep-telefonu-apple-turkiye-garantili-p-150059024',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    amazon: 'https://www.amazon.com.tr/dp/B09G9RGQ6T',
    pazarama: 'https://www.pazarama.com/apple-iphone-13-beyaz-128-gb-4-gb-ram-61-inc-12-mp-akilli-telefon-p-194252707524',
  },
  'iphone-13-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-mavi-p-HBCV00000ODHHV',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    pazarama: 'https://www.pazarama.com/apple-iphone-13-mavi-128-gb-4-gb-ram-61-inc-12-mp-akilli-telefon-p-194252708330',
  },
  'iphone-13-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-yesil-p-HBCV00001T9W5S',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },
  'iphone-13-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-128-gb-pembe-p-HBCV00000ODHHZ',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },
  'iphone-13-128gb-red': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-kirmizi-p-HBCV00000ODHHR',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 13 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-13-256gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-siyah-p-HBCV00000ODHWN',
  },
  'iphone-13-256gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-beyaz-p-HBCV00000ODHWP',
  },
  'iphone-13-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-256-gb-mavi-p-HBCV00000ODHWO',
  },
  'iphone-13-256gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-pembe-p-HBCV00000ODHWS',
  },
  'iphone-13-256gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-yesil-p-HBCV00001T9W5T',
  },
  'iphone-13-256gb-red': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-kirmizi-p-HBCV00000ODHWR',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 13 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-13-512gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-512-gb-siyah-p-HBCV00000ODHY4',
  },
  'iphone-13-512gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-512-gb-beyaz-p-HBCV00000ODHY5',
  },
  'iphone-13-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-512-gb-mavi-p-HBCV00000ODHY6',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 14 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-14-128gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-siyah-p-HBCV00002VUQ7R',
    pazarama: 'https://www.pazarama.com/apple-iphone-14-siyah-128-gb-6-gb-ram-apple-turkiye-garantili-p-194253408215',
  },
  'iphone-14-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-beyaz-p-HBCV00002VUQ7S',
  },
  'iphone-14-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-mavi-p-HBCV00002VUQ7U',
    pazarama: 'https://www.pazarama.com/apple-iphone-14-mavi-128-gb-6-gb-ram-apple-turkiye-garantili-p-194253409533',
  },
  'iphone-14-128gb-purple': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-mor-p-HBCV00002VUQ7V',
  },
  'iphone-14-128gb-red': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-kirmizi-p-HBCV00002VUQ7T',
  },
  'iphone-14-128gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-sari-p-HBCV00003S8E4C',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 14 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-14-256gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-siyah-p-HBCV00002VUQF4',
  },
  'iphone-14-256gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-beyaz-p-HBCV00002VUQF5',
  },
  'iphone-14-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-mavi-p-HBCV00002VUQF6',
    amazon: 'https://www.amazon.com.tr/dp/B0BDJDQRLD',
  },
  'iphone-14-256gb-purple': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-mor-p-HBCV00002VUQF7',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 14 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-14-512gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-512-gb-siyah-p-HBCV00002VUQTS',
  },
  'iphone-14-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-512-gb-mavi-p-HBCV00002VUQTU',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 15 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-15-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-siyah-p-HBCV00004X9ZCH',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-762254878',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXCFS1J',
    pazarama: 'https://www.pazarama.com/apple-iphone-15-128-6-gb-ram-5g-apple-turkiye-garantili-p-195949036040',
  },
  'iphone-15-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-mavi-p-HBCV00004X9ZCK',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-mavi-p-762254881',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXGB3NG',
    pazarama: 'https://www.pazarama.com/apple-iphone-15-128-6-gb-ram-5g-apple-turkiye-garantili-p-195949036583',
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
    pazarama: 'https://www.pazarama.com/apple-iphone-15-128-6-gb-ram-5g-apple-turkiye-garantili-p-195949036224',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 15 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-15-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-siyah-p-HBCV00004X9ZMH',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXRNHC4',
  },
  'iphone-15-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-mavi-p-HBCV00004X9ZMK',
    amazon: 'https://www.amazon.com.tr/dp/B0CHX43FKD',
  },
  'iphone-15-256gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-pembe-p-HBCV00004X9ZMI',
    amazon: 'https://www.amazon.com.tr/dp/B0CHX9D18W',
  },
  'iphone-15-256gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-yesil-p-HBCV00004X9ZML',
  },
  'iphone-15-256gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-sari-p-HBCV00004X9ZMJ',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 15 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-15-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-siyah-p-HBCV00004X9ZVH',
  },
  'iphone-15-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-mavi-p-HBCV00004X9ZVK',
  },
  'iphone-15-512gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-pembe-p-HBCV00004X9ZVI',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-siyah-p-HBCV00006Y4HFJ',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-siyah-p-857296095',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJZWQX',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-siyah-p-195949821943',
  },
  'iphone-16-128gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-beyaz-p-HBCV00006Y4HFL',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-beyaz-p-857296082',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJPYGP',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-beyaz-p-195949822124',
  },
  'iphone-16-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-pembe-p-HBCV00006Y4HU3',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-pembe-p-857296122',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJQYLQB',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-pembe-p-195949822308',
  },
  'iphone-16-128gb-teal': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-deniz-mavisi-p-HBCV00006Y4HFP',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-deniz-mavisi-p-857296127',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ6B6SM',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-teal-p-195949822667',
  },
  'iphone-16-128gb-ultramarine': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-lacivert-tas-p-HBCV00006Y4HFN',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-laciverttas-p-857296121',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ9XTZ1',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-ultramarine-p-195949822483',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-256gb-siyah-p-HBCV00006Y4J6Y',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-256gb-siyah-p-857296098',
  },
  'iphone-16-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-256gb-beyaz-p-HBCV00006Y4J6Z',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-256gb-beyaz-p-857296085',
  },
  'iphone-16-256gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-256gb-pembe-p-HBCV00006Y4J70',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-256gb-pembe-p-857296125',
  },
  'iphone-16-256gb-teal': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-256gb-deniz-mavisi-p-HBCV00006Y4J71',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-256gb-deniz-mavisi-p-857296130',
  },
  'iphone-16-256gb-ultramarine': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-256gb-lacivert-tas-p-HBCV00006Y4J72',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-256gb-laciverttas-p-857296124',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-512gb-siyah-p-HBCV00006Y4K7Y',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-512gb-siyah-p-857296101',
  },
  'iphone-16-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-512gb-beyaz-p-HBCV00006Y4K7Z',
  },
  'iphone-16-512gb-ultramarine': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-512gb-lacivert-tas-p-HBCV00006Y4K82',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 — 256 GB
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
  //  iPhone 17 — 512 GB
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
  //  iPhone 17 Air — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-air-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-256-gb-siyah-p-HBCV00009Z41KL',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-air-256gb-siyah-p-985256871',
  },
  'iphone-17-air-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-256-gb-beyaz-p-HBCV00009Z41KM',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-air-256gb-beyaz-p-985256874',
  },
  'iphone-17-air-256gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-256-gb-sis-mavisi-p-HBCV00009Z41KN',
  },
  'iphone-17-air-256gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-256-gb-lavanta-p-HBCV00009Z41KO',
  },
  'iphone-17-air-256gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-256-gb-ada-cayi-p-HBCV00009Z41KP',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Air — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-air-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-512-gb-siyah-p-HBCV00009Z41KQ',
  },
  'iphone-17-air-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-air-512-gb-beyaz-p-HBCV00009Z41KR',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro — 256 GB
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
  //  iPhone 17 Pro — 512 GB
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
  //  iPhone 17 Pro — 1 TB
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
  //  iPhone 17 Pro Max — 256 GB
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
  //  iPhone 17 Pro Max — 512 GB
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
  //  iPhone 17 Pro Max — 1 TB
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
