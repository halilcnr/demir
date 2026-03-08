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
  // Red: Resmi satıcı bulunamadı (tüm siteler yenilenmiş ürün listeliyor)

  // ─── iPhone 13 256GB ──────────────────────────────────
  'iphone-13-256gb-blue': {
    hepsiburada: 'https://www.hepsiburada.com/iphone-13-256-gb-mavi-p-HBCV00000ODHWO',
  },
  // 256GB diğer renkler: Sadece yenilenmiş ürünler mevcut

  // Diğer model URL'lerini buraya ekleyin.
};
