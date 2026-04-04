/**
 * Samsung Galaxy ürün URL'leri — S25 Ultra, S24 Ultra, A56, A36 aileleri.
 * Her varyant için hangi mağazada hangi URL olduğunu buraya yazın.
 *
 * Format:
 *   "varyant-slug": { "retailer-slug": "url", ... }
 *
 * Retailer slug'ları:
 *   "hepsiburada", "trendyol", "n11", "amazon", "pazarama",
 *   "idefix", "mediamarkt", "a101", "migros", "beymen"
 *
 * Notlar:
 *   - N11'de renk seçimi ürün sayfasında yapılır; aynı URL birden fazla renk için kullanılabilir.
 *   - A101/Migros/Beymen Samsung telefon satmıyor (Nisan 2026 itibarıyla).
 *   - Pazarama'da A56/A36 yok; S24 Ultra sınırlı stokta.
 *   - MediaMarkt'ta S24 Ultra yok (eski model).
 *   - Amazon'da S24 Ultra yok (stoktan kalkmış).
 */

export interface SamsungProductUrlMap {
  [variantSlug: string]: {
    [retailerSlug: string]: string;
  };
}

export const SAMSUNG_PRODUCT_URLS: SamsungProductUrlMap = {

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S26 Ultra — 256 GB
  //  TODO: Gerçek URL'ler eklenecek — mağazalarda listelendikçe güncellenecek
  // ═══════════════════════════════════════════════════════
  // 'samsung-galaxy-s26-ultra-256gb-titanium-black': {},
  // 'samsung-galaxy-s26-ultra-256gb-titanium-gray': {},
  // 'samsung-galaxy-s26-ultra-256gb-titanium-blue': {},
  // 'samsung-galaxy-s26-ultra-256gb-titanium-silver': {},

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S26 Ultra — 512 GB
  // ═══════════════════════════════════════════════════════
  // 'samsung-galaxy-s26-ultra-512gb-titanium-black': {},
  // 'samsung-galaxy-s26-ultra-512gb-titanium-gray': {},
  // 'samsung-galaxy-s26-ultra-512gb-titanium-blue': {},
  // 'samsung-galaxy-s26-ultra-512gb-titanium-silver': {},

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S26 Ultra — 1 TB
  // ═══════════════════════════════════════════════════════
  // 'samsung-galaxy-s26-ultra-1tb-titanium-black': {},
  // 'samsung-galaxy-s26-ultra-1tb-titanium-gray': {},
  // 'samsung-galaxy-s26-ultra-1tb-titanium-blue': {},
  // 'samsung-galaxy-s26-ultra-1tb-titanium-silver': {},

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S25 Ultra — 256 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-s25-ultra-256gb-titanium-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-256-gb-titanyum-siyah-p-HBCV00007VSHAT',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-256-gb-titanyum-siyah-cep-telefonu-samsung-turkiye-garantili-p-897483807',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-256-gb-samsung-turkiye-garantili-66615665',
    amazon: 'https://www.amazon.com.tr/dp/B0FYPZN9RQ',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-256-gb-titanyum-siyah-cep-telefonu-samsung-turkiye-garantili-p-8806095848693',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxys25-ultra-12gb256gb-akilli-telefon-titanyum-1245636.html',
  },
  'samsung-galaxy-s25-ultra-256gb-titanium-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-256-gb-titanyum-gri-p-HBCV00007VSHAX',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-256-gb-samsung-turkiye-garantili-66615665',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-256gb-titanyum-gray-samsung-turkiye-garantili-p-8806095847658',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-12gb256gb-akillitelefon-titanyum-1245473.html',
  },
  'samsung-galaxy-s25-ultra-256gb-titanium-blue': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-256-gb-titanyum-mavi-p-HBCV00007VSHAZ',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-256-gb-samsung-turkiye-garantili-66615665',
    amazon: 'https://www.amazon.com.tr/dp/B0GSVQHRDT',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-256-gb-titanyum-mavi-cep-telefonu-samsung-turkiye-garantili-p-8806095849591',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-12gb256gb-akilli-telefon-titanyum-1245472.html',
  },
  'samsung-galaxy-s25-ultra-256gb-titanium-silverblue': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-256-gb-titanyum-gumus-p-HBCV00007VXFP0',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-256-gb-titanyum-gumus-cep-telefonu-turkiye-garantili-p-897493928',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-256-gb-samsung-turkiye-garantili-66615665',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-256gb-titanyum-gumus-samsung-turkiye-garantili-p-8806097015161',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-12256gb-akilli-telefon-titanyum-gumus-1245236.html',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S25 Ultra — 512 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-s25-ultra-512gb-titanium-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-siyah-titanyum-p-HBCV00007MIDSU',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-512-gb-titanyum-siyah-samsung-turkiye-garantili-p-889950721',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-512-gb-samsung-turkiye-garantili-66616334',
    amazon: 'https://www.amazon.com.tr/dp/B0DT6WQHHR',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-12512gb-akilli-telefon-titanyum-siyah-1243753.html',
  },
  'samsung-galaxy-s25-ultra-512gb-titanium-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-gri-titanyum-p-HBCV00007MIF54',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-512-gb-titanyum-gri-p-889950713',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-512-gb-samsung-turkiye-garantili-66616334',
    amazon: 'https://www.amazon.com.tr/dp/B0DT6WD95C',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-gri-cep-telefonu-samsung-turkiye-garantili-p-8806095847641',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-12512gb-akilli-telefon-titanyum-gri-1243752.html',
  },
  'samsung-galaxy-s25-ultra-512gb-titanium-blue': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-mavi-titanyum-p-HBCV00007MIEMJ',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-512-gb-titanyum-mavi-p-889950720',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-512-gb-samsung-turkiye-garantili-66616334',
    amazon: 'https://www.amazon.com.tr/dp/B0DT6ZCQJ3',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-mavi-cep-telefonu-samsung-turkiye-garantili-p-8806095849171',
  },
  'samsung-galaxy-s25-ultra-512gb-titanium-silverblue': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-gumus-titanyum-p-HBCV00007MIEP5',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-512-gb-titanyum-gumus-samsung-turkiye-garantili-p-889950711',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-512-gb-samsung-turkiye-garantili-66616334',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s25-ultra-512-gb-12-gb-ram-gumus-cep-telefonu-samsung-turkiye-garantili-p-8806097015154',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-12-gb-512-gb-akilli-telefon-gumus-164283709.html',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S25 Ultra — 1 TB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-s25-ultra-1tb-titanium-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-1-tb-12-gb-ram-samsung-turkiye-garantili-siyah-titanyum-p-HBCV00007MIEUP',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s25-ultra-1-tb-titanyum-siyah-p-889950717',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-1-tb-samsung-turkiye-garantili-66616391',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-121tb-akilli-telefon-titanyum-siyah-1243746.html',
  },
  'samsung-galaxy-s25-ultra-1tb-titanium-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-1-tb-12-gb-ram-samsung-turkiye-garantili-gri-titanyum-p-HBCV00007MIEML',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-1-tb-samsung-turkiye-garantili-66616391',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-121tb-akilli-telefon-titanyum-gumus-1243749.html',
  },
  'samsung-galaxy-s25-ultra-1tb-titanium-blue': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-1-tb-12-gb-ram-samsung-turkiye-garantili-mavi-titanyum-p-HBCV00007MIEMK',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-1-tb-samsung-turkiye-garantili-66616391',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-121tb-akilli-telefon-titanyum-mavi-1243747.html',
  },
  'samsung-galaxy-s25-ultra-1tb-titanium-silverblue': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s25-ultra-1-tb-12-gb-ram-samsung-turkiye-garantili-gumus-titanyum-p-HBCV00007MIDSW',
    n11: 'https://www.n11.com/urun/samsung-galaxy-s25-ultra-12-gb-1-tb-samsung-turkiye-garantili-66616391',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s25-ultra-121tb-akilli-telefon-titanyum-gri-1243748.html',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S24 Ultra — 256 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-s24-ultra-256gb-titanium-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-256-gb-12-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV00005MLL3N',
  },
  'samsung-galaxy-s24-ultra-256gb-titanium-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-256-gb-12-gb-ram-samsung-turkiye-garantili-gri-p-HBCV00005MLL3M',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s24-ultra-12-gb-ram-256-gb-titanyum-gri-p-792557583',
  },
  'samsung-galaxy-s24-ultra-256gb-titanium-violet': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-256-gb-12-gb-ram-samsung-turkiye-garantili-mor-p-HBCV00005MLL3L',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s24-ultra-12-gb-ram-256-gb-titanyum-mor-p-792557585',
  },
  'samsung-galaxy-s24-ultra-256gb-titanium-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-256-gb-12-gb-ram-samsung-turkiye-garantili-sari-p-HBCV00005MLL3K',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S24 Ultra — 512 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-s24-ultra-512gb-titanium-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV00005MLL3R',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s24-ultra-siyah-512-gb-12-gb-ram-akilli-telefon-samsung-turkiye-garantili-p-8806095302805',
  },
  'samsung-galaxy-s24-ultra-512gb-titanium-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-gri-p-HBCV00005MLKAT',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-s24-ultra-12-gb-ram-512-gb-titanyum-gri-p-792557597',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s24-ultra-gri-512-gb-12-gb-ram-akilli-telefon-samsung-turkiye-garantili-p-8806095303635',
  },
  'samsung-galaxy-s24-ultra-512gb-titanium-violet': {
  },
  'samsung-galaxy-s24-ultra-512gb-titanium-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-512-gb-12-gb-ram-samsung-turkiye-garantili-sari-p-HBCV00005MLL3O',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy S24 Ultra — 1 TB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-s24-ultra-1tb-titanium-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-1-tb-12-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV00005MLL3X',
  },
  'samsung-galaxy-s24-ultra-1tb-titanium-gray': {
  },
  'samsung-galaxy-s24-ultra-1tb-titanium-violet': {
  },
  'samsung-galaxy-s24-ultra-1tb-titanium-yellow': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-s24-ultra-1-tb-12-gb-ram-samsung-turkiye-garantili-sari-p-HBCV00005MLL3U',
    pazarama: 'https://www.pazarama.com/samsung-galaxy-s24-ultra-12-gb-ram-1-tb-titanyum-sari-p-8806095302454',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy A56 5G — 128 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-a56-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-128-gb-8-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV000088BVZR',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a56-5g-8-gb-ram-128-gb-siyah-p-922937990',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a56-5g-128-gb-samsung-turkiye-garantili-74564393',
    amazon: 'https://www.amazon.com.tr/dp/B0F4XG27HM',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-5g-8-gb-128-gb-akilli-telefon-antrasit-168636028.html',
  },
  'samsung-galaxy-a56-128gb-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-128-gb-8-gb-ram-samsung-turkiye-garantili-gri-p-HBCV000088BXB7',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a56-5g-8-gb-ram-128-gb-gri-p-924637677',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a56-5g-128-gb-samsung-turkiye-garantili-74564393',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-8-gb-128-gb-akilli-telefon-gri-163886826.html',
  },
  'samsung-galaxy-a56-128gb-lilac': {
  },
  'samsung-galaxy-a56-128gb-green': {
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy A56 5G — 256 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-a56-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV000088BXWW',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a56-5g-8-gb-ram-256-gb-siyah-p-917839674',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a56-8-gb-256-gb-samsung-turkiye-garantili-73027299',
    amazon: 'https://www.amazon.com.tr/dp/B0F1FRL5HX',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-8256gb-akilli-telefon-antrasit-1245807.html',
  },
  'samsung-galaxy-a56-256gb-gray': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-gri-p-HBCV000088BXB6',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a56-5g-8-gb-ram-256-gb-gri-p-917839731',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a56-8-gb-256-gb-samsung-turkiye-garantili-73027299',
    amazon: 'https://www.amazon.com.tr/dp/B0F1FQZWLY',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-8256gb-akilli-telefon-gri-1245761.html',
  },
  'samsung-galaxy-a56-256gb-lilac': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-acik-pembe-p-HBCV000088BW14',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a56-5g-256-gb-acik-pembe-cep-telefonu-p-917839661',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a56-8-gb-256-gb-samsung-turkiye-garantili-73027299',
    amazon: 'https://www.amazon.com.tr/dp/B0F1FR6LQ8',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-8256gb-akilli-telefon-acik-pembe-1245768.html',
  },
  'samsung-galaxy-a56-256gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-yesil-p-HBCV000088BX6X',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a56-5g-256-gb-yesil-cep-telefonu-p-917839663',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a56-8-gb-256-gb-samsung-turkiye-garantili-73027299',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-8256gb-akilli-telefon-yesil-1245752.html',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy A36 5G — 128 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-a36-128gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-128-gb-8-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV000088BXJB',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a36-5g-128-gb-8-gb-ram-siyah-cep-telefonu-samsung-turkiye-garantili-p-924372954',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a36-5g-128-gb-samsung-turkiye-garantili-74948031',
    amazon: 'https://www.amazon.com.tr/dp/B0F41THB1B',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a36-5g-8-gb-128-gb-akilli-telefon-siyah-168636203.html',
  },
  'samsung-galaxy-a36-128gb-navy': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-128-gb-8-gb-ram-samsung-turkiye-garantili-antrasit-p-HBCV000088BW16',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a36-5g-128-gb-samsung-turkiye-garantili-74948031',
    amazon: 'https://www.amazon.com.tr/dp/B0F41L951K',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a36-8-gb-128-gb-akilli-telefon-gri-163468014.html',
  },
  'samsung-galaxy-a36-128gb-lilac': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-128-gb-8-gb-ram-samsung-turkiye-garantili-lila-p-HBCV000088BWZ4',
  },
  'samsung-galaxy-a36-128gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-128-gb-8-gb-ram-samsung-turkiye-garantili-acik-yesil-p-HBCV000088BXK8',
  },

  // ═══════════════════════════════════════════════════════
  //  Samsung Galaxy A36 5G — 256 GB
  // ═══════════════════════════════════════════════════════
  'samsung-galaxy-a36-256gb-black': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV000088BXFB',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a36-5g-256-gb-8-gb-ram-siyah-cep-telefonu-samsung-turkiye-garantili-p-917839672',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a36-8-gb-256-gb-samsung-turkiye-garantili-73023574',
    amazon: 'https://www.amazon.com.tr/dp/B0F1FRFGVY',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a36-8256gb-akilli-telefon-siyah-1245779.html',
  },
  'samsung-galaxy-a36-256gb-navy': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-acik-gri-p-HBCV000088BX08',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a36-5g-256-gb-acik-gri-cep-telefonu-p-917839768',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a36-8-gb-256-gb-samsung-turkiye-garantili-73023574',
    amazon: 'https://www.amazon.com.tr/dp/B0F1FPM8J7',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a36-8256gb-akilli-telefon-acik-gri-1245781.html',
  },
  'samsung-galaxy-a36-256gb-lilac': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-lila-p-HBCV000088BX9L',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a36-5g-256-gb-lila-cep-telefonu-p-917839904',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a36-8-gb-256-gb-samsung-turkiye-garantili-73023574',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a36-8256gb-akilli-telefon-lila-1245782.html',
  },
  'samsung-galaxy-a36-256gb-green': {
    hepsiburada: 'https://www.hepsiburada.com/samsung-galaxy-a36-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-acik-yesil-p-HBCV000088BWZ3',
    trendyol: 'https://www.trendyol.com/samsung/galaxy-a36-5g-256-gb-acik-yesil-cep-telefonu-p-917839673',
    n11: 'https://www.n11.com/urun/samsung-galaxy-a36-8-gb-256-gb-samsung-turkiye-garantili-73023574',
    amazon: 'https://www.amazon.com.tr/dp/B0F1FPZHLQ',
    mediamarkt: 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a36-8256gb-akilli-telefon-acik-yesil-1245776.html',
  },
};
