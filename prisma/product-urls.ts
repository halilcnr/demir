/**
 * Manuel ürün URL'leri — iPhone 13–17 Pro Max aileleri.
 * Her varyant için hangi mağazada hangi URL olduğunu buraya yazın.
 *
 * Format:
 *   "varyant-slug": { "retailer-slug": "url", ... }
 *
 * Retailer slug'ları (trusted final retailers):
 *   "hepsiburada", "trendyol", "n11", "amazon", "pazarama",
 *   "idefix", "mediamarkt", "a101", "migros"
 *
 * Notes:
 *   - idefix, mediamarkt, a101, migros are newly integrated retailers.
 *     Add direct product URLs here as they are discovered.
 *   - Fallback discovery (akakce, cimri, enuygun, epey) can auto-discover
 *     URLs for any trusted retailer and refresh listing URLs in the DB.
 *   - Do not add generic search pages or unverified URLs.
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
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-13-128-gb-cep-telefonu-siyah_p-26020876',
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
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-mavi-cep-telefonu-apple-turkiye-garantili-p-150059501',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    pazarama: 'https://www.pazarama.com/apple-iphone-13-mavi-128-gb-4-gb-ram-61-inc-12-mp-akilli-telefon-p-194252708330',
  },
  'iphone-13-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-yesil-p-HBCV00001T9W5S',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-yesil-cep-telefonu-apple-turkiye-garantili-p-266090694',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },
  'iphone-13-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-128-gb-pembe-p-HBCV00000ODHHZ',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },
  'iphone-13-128gb-red': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-kirmizi-p-HBCV00000ODHHR',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 13 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-13-256gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-siyah-p-HBCV00000ODHWN',
  },
  'iphone-13-256gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-256-gb-beyaz-p-HBCV00000ODHWP',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-256-gb-yildiz-isigi-cep-telefonu-apple-turkiye-garantili-p-153303511',
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
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-512-gb-beyaz-p-HBCV00000ODHY5',
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-512-gb-mavi-p-HBCV00000ODHY6',
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-pink': {
    trendyol: 'https://www.trendyol.com/apple/iphone-13-512-gb-pembe-cep-telefonu-apple-turkiye-garantili-p-155084747',
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-green': {
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-red': {
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 14 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-14-128gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-siyah-p-HBCV00002VUQ7R',
    trendyol: 'https://www.trendyol.com/apple/iphone-14-128-gb-gece-yarisi-p-355707175',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
    pazarama: 'https://www.pazarama.com/apple-iphone-14-siyah-128-gb-6-gb-ram-apple-turkiye-garantili-p-194253408215',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-14-128-gb-cep-telefonu-siyah_p-26029309',
  },
  'iphone-14-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-beyaz-p-HBCV00002VUQ7S',
    trendyol: 'https://www.trendyol.com/apple/iphone-14-128-gb-yildiz-isigi-p-355707118',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
  },
  'iphone-14-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-mavi-p-HBCV00002VUQ7U',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
    pazarama: 'https://www.pazarama.com/apple-iphone-14-mavi-128-gb-6-gb-ram-apple-turkiye-garantili-p-194253409533',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-14-128-gb-cep-telefonu-mavi_p-26029309',
  },
  'iphone-14-128gb-purple': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-mor-p-HBCV00002VUQ7V',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
  },
  'iphone-14-128gb-red': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-kirmizi-p-HBCV00002VUQ7T',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
  },
  'iphone-14-128gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-sari-p-HBCV00003S8E4C',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 14 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-14-256gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-siyah-p-HBCV00002VUQF4',
    n11: 'https://www.n11.com/urun/apple-iphone-14-256-gb-apple-turkiye-garantili-22968231',
  },
  'iphone-14-256gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-beyaz-p-HBCV00002VUQF5',
    trendyol: 'https://www.trendyol.com/apple/iphone-14-256-gb-yildiz-isigi-cep-telefonu-p-355707120',
    n11: 'https://www.n11.com/urun/apple-iphone-14-256-gb-apple-turkiye-garantili-22968231',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-14-256-gb-cep-telefonu-beyaz_p-26031160',
  },
  'iphone-14-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-mavi-p-HBCV00002VUQF6',
    trendyol: 'https://www.trendyol.com/apple/iphone-14-256-gb-mavi-p-355707129',
    n11: 'https://www.n11.com/urun/apple-iphone-14-256-gb-apple-turkiye-garantili-22968231',
    amazon: 'https://www.amazon.com.tr/dp/B0BDJDQRLD',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-14-256-gb-cep-telefonu-mavi_p-26031160',
  },
  'iphone-14-256gb-purple': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-mor-p-HBCV00002VUQF7',
    n11: 'https://www.n11.com/urun/apple-iphone-14-256-gb-apple-turkiye-garantili-22968231',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 14 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-14-512gb-midnight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-512-gb-siyah-p-HBCV00002VUQTS',
  },
  'iphone-14-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-512-gb-mavi-p-HBCV00002VUQTU',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-14-512-gb-cep-telefonu-mavi_p-26029310',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 15 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-15-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-siyah-p-HBCV00004X9ZCH',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-762254878',
    n11: 'https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXCFS1J',
    pazarama: 'https://www.pazarama.com/apple-iphone-15-128-6-gb-ram-5g-apple-turkiye-garantili-p-195949036040',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-15-128-gb-akilli-telefon-siyah-mtp03tua-1232435.html',
    migros: 'https://www.migros.com.tr/apple-iphone-15-128-gb-midnight-cep-telefonu-p-255f0d0',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-128-gb-cep-telefonu-siyah_p-26043586',
  },
  'iphone-15-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-mavi-p-HBCV00004X9ZCK',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-mavi-p-762254881',
    n11: 'https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXGB3NG',
    pazarama: 'https://www.pazarama.com/apple-iphone-15-128-6-gb-ram-5g-apple-turkiye-garantili-p-195949036583',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-15-128-gb-akilli-telefon-mavi-mtp43tua-1232436.html',
    migros: 'https://www.migros.com.tr/apple-iphone-15-128-gb-mavi-cep-telefonu-p-255f0d4',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-128-gb-cep-telefonu-mavi_p-26043586',
  },
  'iphone-15-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-p-HBCV00004X9ZCL',
    n11: 'https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXMLVKJ',
  },
  'iphone-15-128gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-sari-p-HBCV00004X9ZCJ',
    n11: 'https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353',
    amazon: 'https://www.amazon.com.tr/dp/B0CHWZC5D7',
  },
  'iphone-15-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-pembe-p-HBCV00004X9ZCI',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-pembe-p-762254841',
    n11: 'https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXFG737',
    pazarama: 'https://www.pazarama.com/apple-iphone-15-128-6-gb-ram-5g-apple-turkiye-garantili-p-195949036224',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-15-128-gb-akilli-telefon-pembe-mtp13tua-1232438.html',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 15 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-15-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-siyah-p-HBCV00004X9ZMH',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-256-gb-siyah-p-762254844',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXRNHC4',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-15-256-gb-akilli-telefon-siyah-mtp63tua-1232440.html',
    migros: 'https://www.migros.com.tr/apple-iphone-15-256-gb-siyah-cep-telefonu-p-255f8f0',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-256-gb-cep-telefonu-siyah_p-26043587',
  },
  'iphone-15-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-mavi-p-HBCV00004X9ZMK',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-256-gb-mavi-p-762254862',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
    amazon: 'https://www.amazon.com.tr/dp/B0CHX43FKD',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-15-256-gb-akilli-telefon-mavi-mtp93tua-1232441.html',
    migros: 'https://www.migros.com.tr/apple-iphone-15-256-gb-mavi-cep-telefonu-p-255f8f1',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-256-gb-cep-telefonu-mavi_p-26043587',
  },
  'iphone-15-256gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-pembe-p-HBCV00004X9ZMI',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-256-gb-pembe-p-762254854',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
    amazon: 'https://www.amazon.com.tr/dp/B0CHX9D18W',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-256-gb-cep-telefonu-pembe_p-26043587',
  },
  'iphone-15-256gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-yesil-p-HBCV00004X9ZML',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
  },
  'iphone-15-256gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-sari-p-HBCV00004X9ZMJ',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-256-gb-cep-telefonu-sari_p-26043587',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 15 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-15-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-siyah-p-HBCV00004X9ZVH',
    n11: 'https://www.n11.com/urun/apple-iphone-15-512-gb-apple-turkiye-garantili-43821371',
  },
  'iphone-15-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-mavi-p-HBCV00004X9ZVK',
    n11: 'https://www.n11.com/urun/apple-iphone-15-512-gb-apple-turkiye-garantili-43821371',
  },
  'iphone-15-512gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-pembe-p-HBCV00004X9ZVI',
    n11: 'https://www.n11.com/urun/apple-iphone-15-512-gb-apple-turkiye-garantili-43821371',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-siyah-p-HBCV00006Y4HFJ',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-siyah-p-857296095',
    n11: 'https://www.n11.com/urun/apple-iphone-16-128-gb-apple-turkiye-garantili-59257801',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJZWQX',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-siyah-p-195949821943',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-128gb-akilli-telefon-siyah-mye73tua-1239553.html',
    migros: 'https://www.migros.com.tr/apple-iphone-16-128-gb-siyah-cep-telefonu-p-255f0d9',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-16-128-gb-cep-telefonu-siyah_p-26053252',
  },
  'iphone-16-128gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-beyaz-p-HBCV00006Y4HFL',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-beyaz-p-857296082',
    n11: 'https://www.n11.com/urun/apple-iphone-16-128-gb-apple-turkiye-garantili-59257801',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJPYGP',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-beyaz-p-195949822124',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-128gb-akilli-telefon-beyaz-mye93tua-1239557.html',
    migros: 'https://www.migros.com.tr/apple-iphone-16-128-gb-white-p-255f0db',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-16-128-gb-cep-telefonu-beyaz_p-26053252',
  },
  'iphone-16-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-pembe-p-HBCV00006Y4HU3',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-pembe-p-857296122',
    n11: 'https://www.n11.com/urun/apple-iphone-16-128-gb-apple-turkiye-garantili-59257801',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJQYLQB',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-pembe-p-195949822308',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-128gb-akilli-telefon-pembe-myea3tua-1239560.html',
  },
  'iphone-16-128gb-teal': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-deniz-mavisi-p-HBCV00006Y4HFP',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-deniz-mavisi-p-857296127',
    n11: 'https://www.n11.com/urun/apple-iphone-16-128-gb-apple-turkiye-garantili-59257801',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ6B6SM',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-teal-p-195949822667',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-128gb-akilli-telefon-teal-myed3tua-1239565.html',
    migros: 'https://www.migros.com.tr/apple-iphone-16-128-gb-teal-cep-telefonu-p-255f3e8',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-16-128-gb-cep-telefonu-deniz-mavisi_p-26053252',
  },
  'iphone-16-128gb-ultramarine': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-lacivert-tas-p-HBCV00006Y4HFN',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-laciverttas-p-857296121',
    n11: 'https://www.n11.com/urun/apple-iphone-16-128-gb-apple-turkiye-garantili-59257801',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ9XTZ1',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-ultramarine-p-195949822483',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-128gb-akilli-telefon-ultramarine-myec3tua-1239562.html',
    migros: 'https://www.migros.com.tr/apple-iphone-16-128-gb-ultramarine-p-255f0d7',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-16-128-gb-cep-telefonu-laciverttas_p-26053252',
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
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-16-512-gb-cep-telefonu-laciverttas_p-26065439',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-siyah-p-HBCV00009Z3Y49',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-siyah-p-985256842',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFBXXWF',
    pazarama: 'https://www.pazarama.com/apple-mg6j4tua-iphone-17-256gb-akilli-telefon-siyah-p-0195950643541',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6j4tua-iphone-17-256gb-akilli-telefon-siyah-1249221.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-256-gb-siyah-cep-telefonu-p-255faed',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-siyah_p-26064633',
  },
  'iphone-17-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-beyaz-p-HBCV00009Z3YJ1',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-beyaz-p-985256845',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    pazarama: 'https://www.pazarama.com/apple-mg6k4tua-iphone-17-256gb-akilli-telefon-beyaz-p-0195950643749',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6k4tua-iphone-17-256gb-akilli-telefon-beyaz-1249222.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-beyaz_p-26064633',
  },
  'iphone-17-256gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-sis-mavisi-p-HBCV00009Z40TF',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-sis-mavisi-p-985256848',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-256gb-akilli-telefon-sis-mavisi-mg6l4tua-p-0195950643947',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6l4tua-iphone-17-256gb-akilli-telefon-sis-mavisi-1249223.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-256-gb-mavi-cep-telefonu-p-255fabc',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-sis-mavisi_p-26064633',
  },
  'iphone-17-256gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-lavanta-p-HBCV00009Z3Y37',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-lavanta-p-985256856',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFBYM12',
    pazarama: 'https://www.pazarama.com/apple-mg6m4tua-iphone-17-256gb-akilli-telefon-lavanta-p-0195950644142',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6m4tua-iphone-17-256gb-akilli-telefon-lavanta-1249224.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-lavanta_p-26064633',
  },
  'iphone-17-256gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-ada-cayi-p-HBCV00009Z3XZZ',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-ada-cayi-p-985256863',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFVL7G9',
    pazarama: 'https://www.pazarama.com/apple-mg6n4tua-iphone-17-256gb-akilli-telefon-adacayi-p-0195950644340',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6n4tua-iphone-17-256gb-akilli-telefon-adacayi-1249225.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-256-gb-adacayi-cep-telefonu-p-255fae1',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-yesil_p-26064633',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-siyah-p-HBCV00009Z3V96',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6p4tua-iphone-17-512gb-akilli-telefon-siyah-p-0195950644548',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6p4tua-iphone-17-512gb-akilli-telefon-siyah-1249226.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-512-gb-siyah-cep-telefonu-p-255f8d9',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-siyah_p-26065082',
  },
  'iphone-17-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-beyaz-p-HBCV00009Z3XDK',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-beyaz-p-985256823',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6q4tua-iphone-17-512gb-akilli-telefon-beyaz-p-0195950644746',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6q4tua-iphone-17-512gb-akilli-telefon-beyaz-1249227.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-beyaz_p-26065082',
  },
  'iphone-17-512gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-sis-mavisi-p-HBCV00009Z3YPJ',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-512gb-akilli-telefon-sis-mavisi-mg6t4tua-p-0195950644944',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6t4tua-iphone-17-512gb-akilli-telefon-sis-mavisi-1249228.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-512-gb-mavi-cep-telefonu-p-255fabe',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-sis-mavisi_p-26065082',
  },
  'iphone-17-512gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-lavanta-p-HBCV00009Z3SG0',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-lavanta-p-985256833',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6u4tua-iphone-17-512gb-akilli-telefon-lavanta-p-0195950645149',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6u4tua-iphone-17-512gb-akilli-telefon-lavanta-1249229.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-512-gb-lavanta-cep-telefonu-p-255fabf',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-lavanta_p-26065082',
  },
  'iphone-17-512gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-ada-cayi-p-HBCV00009Z3XIN',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-ada-cayi-p-985256839',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6v4tua-iphone-17-512gb-akilli-telefon-adacayi-p-0195950645347',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6v4tua-iphone-17-512gb-akilli-telefon-adacayi-1249230.html',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Air — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-air-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-uzay-siyahi-p-HBCV00009Z40TG',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-256gb-uzay-siyahi-p-985256818',
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
    pazarama: 'https://www.pazarama.com/iphone-air-256gb-space-black-mg2l4tua-p-195950622621',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2l4tua-iphone-air-256gb-akilli-telefon-uzay-siyahi-1249231.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-air-256-gb-cep-telefonu-uzay-siyahi_p-26064634',
  },
  'iphone-17-air-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-pamuk-beyazi-p-HBCV00009Z3YH5',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-256gb-pamuk-beyazi-p-985256822',
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
    pazarama: 'https://www.pazarama.com/apple-iphone-air-256gb-akilli-telefon-pamuk-beyazi-mg2m4tua-p-0195950622829',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2m4tua-iphone-air-256gb-akilli-telefon-bulut-beyazi-1249232.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-256-gb-pamuk-beyazi-cep-telefonu-p-255fa97',
  },
  'iphone-17-air-256gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-gok-mavisi-p-HBCV00009Z6WR8',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-256gb-gok-mavisi-p-985256832',
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
    pazarama: 'https://www.pazarama.com/iphone-air-256gb-sky-blue-mg2p4tua-p-195950623222',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2p4tua-iphone-air-256gb-akilli-telefon-gok-mavisi-1249234.html',
  },
  'iphone-17-air-256gb-lavender': {
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
  },
  'iphone-17-air-256gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-ucuk-altin-rengi-p-HBCV00009Z3Z8B',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-256gb-ucuk-altin-rengi-p-985256827',
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
    pazarama: 'https://www.pazarama.com/iphone-air-256gb-light-gold-mg2n4tua-p-195950623024',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2n4tua-iphone-air-256gb-akilli-telefon-ucuk-altin-1249233.html',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Air — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-air-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-512-gb-uzay-siyahi-p-HBCV00009Z3YJ2',
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    pazarama: 'https://www.pazarama.com/apple-iphone-air-512gb-akilli-telefon-uzay-siyahi-mg2q4tua-p-0195950623420',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2q4tua-iphone-air-512gb-akilli-telefon-uzay-siyahi-1249241.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-uzay-siyahi-cep-telefonu-p-255fab6',
  },
  'iphone-17-air-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-512-gb-pamuk-beyazi-p-HBCV00009Z3V98',
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    pazarama: 'https://www.pazarama.com/apple-iphone-air-512gb-akilli-telefon-pamuk-beyazi-mg2t4tua-p-0195950623628',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2t4tua-iphone-air-512gb-akilli-telefon-bulut-beyazi-1249242.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-pamuk-beyazi-cep-telefonu-p-255fab7',
  },
  'iphone-17-air-512gb-fog-blue': {
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    pazarama: 'https://www.pazarama.com/iphone-air-512gb-sky-blue-mg2v4tua-p-195950624021',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2v4tua-iphone-air-512gb-akilli-telefon-gok-mavisi-1249237.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-mavi-cep-telefonu-p-255f845',
  },
  'iphone-17-air-512gb-lavender': {
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
  },
  'iphone-17-air-512gb-sage': {
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2u4tua-iphone-air-512gb-akilli-telefon-ucuk-altin-1249235.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-ucuk-altin-cep-telefonu-p-255faf7',
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
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8j4tua-iphone-17-pro-256gb-akilli-telefon-derin-mavi-1249240.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-256-gb-cep-telefonu-abis-_p-26066122',
  },
  'iphone-17-pro-256gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-gumus-p-HBCV00009Z40DM',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-gumus-p-985256847',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFTYPTQ',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-17-pro-256gb-akilli-telefon-gumus-1249236.html',
  },
  'iphone-17-pro-256gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-kozmik-turuncu-p-HBCV00009Z3XL5',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-kozmik-turuncu-p-985256852',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFYN66J',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8h4tua-iphone-17-pro-256gb-akilli-telefon-kozmik-turuncu-1249238.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-256-gb-cep-telefonu-turuncu-_p-26066122',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-512gb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-abis-p-HBCV00009Z3XXB',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-512gb-abis-p-985256849',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-koyu-mavi-p-0195950628203',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8n4tua-iphone-17-pro-512gb-akilli-telefon-derin-mavi-1249244.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-pro-512-gb-lacivert-cep-telefonu-p-255f839',
  },
  'iphone-17-pro-512gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-gumus-p-HBCV00009Z3XDN',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8k4tua-iphone-17-pro-512gb-akilli-telefon-gumus-1249239.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-512-gb-cep-telefonu-gumus_p-26065084',
  },
  'iphone-17-pro-512gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-kozmik-turuncu-p-HBCV00009Z3SG2',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8m4tua-iphone-17-pro-512gb-akilli-telefon-kozmik-turuncu-1249243.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-pro-512-gb-turuncu-cep-telefonu-p-255f834',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-512-gb-cep-telefonu-turuncu_p-26065084',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro — 1 TB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-1tb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-abis-p-HBCV00009Z403Y',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-1-tb-apple-turkiye-garantili-100728058',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8r4tua-iphone-17-pro-1tb-akilli-telefon-derin-mavi-1249254.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-1-tb-cep-telefonu-abis_p-26066033',
  },
  'iphone-17-pro-1tb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-gumus-p-HBCV00009Z3ZAB',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-1-tb-apple-turkiye-garantili-100728058',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-1-tb-cep-telefonu-gumus_p-26066033',
  },
  'iphone-17-pro-1tb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-kozmik-turuncu-p-HBCV00009Z3Z03',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-1-tb-apple-turkiye-garantili-100728058',
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
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyp4tua-iphone-17-pro-max-256gb-akilli-telefon-koyu-mavi-1249247.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-256-gb-cep-telefonu-abis_p-26066404',
  },
  'iphone-17-pro-max-256gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-gumus-p-HBCV00009Z3XIO',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-gumus-p-985256821',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG8NP4B',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-pro-max-256-gb-gumus-cep-telefonu-apple-turkiye-garantili-p-195950638851',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfym4tua-iphone-17-pro-max-256gb-akilli-telefon-gumus-1249245.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-256-gb-cep-telefonu-gumus_p-26066404',
  },
  'iphone-17-pro-max-256gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-kozmik-turuncu-p-HBCV00009Z3Z8C',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-kozmik-turuncu-p-985256825',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFLHC7F',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-pro-max-256-gb-turuncu-cep-telefonu-apple-turkiye-garantili-p-195950639056',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyn4tua-iphone-17-pro-max-256gb-akilli-telefon-kozmik-turuncu-1249246.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-256-gb-cep-telefonu-kozmik-turuncu_p-26066404',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro Max — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-max-512gb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-abis-p-HBCV00009Z3SG4',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-abis-p-985256867',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFLV8YG',
    pazarama: 'https://www.pazarama.com/iphone-17-pro-max-512gb-deep-blue-mfyu4tua-p-195950639858',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyu4tua-iphone-17-pro-max-512gb-akilli-telefon-koyu-mavi-1249257.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-pro-max-512-gb-lacivert-cep-telefonu-p-255f8db',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-512-gb-cep-telefonu-lacivert_p-26066544',
  },
  'iphone-17-pro-max-512gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-gumus-p-HBCV00009Z6WRA',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-gumus-p-985256835',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG26YH9',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyq4tua-iphone-17-pro-max-512gb-akilli-telefon-gumus-1249255.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-512-gb-cep-telefonu-gumus_p-26066544',
  },
  'iphone-17-pro-max-512gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-kozmik-turuncu-p-HBCV00009Z3XG8',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-kozmik-turuncu-p-985256866',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFJF2DP',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyt4tua-iphone-17-pro-max-512gb-akilli-telefon-kozmik-turuncu-1249256.html',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro Max — 1 TB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-max-1tb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-abis-p-HBCV00009Z3XG9',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-1-tb-apple-turkiye-garantili-100822552',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-1-tb-cep-telefonu-abis_p-26066034',
  },
  'iphone-17-pro-max-1tb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-gumus-p-HBCV00009Z3U2S',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-1-tb-apple-turkiye-garantili-100822552',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyv4tua-iphone-17-pro-max-1tb-akilli-telefon-gumus-1249258.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-1-tb-cep-telefonu-gumus_p-26066034',
  },
  'iphone-17-pro-max-1tb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-kozmik-turuncu-p-HBCV00009Z4112',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-1tb-kozmik-turuncu-p-985256869',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-1-tb-apple-turkiye-garantili-100822552',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyw4tua-iphone-17-pro-max-1tb-akilli-telefon-kozmik-turuncu-1249380.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-1-tb-cep-telefonu-kozmik-turuncu_p-26066034',
  },
};
