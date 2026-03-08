// ─── Provider / Scraper Normalize Çıktısı ───────────────────────
export interface ScrapedProduct {
  retailerSlug: string;
  retailerName: string;
  externalId?: string;
  rawTitle: string;
  normalizedModel: string;   // "iPhone 15 Pro Max"
  normalizedColor: string;   // "Natural Titanium"
  normalizedStorageGb: number; // 256
  price: number;
  currency: string;
  sellerName?: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LIMITED' | 'UNKNOWN';
  productUrl: string;
  imageUrl?: string;
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
  totalFamilies: number;
  totalVariants: number;
  totalListings: number;
  activeDeals: number;
  last24hDeals: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  topDeals: DealItem[];
  biggestDrops: DealItem[];
  cheapestByVariant: DealItem[];
  recentAlerts: AlertEventItem[];
  recentlyUpdated: RecentListingItem[];
  syncErrors: string | null;
}

// ─── Deal Item ──────────────────────────────────────────────────
export interface DealItem {
  listingId: string;
  variantId: string;
  familyName: string;
  variantName: string;
  color: string;
  storageGb: number;
  retailerName: string;
  retailerSlug: string;
  currentPrice: number;
  previousPrice?: number | null;
  lowestPrice?: number | null;
  changePercent?: number | null;
  changeAmount?: number | null;
  dealScore?: number | null;
  productUrl: string;
  lastSeenAt?: string | null;
}

// ─── Alert Event ────────────────────────────────────────────────
export interface AlertEventItem {
  id: string;
  alertType: string;
  triggerReason: string;
  variantName?: string;
  retailerName?: string;
  oldPrice?: number | null;
  newPrice?: number | null;
  dropPercent?: number | null;
  isRead: boolean;
  triggeredAt: string;
  productUrl?: string;
}

// ─── Recently Updated Listing ───────────────────────────────────
export interface RecentListingItem {
  listingId: string;
  variantId: string;
  familyName: string;
  variantName: string;
  color: string;
  storageGb: number;
  retailerName: string;
  currentPrice: number | null;
  isDeal: boolean;
  productUrl: string;
  lastSeenAt: string | null;
}

// ─── Variant Detail ─────────────────────────────────────────────
export interface VariantDetail {
  id: string;
  familyId: string;
  familyName: string;
  color: string;
  storageGb: number;
  normalizedName: string;
  slug: string;
  imageUrl?: string | null;
  listings: ListingWithRetailer[];
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  bestRetailer: string | null;
  // Historical intelligence
  historicalLowest: number | null;
  historicalHighest: number | null;
  historicalAverage: number | null;
  average30d: number | null;
  snapshotCount: number;
  dealEvents: VariantDealEvent[];
}

export interface VariantDealEvent {
  id: string;
  eventType: string;
  oldPrice: number | null;
  newPrice: number;
  dropAmount: number | null;
  dropPercent: number | null;
  severity: string;
  isNewAllTimeLow: boolean;
  isBelowAverage: boolean;
  isSuspiciousDiscount: boolean;
  suspiciousReason: string | null;
  retailerName: string;
  detectedAt: string;
}

export interface ListingWithRetailer {
  id: string;
  retailerName: string;
  retailerSlug: string;
  retailerProductTitle: string | null;
  currentPrice: number | null;
  previousPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  sellerName: string | null;
  stockStatus: string;
  isDeal: boolean;
  dealScore: number | null;
  productUrl: string;
  lastSeenAt: string | null;
}

// ─── Price History Point ────────────────────────────────────────
export interface PriceHistoryPoint {
  date: string;
  price: number;
  retailer: string;
}

// ─── Filters ────────────────────────────────────────────────────
export interface VariantFilters {
  search?: string;
  family?: string;
  storage?: string;
  color?: string;
  retailer?: string;
  isDeal?: boolean;
  page?: number;
  limit?: number;
  sort?: 'price_asc' | 'price_desc' | 'name' | 'updated' | 'deal_score';
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
    finishedAt: string | null;
    durationMs: number | null;
    itemsScanned: number;
    itemsMatched: number;
    dealsFound: number;
    successCount: number;
    failureCount: number;
    blockedCount: number;
    lastErrorMessage: string | null;
    errors: string | null;
  } | null;
  retailers: {
    name: string;
    slug: string;
    lastSyncedAt: string | null;
    isActive: boolean;
  }[];
}

// ─── Alert Rule Input ───────────────────────────────────────────
export interface AlertRuleInput {
  variantId?: string;
  familyId?: string;
  retailerSlug?: string;
  type: 'PRICE_DROP_PERCENT' | 'PRICE_BELOW' | 'NEW_LOWEST' | 'CROSS_RETAILER';
  threshold?: number;
}

// ─── Variant List Item ──────────────────────────────────────────
export interface VariantListItem {
  id: string;
  familyName: string;
  color: string;
  storageGb: number;
  normalizedName: string;
  slug: string;
  minPrice: number | null;
  bestRetailerName: string | null;
  bestRetailerSlug: string | null;
  listingCount: number;
  isDeal: boolean;
  topDealScore: number | null;
  lastSeenAt: string | null;
  productUrl: string | null;
  retailers: {
    name: string;
    slug: string;
    price: number | null;
    isDeal: boolean;
    stockStatus: string;
    productUrl: string;
  }[];
}

// ─── Deal Detection Types ───────────────────────────────────────
export interface DetectedDeal {
  listingId: string;
  dealType: DealType;
  score: number;
  reason: string;
  currentPrice: number;
  referencePrice: number;
  dropPercent: number;
}

export type DealType =
  | 'PRICE_DROP'
  | 'DAILY_LOW'
  | 'MONTHLY_LOW'
  | 'ALL_TIME_LOW'
  | 'CROSS_RETAILER_LOW'
  | 'TARGET_PRICE'
  | 'SUDDEN_DROP';

// ─── Best-by-Storage Types ──────────────────────────────────────
export interface BestByStorageGroup {
  familyName: string;
  familySlug: string;
  storageGb: number;
  cheapest: {
    variantId: string;
    color: string;
    price: number;
    retailerName: string;
    retailerSlug: string;
    productUrl: string;
    lastSeenAt: string | null;
  } | null;
  allRetailers: {
    variantId: string;
    color: string;
    retailerName: string;
    retailerSlug: string;
    price: number | null;
    stockStatus: string;
    productUrl: string;
    lastSeenAt: string | null;
  }[];
  priceInsights: {
    cheapestRetailer: string | null;
    secondCheapest: string | null;
    priceSpread: number | null;
    averagePrice: number | null;
    cheapestColor: string | null;
    historicalLowest30d: number | null;
    isBestIn30d: boolean;
  };
}

// ─── System Health Types ────────────────────────────────────────
export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'error';

export interface SystemHealthInfo {
  frontend: { status: HealthStatus; detail: string };
  worker: { status: HealthStatus; detail: string };
  database: { status: HealthStatus; detail: string };
  syncEngine: { status: HealthStatus; detail: string };
}

// ─── Discovery Source Types ─────────────────────────────────────
export const TRUSTED_RETAILERS = [
  'amazon', 'hepsiburada', 'trendyol', 'n11', 'pazarama',
  'idefix', 'mediamarkt', 'a101', 'migros',
] as const;
export type TrustedRetailer = typeof TRUSTED_RETAILERS[number];

export const DISCOVERY_SOURCES = ['akakce', 'cimri', 'enuygun', 'epey'] as const;
export type DiscoverySource = typeof DISCOVERY_SOURCES[number];

// ─── Price Intelligence Types ───────────────────────────────────
export interface PriceIntelligence {
  latestPrice: number | null;
  previousPrice: number | null;
  historicalLowest: number | null;
  historicalHighest: number | null;
  rollingAverage7d: number | null;
  rollingAverage30d: number | null;
  minPrice24h: number | null;
  minPrice7d: number | null;
  minPrice30d: number | null;
  maxPrice30d: number | null;
  priceDrop24h: number | null;
  priceDrop7d: number | null;
  priceDropVsAverage: number | null;
  volatilityScore: number | null;
  trendDirection: 'rising' | 'falling' | 'stable' | 'unknown';
  lastMeaningfulDropPercent: number | null;
  marketPosition: 'cheapest' | 'below_avg' | 'average' | 'above_avg' | 'expensive' | 'unknown';
  isNewAllTimeLow: boolean;
  isBelowHistoricalAverage: boolean;
  isUnusualDrop: boolean;
  snapshotCount: number;
}

export interface DealEventItem {
  id: string;
  listingId: string;
  variantId: string;
  retailerId: string;
  eventType: string;
  oldPrice: number | null;
  newPrice: number;
  dropAmount: number | null;
  dropPercent: number | null;
  basis: string | null;
  severity: string;
  isNewAllTimeLow: boolean;
  isBelowAverage: boolean;
  isSuspiciousDiscount: boolean;
  suspiciousReason: string | null;
  detectedAt: string;
  // Joined
  variantName?: string;
  retailerName?: string;
  familyName?: string;
}

// ─── Live Sync Progress Types ───────────────────────────────────
export interface LiveSyncProgress {
  running: boolean;
  progress: number;
  currentRetailer: string | null;
  currentVariant: string | null;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  totalListings: number;
  processedListings: number;
  step: string;
  startedAt: string | null;
  estimatedRemainingMs: number | null;
}

// ─── Deal Thresholds ────────────────────────────────────────────
export const DEAL_THRESHOLDS = {
  MINOR_DROP_PERCENT: 3,
  NOTABLE_DROP_PERCENT: 5,
  SIGNIFICANT_DROP_PERCENT: 8,
  BELOW_AVG_PERCENT: 5,
  SUSPICIOUS_SPIKE_PERCENT: 15,
  SUSPICIOUS_WINDOW_HOURS: 48,
} as const;
