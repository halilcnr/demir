// ─── Provider / Scraper Çıktı Tipi ─────────────────────────────
export interface ScrapedProduct {
  title: string;
  model: string;       // "iPhone 15 Pro Max"
  storage: string;     // "256GB"
  color?: string;
  price: number;       // TL cinsinden
  url: string;
  seller?: string;
  inStock: boolean;
  retailerSlug: string;
  fetchedAt: Date;
}

// ─── Provider Interface ─────────────────────────────────────────
export interface RetailerProvider {
  retailerSlug: string;
  retailerName: string;
  search(query: string): Promise<ScrapedProduct[]>;
  scrapeProductPage(url: string): Promise<ScrapedProduct | null>;
}

// ─── Dashboard Summary ─────────────────────────────────────────
export interface DashboardSummary {
  totalProducts: number;
  totalListings: number;
  lastSyncAt: string | null;
  topDeals: DealItem[];
  biggestDrops: DealItem[];
  recentAlerts: AlertEventItem[];
  recentlyUpdated: RecentlyUpdatedItem[];
}

export interface DealItem {
  productId: string;
  productModel: string;
  storage: string;
  retailerName: string;
  currentPrice: number;
  previousPrice?: number;
  changePercent?: number;
  url: string;
}

export interface AlertEventItem {
  id: string;
  message: string;
  productModel: string;
  oldPrice?: number;
  newPrice?: number;
  isRead: boolean;
  createdAt: string;
}

export interface RecentlyUpdatedItem {
  productId: string;
  productModel: string;
  storage: string;
  retailerName: string;
  currentPrice: number;
  lastSyncedAt: string;
}

// ─── Product Detail Enriched ────────────────────────────────────
export interface ProductDetail {
  id: string;
  brand: string;
  model: string;
  storage: string;
  color?: string | null;
  slug: string;
  imageUrl?: string | null;
  listings: ListingWithRetailer[];
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
}

export interface ListingWithRetailer {
  id: string;
  retailerName: string;
  retailerSlug: string;
  currentPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  seller?: string | null;
  inStock: boolean;
  externalUrl: string;
  lastSyncedAt: string | null;
}

// ─── Price History Point ────────────────────────────────────────
export interface PriceHistoryPoint {
  date: string;
  price: number;
  retailer: string;
}

// ─── Filters ────────────────────────────────────────────────────
export interface ProductFilters {
  search?: string;
  model?: string;
  storage?: string;
  color?: string;
  retailer?: string;
  page?: number;
  limit?: number;
  sort?: 'price_asc' | 'price_desc' | 'name' | 'updated';
}

// ─── API Response Wrappers ──────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─── Sync Status ────────────────────────────────────────────────
export interface SyncStatusResponse {
  lastJob: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    itemsFound: number;
    itemsUpdated: number;
    errorMessage: string | null;
  } | null;
  retailers: {
    name: string;
    slug: string;
    lastSyncedAt: string | null;
    isActive: boolean;
  }[];
}

// ─── Alert Rule ─────────────────────────────────────────────────
export interface AlertRuleInput {
  productId: string;
  type: 'PRICE_DROP_PERCENT' | 'PRICE_BELOW' | 'NEW_LOWEST';
  threshold?: number;
}
