/**
 * Manuel ürün URL'leri — iPhone 13–17 Pro Max aileleri.
 * Her varyant için hangi mağazada hangi URL olduğunu buraya yazın.
 *
 * Format:
 *   "varyant-slug": { "retailer-slug": "url", ... }
 *
 * Retailer slug'ları (trusted final retailers):
 *   "hepsiburada", "trendyol", "n11", "amazon", "pazarama",
 *   "idefix", "mediamarkt", "a101", "migros", "bim", "sok", "beymen"
 *
 * Notes:
 *   - bim has no e-commerce site (physical-only discount store with flyers).
 *   - sok carries limited iPhone inventory via /ekstra marketplace.
 *   - beymen is a premium department store with broad iPhone selection.
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
    idefix: 'https://www.idefix.com/apple-iphone-13-128-gb-gece-yarisi-apple-turkiye-garantili-p-374821',
  },
  'iphone-13-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-beyaz-p-HBCV00000ODHHO',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-yildiz-isigi-cep-telefonu-apple-turkiye-garantili-p-150059024',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    amazon: 'https://www.amazon.com.tr/dp/B09G9RGQ6T',
    pazarama: 'https://www.pazarama.com/apple-iphone-13-beyaz-128-gb-4-gb-ram-61-inc-12-mp-akilli-telefon-p-194252707524',
    idefix: 'https://www.idefix.com/apple-iphone-13-128-gb-beyaz-apple-turkiye-garantili-p-374820',
  },
  'iphone-13-128gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-mavi-p-HBCV00000ODHHV',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-mavi-cep-telefonu-apple-turkiye-garantili-p-150059501',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    pazarama: 'https://www.pazarama.com/apple-iphone-13-mavi-128-gb-4-gb-ram-61-inc-12-mp-akilli-telefon-p-194252708330',
    idefix: 'https://www.idefix.com/apple-iphone-13-128-gb-mavi-apple-turkiye-garantili-p-374802',
  },
  'iphone-13-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-yesil-p-HBCV00001T9W5S',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-128-gb-yesil-cep-telefonu-apple-turkiye-garantili-p-266090694',
    n11: 'https://www.n11.com/urun/apple-iphone-13-128-gb-apple-turkiye-garantili-2141312',
    idefix: 'https://www.idefix.com/apple-iphone-13-128-gb-yesil-apple-turkiye-garantili-p-394115',
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
    idefix: 'https://www.idefix.com/apple-iphone-13-512-gb-mavi-apple-turkiye-garantili-p-562248',
  },
  'iphone-13-512gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-512-gb-pembe-p-HBCV00000ODHXC',
    trendyol: 'https://www.trendyol.com/apple/iphone-13-512-gb-pembe-cep-telefonu-apple-turkiye-garantili-p-155084747',
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-green': {
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
  },
  'iphone-13-512gb-red': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-512-gb-kirmizi-p-HBCV00000ODHXG',
    n11: 'https://www.n11.com/urun/apple-iphone-13-512-gb-apple-turkiye-garantili-2141345',
    idefix: 'https://www.idefix.com/apple-iphone-13-512-gb-kirmizi-apple-turkiye-garantili-p-562246',
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
    idefix: 'https://www.idefix.com/apple-iphone-14-128-gb-gece-yarisi-apple-turkiye-garantili-p-562297',
  },
  'iphone-14-128gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-beyaz-p-HBCV00002VUQ7S',
    trendyol: 'https://www.trendyol.com/apple/iphone-14-128-gb-yildiz-isigi-p-355707118',
    n11: 'https://www.n11.com/urun/apple-iphone-14-128-gb-apple-turkiye-garantili-22964656',
    idefix: 'https://www.idefix.com/apple-iphone-14-128-gb-beyaz-apple-turkiye-garantili-p-375394',
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
    idefix: 'https://www.idefix.com/apple-iphone-14-256-gb-mavi-apple-turkiye-garantili-p-562301',
  },
  'iphone-14-256gb-purple': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-256-gb-mor-p-HBCV00002VUQF7',
    n11: 'https://www.n11.com/urun/apple-iphone-14-256-gb-apple-turkiye-garantili-22968231',
  },
  'iphone-14-256gb-red': {
    n11: 'https://www.n11.com/urun/apple-iphone-14-256-gb-apple-turkiye-garantili-22968231',
  },
  'iphone-14-256gb-yellow': {
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
  'iphone-14-512gb-starlight': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-512-gb-beyaz-p-HBCV00002VUQ82',
  },
  'iphone-14-512gb-purple': {},
  'iphone-14-512gb-red': {
    trendyol: 'https://www.trendyol.com/apple/iphone-14-512-gb-product-red-p-355707169',
  },
  'iphone-14-512gb-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-14-512-gb-sari-p-HBCV00003XVYI9',
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
    idefix: 'https://www.idefix.com/apple-iphone-15-128-gb-siyah-apple-turkiye-garantili-p-926268',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-15-128gb-siyah-akilli-cep-telefonu-mtp03tua_1344571',
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
    idefix: 'https://www.idefix.com/apple-iphone-15-128-gb-mavi-apple-turkiye-garantili-p-1390309',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-15-128gb-mavi-akilli-cep-telefonu-mtp43tua_1344569',
  },
  'iphone-15-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-p-HBCV00004X9ZCL',
    n11: 'https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353',
    amazon: 'https://www.amazon.com.tr/dp/B0CHXMLVKJ',
    idefix: 'https://www.idefix.com/apple-iphone-15-128-gb-yesil-apple-turkiye-garantili-p-927114',
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
    idefix: 'https://www.idefix.com/apple-iphone-15-128-gb-pembe-apple-turkiye-garantili-p-926200',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-15-128gb-pembe-akilli-cep-telefonu-mtp13tua_1344568',
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
    idefix: 'https://www.idefix.com/apple-iphone-15-256-gb-siyah-apple-turkiye-garantili-p-1405379',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-15-256gb-siyah-akilli-cep-telefonu-mtp63tua_1344627',
  },
  'iphone-15-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-mavi-p-HBCV00004X9ZMK',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-256-gb-mavi-p-762254862',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
    amazon: 'https://www.amazon.com.tr/dp/B0CHX43FKD',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-15-256-gb-akilli-telefon-mavi-mtp93tua-1232441.html',
    migros: 'https://www.migros.com.tr/apple-iphone-15-256-gb-mavi-cep-telefonu-p-255f8f1',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-256-gb-cep-telefonu-mavi_p-26043587',
    idefix: 'https://www.idefix.com/apple-iphone-15-256-gb-mavi-apple-turkiye-garantili-p-926249',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-15-256gb-mavi-akilli-cep-telefonu-mtp93tua_1344635',
  },
  'iphone-15-256gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-256-gb-pembe-p-HBCV00004X9ZMI',
    trendyol: 'https://www.trendyol.com/apple/iphone-15-256-gb-pembe-p-762254854',
    n11: 'https://www.n11.com/urun/apple-iphone-15-256-gb-apple-turkiye-garantili-43821352',
    amazon: 'https://www.amazon.com.tr/dp/B0CHX9D18W',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-15-256-gb-cep-telefonu-pembe_p-26043587',
    idefix: 'https://www.idefix.com/apple-iphone-15-256-gb-pembe-apple-turkiye-garantili-p-926198',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-15-256gb-pembe-akilli-cep-telefonu-mtp73tua_1344630',
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
    idefix: 'https://www.idefix.com/apple-iphone-15-512-gb-siyah-apple-turkiye-garantili-p-926245',
  },
  'iphone-15-512gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-mavi-p-HBCV00004X9ZVK',
    n11: 'https://www.n11.com/urun/apple-iphone-15-512-gb-apple-turkiye-garantili-43821371',
  },
  'iphone-15-512gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-15-512-gb-pembe-p-HBCV00004X9ZVI',
    n11: 'https://www.n11.com/urun/apple-iphone-15-512-gb-apple-turkiye-garantili-43821371',
  },
  'iphone-15-512gb-green': {
    n11: 'https://www.n11.com/urun/apple-iphone-15-512-gb-apple-turkiye-garantili-43821371',
  },
  'iphone-15-512gb-yellow': {
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
    idefix: 'https://www.idefix.com/apple-iphone-16-128-gb-siyah-apple-turkiye-garantili-p-4074604',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-16-128gb-siyah-akilli-cep-telefonu-mye73tua_1661649',
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
    idefix: 'https://www.idefix.com/apple-iphone-16-128-gb-beyaz-apple-turkiye-garantili-p-3832221',
  },
  'iphone-16-128gb-pink': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-128gb-pembe-p-HBCV00006Y4HU3',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-128gb-pembe-p-857296122',
    n11: 'https://www.n11.com/urun/apple-iphone-16-128-gb-apple-turkiye-garantili-59257801',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJQYLQB',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-128-gb-pembe-p-195949822308',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-128gb-akilli-telefon-pembe-myea3tua-1239560.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-128-gb-pembe-apple-turkiye-garantili-p-3832220',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-16-128gb-pembe-akilli-cep-telefonu-myea3tua_1661655',
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
    idefix: 'https://www.idefix.com/apple-iphone-16-128-gb-deniz-mavisi-apple-turkiye-garantili-p-3832269',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-16-128gb-deniz-mavisi-akilli-cep-telefonu-myed3tua_1661659',
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
    idefix: 'https://www.idefix.com/apple-iphone-16-128-gb-laciverttas-apple-turkiye-garantili-p-4074601',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-16-128gb-laciverttas-akilli-cep-telefonu-myec3tua_1661656',
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
    idefix: 'https://www.idefix.com/apple-iphone-16-256-gb-pembe-apple-turkiye-garantili-p-3832223',
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
    idefix: 'https://www.idefix.com/apple-iphone-16-512-gb-laciverttas-apple-turkiye-garantili-p-11903171',
  },
  'iphone-16-512gb-pink': {},
  'iphone-16-512gb-teal': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-512gb-deniz-mavisi-p-HBCV00006Y4HG3',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro — 128 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-128gb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-naturel-titanyum-p-HBCV00006Y4HBL',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-128gb-naturel-titanyum-p-857296098',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-128-gb-apple-turkiye-garantili-59257799',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJQXCTP',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-128-gb-naturel-titanyum-p-195949771750',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-128-gb-akilli-telefon-natural-titanium-146318072.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-128-gb-naturel-titanyum-apple-turkiye-garantili-p-3832257',
  },
  'iphone-16-pro-128gb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-siyah-p-HBCV00006Y4HBH',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-128gb-siyah-titanyum-p-857296083',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-128-gb-apple-turkiye-garantili-59257799',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJKMM4B',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-128-gb-siyah-titanyum-p-195949771187',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-128-gb-akilli-telefon-siyah-146317261.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-128-gb-siyah-titanyum-apple-turkiye-garantili-p-3832255',
  },
  'iphone-16-pro-128gb-white-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-beyaz-p-HBCV00006Y4HBJ',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-128gb-beyaz-titanyum-p-857296096',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-128-gb-apple-turkiye-garantili-59257799',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJ9QW7D',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-128-gb-beyaz-titanyum-p-195949771378',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-128-gb-akilli-telefon-beyaz-146317364.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-128-gb-beyaz-titanyum-apple-turkiye-garantili-p-3832256',
  },
  'iphone-16-pro-128gb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-col-titanyum-p-HBCV00006Y4HGL',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-128gb-col-titanyum-p-857296094',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-128-gb-apple-turkiye-garantili-59257799',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJFQTFN',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-128-gb-col-titanyum-p-195949771569',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-128-gb-akilli-telefon-titanyum-146318026.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-128-gb-col-titanyum-apple-turkiye-garantili-p-3832258',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-256gb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-256gb-naturel-titanyum-p-HBCV00006Y4HBT',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-256gb-naturel-titanyum-p-857296103',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-256-gb-apple-turkiye-garantili-59257800',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-256-gb-naturel-titanyum-p-195949772511',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-256-gb-akilli-telefon-natural-titanium-146563566.html',
  },
  'iphone-16-pro-256gb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-256gb-siyah-p-HBCV00006Y4HBN',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-256gb-siyah-titanyum-p-857296104',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-256-gb-apple-turkiye-garantili-59257800',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJLK6RJ',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-256-gb-siyah-titanyum-p-195949771941',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-256-gb-akilli-telefon-siyah-146317896.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-256-gb-siyah-titanyum-apple-turkiye-garantili-p-3832251',
  },
  'iphone-16-pro-256gb-white-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-256gb-beyaz-p-HBCV00006Y4HBP',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-256gb-beyaz-titanyum-p-857296076',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-256-gb-apple-turkiye-garantili-59257800',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJN2MV7',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-256-gb-beyaz-titanyum-p-195949772139',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-256-gb-akilli-telefon-beyaz-146563559.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-256-gb-beyaz-titanyum-apple-turkiye-garantili-p-3832252',
  },
  'iphone-16-pro-256gb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-256gb-col-titanyum-p-HBCV00006Y4HBR',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-256gb-col-titanyum-p-857296087',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-256-gb-apple-turkiye-garantili-59257800',
    amazon: 'https://www.amazon.com.tr/dp/B0DGJJPYGJ',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-256-gb-col-titanyum-p-195949772320',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-256-gb-col-titanyum-apple-turkiye-garantili-p-3832254',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-512gb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-512gb-naturel-titanyum-p-HBCV00006Y4HGP',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-512gb-naturel-titanyum-p-857296111',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-512-gb-apple-turkiye-garantili-59257808',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-512-gb-naturel-titanyum-p-195949773273',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-512-gb-naturel-titanyum-apple-turkiye-garantili-p-3832249',
  },
  'iphone-16-pro-512gb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-512gb-siyah-p-HBCV00006Y4HBV',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-512gb-siyah-titanyum-p-857296089',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-512-gb-apple-turkiye-garantili-59257808',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-512-gb-siyah-titanyum-apple-turkiye-garantili-p-3832247',
  },
  'iphone-16-pro-512gb-white-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-512gb-beyaz-p-HBCV00006Y4HGN',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-512gb-beyaz-titanyum-p-857296085',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-512-gb-apple-turkiye-garantili-59257808',
  },
  
  'iphone-16-pro-512gb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-512gb-col-titanyum-p-HBCV00006Y4HBX',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-512-gb-apple-turkiye-garantili-59257808',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-512-gb-akilli-telefon-titanyum-146317832.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-512-gb-col-titanyum-apple-turkiye-garantili-p-3832250',
  },
  
  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro — 1 TB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-1tb-natural-titanium': {},
  'iphone-16-pro-1tb-black-titanium': {},
  'iphone-16-pro-1tb-white-titanium': {},
  'iphone-16-pro-1tb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-1-tb-col-beji-p-HBCV00006Y4HC1',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-1tb-col-titanyum-p-857296107',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro Max — 256 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-max-256gb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-256gb-naturel-titanyum-p-HBCV00006Y4HC7',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-256gb-naturel-titanyum-p-857296078',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-256-gb-apple-turkiye-garantili-59257800',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-256-gb-naturel-titanyum-p-195949806360',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-256-gb-naturel-titanyum-apple-turkiye-garantili-p-3832240',
  },
  'iphone-16-pro-max-256gb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-256gb-siyah-p-HBCV00006Y4HGT',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-256gb-siyah-titanyum-p-857296077',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-256-gb-apple-turkiye-garantili-59257800',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-256-gb-siyah-titanyum-p-195949805790',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-max-256-gb-akilli-telefon-siyah-147051791.html',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-256-gb-siyah-titanyum-apple-turkiye-garantili-p-3832238',
  },
  'iphone-16-pro-max-256gb-white-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-256gb-beyaz-p-HBCV00006Y4HGV',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-256-gb-apple-turkiye-garantili-59257800',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-256-gb-beyaz-titanyum-p-195949805981',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-256-gb-beyaz-titanyum-apple-turkiye-garantili-p-3832239',
  },
  'iphone-16-pro-max-256gb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-256gb-col-titanyum-p-HBCV00006Y4HC5',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-256gb-col-titanyum-p-857296109',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-256-gb-apple-turkiye-garantili-59257800',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-256-gb-col-titanyum-p-195949806179',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-256-gb-col-titanyum-apple-turkiye-garantili-p-3832241',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro Max — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-max-512gb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-512gb-naturel-titanyum-p-HBCV00006Y4I9R',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-512-gb-apple-turkiye-garantili-59257804',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-512-gb-naturel-titanyum-apple-turkiye-garantili-p-5362449',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-16-pro-max-512gb-natural-titanyum-akilli-cep-telefonu-myx33tua_1661641',
  },
  'iphone-16-pro-max-512gb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-512gb-siyah-p-HBCV00006Y4HC9',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-512gb-siyah-titanyum-p-857296090',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-512-gb-apple-turkiye-garantili-59257804',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-512-8-gb-ram-5g-apple-turkiye-garantili-p-195949806551',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-512-gb-siyah-titanyum-apple-turkiye-garantili-p-3832234',
  },
  'iphone-16-pro-max-512gb-white-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-512gb-beyaz-p-HBCV00006Y4HCB',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-512gb-beyaz-titanyum-p-857296091',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-512-gb-apple-turkiye-garantili-59257804',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-512-8-gb-ram-5g-apple-turkiye-garantili-p-195949806742',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-512-gb-beyaz-titanyum-apple-turkiye-garantili-p-3832235',
  },
  'iphone-16-pro-max-512gb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-512gb-col-titanyum-p-HBCV00006Y4I9P',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-512gb-col-titanyum-p-857296093',
    n11: 'https://www.n11.com/urun/apple-iphone-16-pro-max-512-gb-apple-turkiye-garantili-59257804',
    pazarama: 'https://www.pazarama.com/apple-iphone-16-pro-max-512-8-gb-ram-5g-apple-turkiye-garantili-p-195949806933',
    idefix: 'https://www.idefix.com/apple-iphone-16-pro-max-512-gb-col-titanyum-apple-turkiye-garantili-p-3832237',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 16 Pro Max — 1 TB
  // ═══════════════════════════════════════════════════════
  'iphone-16-pro-max-1tb-natural-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-1-tb-naturel-titanyum-p-HBCV00006Y4I9Z',
  },
  'iphone-16-pro-max-1tb-black-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-1-tb-siyah-p-HBCV00006Y4I9T',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-1tb-siyah-titanyum-p-857296092',
  },
  'iphone-16-pro-max-1tb-white-titanium': {},
  'iphone-16-pro-max-1tb-desert-titanium': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-1-tb-col-beji-p-HBCV00006Y4I9X',
    trendyol: 'https://www.trendyol.com/apple/iphone-16-pro-max-1tb-col-titanyum-p-857296132',
    idefix: 'https://www.idefix.com/iphone-16-pro-max-1-tb-col-titanyum-p-6136932',
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
    idefix: 'https://www.idefix.com/apple-iphone-17-256gb-siyah-apple-turkiye-garantili-p-13997180',
  },
  'iphone-17-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-beyaz-p-HBCV00009Z3YJ1',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-beyaz-p-985256845',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    pazarama: 'https://www.pazarama.com/apple-mg6k4tua-iphone-17-256gb-akilli-telefon-beyaz-p-0195950643749',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6k4tua-iphone-17-256gb-akilli-telefon-beyaz-1249222.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-beyaz_p-26064633',
    idefix: 'https://www.idefix.com/apple-iphone-17-256-gb-beyaz-apple-turkiye-garantili-p-13997181',
  },
  'iphone-17-256gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-sis-mavisi-p-HBCV00009Z40TF',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-sis-mavisi-p-985256848',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-256gb-akilli-telefon-sis-mavisi-mg6l4tua-p-0195950643947',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6l4tua-iphone-17-256gb-akilli-telefon-sis-mavisi-1249223.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-256-gb-mavi-cep-telefonu-p-255fabc',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-sis-mavisi_p-26064633',
    idefix: 'https://www.idefix.com/apple-iphone-17-256-gb-sis-mavisi-apple-turkiye-garantili-p-13997182',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-256gb-sis-mavisi-akilli-cep-telefonu-mg6l4tua_1865264',
  },
  'iphone-17-256gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-lavanta-p-HBCV00009Z3Y37',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-256gb-lavanta-p-985256856',
    n11: 'https://www.n11.com/urun/apple-iphone-17-256-gb-apple-turkiye-garantili-100918382',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFBYM12',
    pazarama: 'https://www.pazarama.com/apple-mg6m4tua-iphone-17-256gb-akilli-telefon-lavanta-p-0195950644142',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6m4tua-iphone-17-256gb-akilli-telefon-lavanta-1249224.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-256-gb-cep-telefonu-lavanta_p-26064633',
    idefix: 'https://www.idefix.com/apple-iphone-17-256gb-lavanta-apple-turkiye-garantili-p-13997183',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-256gb-lavanta-akilli-cep-telefonu-mg6m4tua_1865267',
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
    idefix: 'https://www.idefix.com/apple-iphone-17-256-gb-ada-cayi-apple-turkiye-garantili-p-13997184',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 — 512 GB
  // ═══════════════════════════════════════════════════════
  'iphone-17-512gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-siyah-p-HBCV00009Z3V96',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-siyah-p-985256816',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6p4tua-iphone-17-512gb-akilli-telefon-siyah-p-0195950644548',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6p4tua-iphone-17-512gb-akilli-telefon-siyah-1249226.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-512-gb-siyah-cep-telefonu-p-255f8d9',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-siyah_p-26065082',
    idefix: 'https://www.idefix.com/apple-iphone-17-512gb-siyah-apple-turkiye-garantili-p-13997186',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-512gb-siyah-akilli-cep-telefonu-mg6p4tua_1865268',
  },
  'iphone-17-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-beyaz-p-HBCV00009Z3XDK',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-beyaz-p-985256823',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6q4tua-iphone-17-512gb-akilli-telefon-beyaz-p-0195950644746',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6q4tua-iphone-17-512gb-akilli-telefon-beyaz-1249227.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-beyaz_p-26065082',
    idefix: 'https://www.idefix.com/apple-iphone-17-512-gb-beyaz-apple-turkiye-garantili-p-14186926',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-512gb-beyaz-akilli-cep-telefonu-mg6q4tua_1865271',
  },
  'iphone-17-512gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-sis-mavisi-p-HBCV00009Z3YPJ',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-sis-mavisi-p-985256829',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-512gb-akilli-telefon-sis-mavisi-mg6t4tua-p-0195950644944',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6t4tua-iphone-17-512gb-akilli-telefon-sis-mavisi-1249228.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-512-gb-mavi-cep-telefonu-p-255fabe',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-sis-mavisi_p-26065082',
    idefix: 'https://www.idefix.com/apple-iphone-17-512-gb-sis-mavisi-apple-turkiye-garantili-p-14003950',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-512gb-sis-mavisi-akilli-cep-telefonu-mg6t4tua_1865270',
  },
  'iphone-17-512gb-lavender': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-lavanta-p-HBCV00009Z3SG0',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-lavanta-p-985256833',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6u4tua-iphone-17-512gb-akilli-telefon-lavanta-p-0195950645149',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6u4tua-iphone-17-512gb-akilli-telefon-lavanta-1249229.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-512-gb-lavanta-cep-telefonu-p-255fabf',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-512-gb-cep-telefonu-lavanta_p-26065082',
    idefix: 'https://www.idefix.com/apple-iphone-17-512gb-lavanta-apple-turkiye-garantili-p-14003956',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-512gb-lavanta-akilli-cep-telefonu-mg6u4tua_1865272',
  },
  'iphone-17-512gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-512-gb-ada-cayi-p-HBCV00009Z3XIN',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-512gb-ada-cayi-p-985256839',
    n11: 'https://www.n11.com/urun/apple-iphone-17-512-gb-apple-turkiye-garantili-100697071',
    pazarama: 'https://www.pazarama.com/apple-mg6v4tua-iphone-17-512gb-akilli-telefon-adacayi-p-0195950645347',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg6v4tua-iphone-17-512gb-akilli-telefon-adacayi-1249230.html',
    idefix: 'https://www.idefix.com/apple-iphone-17-512-gb-ada-cayi-apple-turkiye-garantili-p-14003959',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-512gb-ada-cayi-akilli-cep-telefonu-mg6v4tua_1865276',
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
    idefix: 'https://www.idefix.com/apple-iphone-air-256gb-uzaysiyahi-apple-turkiye-garantili-p-14004011',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-air-256gb-uzay-siyahi-akilli-cep-telefonu-mg2l4tua_1862711',
  },
  'iphone-17-air-256gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-pamuk-beyazi-p-HBCV00009Z3YH5',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-256gb-pamuk-beyazi-p-985256822',
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
    pazarama: 'https://www.pazarama.com/apple-iphone-air-256gb-akilli-telefon-pamuk-beyazi-mg2m4tua-p-0195950622829',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2m4tua-iphone-air-256gb-akilli-telefon-bulut-beyazi-1249232.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-256-gb-pamuk-beyazi-cep-telefonu-p-255fa97',
    idefix: 'https://www.idefix.com/apple-iphone-air-256gb-pamukbeyazi-apple-turkiye-garantili-p-14004012',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-air-256gb-pamuk-beyazi-akilli-cep-telefonu-mg2m4tua_1862718',
  },
  'iphone-17-air-256gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-gok-mavisi-p-HBCV00009Z6WR8',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-256gb-gok-mavisi-p-985256832',
    n11: 'https://www.n11.com/urun/apple-iphone-air-256-gb-apple-turkiye-garantili-100726529',
    pazarama: 'https://www.pazarama.com/iphone-air-256gb-sky-blue-mg2p4tua-p-195950623222',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2p4tua-iphone-air-256gb-akilli-telefon-gok-mavisi-1249234.html',
    idefix: 'https://www.idefix.com/apple-iphone-air-256gb-gokmavisi-apple-turkiye-garantili-p-14004014',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-air-256gb-gok-mavisi-akilli-cep-telefonu-mg2p4tua_1862741',
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
    trendyol: 'https://www.trendyol.com/apple/iphone-air-512gb-uzay-siyahi-p-985256838',
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    pazarama: 'https://www.pazarama.com/apple-iphone-air-512gb-akilli-telefon-uzay-siyahi-mg2q4tua-p-0195950623420',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2q4tua-iphone-air-512gb-akilli-telefon-uzay-siyahi-1249241.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-uzay-siyahi-cep-telefonu-p-255fab6',
    idefix: 'https://www.idefix.com/apple-iphone-air-512gb-uzaysiyahi-apple-turkiye-garantili-p-14187592',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-air-512gb-uzay-siyahi-akilli-cep-telefonu-mg2q4tua_1862740',
    sok: 'https://www.sokmarket.com.tr/ekstra/apple-iphone-air-512-gb-uzay-siyahi-p-572633',
  },
  'iphone-17-air-512gb-white': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-512-gb-pamuk-beyazi-p-HBCV00009Z3V98',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-512gb-pamuk-beyazi-p-985256819',
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    pazarama: 'https://www.pazarama.com/apple-iphone-air-512gb-akilli-telefon-pamuk-beyazi-mg2t4tua-p-0195950623628',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2t4tua-iphone-air-512gb-akilli-telefon-bulut-beyazi-1249242.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-pamuk-beyazi-cep-telefonu-p-255fab7',
    idefix: 'https://www.idefix.com/apple-iphone-air-512gb-pamukbeyazi-apple-turkiye-garantili-p-14004053',
  },
  'iphone-17-air-512gb-fog-blue': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-512-gb-gok-mavisi-p-HBCV00009Z3YBX',
    trendyol: 'https://www.trendyol.com/apple/iphone-air-512gb-gok-mavisi-p-985256831',
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
    pazarama: 'https://www.pazarama.com/iphone-air-512gb-sky-blue-mg2v4tua-p-195950624021',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg2v4tua-iphone-air-512gb-akilli-telefon-gok-mavisi-1249237.html',
    migros: 'https://www.migros.com.tr/apple-iphone-air-512-gb-mavi-cep-telefonu-p-255f845',
    idefix: 'https://www.idefix.com/apple-iphone-air-512gb-gokmavisi-apple-turkiye-garantili-p-14004063',
    sok: 'https://www.sokmarket.com.tr/ekstra/apple-iphone-air-512-gb-gok-mavisi-p-573560',
  },
  'iphone-17-air-512gb-lavender': {
    n11: 'https://www.n11.com/urun/apple-iphone-air-512-gb-apple-turkiye-garantili-100725280',
  },
  'iphone-17-air-512gb-sage': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-air-512-gb-ucuk-altin-rengi-p-HBCV00009Z3YBW',
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
    idefix: 'https://www.idefix.com/apple-iphone-17pro-256gb-abis-apple-turkiye-garantili-p-14003962',
  },
  'iphone-17-pro-256gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-gumus-p-HBCV00009Z40DM',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-gumus-p-985256847',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFTYPTQ',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-17-pro-256gb-akilli-telefon-gumus-1249236.html',
    idefix: 'https://www.idefix.com/apple-iphone-17pro-256gb-gumusrengi-apple-turkiye-garantili-p-14003960',
  },
  'iphone-17-pro-256gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-kozmik-turuncu-p-HBCV00009Z3XL5',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-kozmik-turuncu-p-985256852',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-256-gb-apple-turkiye-garantili-100712128',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFYN66J',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8h4tua-iphone-17-pro-256gb-akilli-telefon-kozmik-turuncu-1249238.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-256-gb-cep-telefonu-turuncu-_p-26066122',
    idefix: 'https://www.idefix.com/apple-iphone-17-pro-256-gb-kozmik-turuncu-apple-turkiye-garantili-p-14003961',
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
    idefix: 'https://www.idefix.com/apple-iphone-17pro-512gb-abis-apple-turkiye-garantili-p-14003967',
  },
  'iphone-17-pro-512gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-gumus-p-HBCV00009Z3XDN',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-512gb-gumus-p-985256843',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8k4tua-iphone-17-pro-512gb-akilli-telefon-gumus-1249239.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-512-gb-cep-telefonu-gumus_p-26065084',
    idefix: 'https://www.idefix.com/apple-iphone-17pro-512gb-gumusrengi-apple-turkiye-garantili-p-14003963',
  },
  'iphone-17-pro-512gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-512-gb-kozmik-turuncu-p-HBCV00009Z3SG2',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-512gb-kozmik-turuncu-p-985256846',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-512-gb-apple-turkiye-garantili-100723400',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8m4tua-iphone-17-pro-512gb-akilli-telefon-kozmik-turuncu-1249243.html',
    migros: 'https://www.migros.com.tr/apple-iphone-17-pro-512-gb-turuncu-cep-telefonu-p-255f834',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-512-gb-cep-telefonu-turuncu_p-26065084',
    idefix: 'https://www.idefix.com/apple-iphone-17-pro-512-gb-kozmik-turuncu-apple-turkiye-garantili-p-14003964',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-512gb-kozmik-turuncu-akilli-cep-telefonu-mg8m4tua_1865285',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro — 1 TB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-1tb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-abis-p-HBCV00009Z403Y',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-1tb-abis-p-985256817',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-1-tb-apple-turkiye-garantili-100728058',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mg8r4tua-iphone-17-pro-1tb-akilli-telefon-derin-mavi-1249254.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-1-tb-cep-telefonu-abis_p-26066033',
    idefix: 'https://www.idefix.com/apple-iphone-17pro-1-tb-abis-apple-turkiye-garantili-p-14003970',
  },
  'iphone-17-pro-1tb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-gumus-p-HBCV00009Z3ZAB',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-1tb-gumus-p-985256857',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-1-tb-apple-turkiye-garantili-100728058',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-1-tb-cep-telefonu-gumus_p-26066033',
  },
  'iphone-17-pro-1tb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-1-tb-kozmik-turuncu-p-HBCV00009Z3Z03',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-1tb-kozmik-turuncu-p-985256864',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-1-tb-apple-turkiye-garantili-100728058',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-1tb-kozmik-turuncu-akilli-cep-telefonu-mg8q4tua_1865293',
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
    idefix: 'https://www.idefix.com/apple-iphone-17-promax-256gb-abis-apple-turkiye-garantili-p-14003984',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-max-256gb-abis-akilli-cep-telefonu-mfyp4tua_1865303',
  },
  'iphone-17-pro-max-256gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-gumus-p-HBCV00009Z3XIO',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-gumus-p-985256821',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG8NP4B',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-pro-max-256-gb-gumus-cep-telefonu-apple-turkiye-garantili-p-195950638851',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfym4tua-iphone-17-pro-max-256gb-akilli-telefon-gumus-1249245.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-256-gb-cep-telefonu-gumus_p-26066404',
    idefix: 'https://www.idefix.com/apple-iphone-17-promax-256gb-gumusrengi-apple-turkiye-garantili-p-14003973',
  },
  'iphone-17-pro-max-256gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-kozmik-turuncu-p-HBCV00009Z3Z8C',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-kozmik-turuncu-p-985256825',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-256-gb-apple-turkiye-garantili-100816929',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFLHC7F',
    pazarama: 'https://www.pazarama.com/apple-iphone-17-pro-max-256-gb-turuncu-cep-telefonu-apple-turkiye-garantili-p-195950639056',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyn4tua-iphone-17-pro-max-256gb-akilli-telefon-kozmik-turuncu-1249246.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-256-gb-cep-telefonu-kozmik-turuncu_p-26066404',
    idefix: 'https://www.idefix.com/apple-iphone-17-promax-256gb-kozmikturuncu-apple-turkiye-garantili-p-14003983',
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
    idefix: 'https://www.idefix.com/apple-iphone-17-promax-512gb-abis-apple-turkiye-garantili-p-14003988',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-max-512gb-abis-akilli-cep-telefonu-mfyu4tua_1865314',
  },
  'iphone-17-pro-max-512gb-silver': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-gumus-p-HBCV00009Z6WRA',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-gumus-p-985256835',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQG26YH9',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyq4tua-iphone-17-pro-max-512gb-akilli-telefon-gumus-1249255.html',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-512-gb-cep-telefonu-gumus_p-26066544',
    idefix: 'https://www.idefix.com/apple-iphone-17-promax-512gb-gumusrengi-apple-turkiye-garantili-p-14003986',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-max-512gb-gumus-akilli-cep-telefonu-mfyq4tua_1865306',
  },
  'iphone-17-pro-max-512gb-cosmic-orange': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-512-gb-kozmik-turuncu-p-HBCV00009Z3XG8',
    trendyol: 'https://www.trendyol.com/apple/iphone-17-pro-max-512gb-kozmik-turuncu-p-985256866',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-512-gb-apple-turkiye-garantili-100822102',
    amazon: 'https://www.amazon.com.tr/dp/B0FQFJF2DP',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_apple-mfyt4tua-iphone-17-pro-max-512gb-akilli-telefon-kozmik-turuncu-1249256.html',
    idefix: 'https://www.idefix.com/apple-iphone-17-promax-512gb-kozmikturuncu-apple-turkiye-garantili-p-14003987',
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-max-512gb-kozmik-turuncu-akilli-cep-telefonu-mfyt4tua_1865310',
  },

  // ═══════════════════════════════════════════════════════
  //  iPhone 17 Pro Max — 1 TB
  // ═══════════════════════════════════════════════════════
  'iphone-17-pro-max-1tb-obsidian': {
    hepsiburada: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-1-tb-abis-p-HBCV00009Z3XG9',
    n11: 'https://www.n11.com/urun/apple-iphone-17-pro-max-1-tb-apple-turkiye-garantili-100822552',
    a101: 'https://www.a101.com.tr/elektronik/apple-iphone-17-pro-max-1-tb-cep-telefonu-abis_p-26066034',
    idefix: 'https://www.idefix.com/apple-iphone-17pro-max-1-tb-abis-apple-turkiye-garantili-p-14004010',
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
    beymen: 'https://www.beymen.com/tr/p_apple-iphone-17-pro-max-1tb-kozmik-turuncu-akilli-cep-telefonu-mfyw4tua_1865316',
  },
};
