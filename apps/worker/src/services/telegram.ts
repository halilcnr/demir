import { prisma } from '@repo/shared';
import { DistributedLock, INSTANCE_ID } from '../distributed-lock';

// ─── Configuration ───────────────────────────────────────────────
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

// Env vars as fallback defaults (DB settings override these)
const ENV_MIN_DROP_PERCENT = parseFloat(process.env.NOTIFY_DROP_PERCENT ?? '1');
const ENV_MIN_DROP_AMOUNT = parseFloat(process.env.NOTIFY_DROP_AMOUNT ?? '100');
const ENV_COOLDOWN_MS = parseInt(process.env.NOTIFY_COOLDOWN_MS ?? String(4 * 60 * 60 * 1000), 10);
const POLL_INTERVAL_MS = 30_000; // getUpdates polling interval

const telegramPollLock = new DistributedLock('telegram-poll', 60_000);

// ─── DB Settings Cache ───────────────────────────────────────────
interface CachedSettings {
  notifyDropPercent: number;
  notifyDropAmount: number;
  notifyCooldownMinutes: number;
  notifyAllTimeLow: boolean;
  notifyEnabled: boolean;
  notifyMinPrice: number | null;
  notifyMaxPrice: number | null;
}

let settingsCache: CachedSettings | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 60_000; // 1 min cache

async function getNotifySettings(): Promise<CachedSettings> {
  const now = Date.now();
  if (settingsCache && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
    return settingsCache;
  }

  try {
    const row = await prisma.appSettings.findUnique({ where: { id: 'default' } });
    if (row) {
      settingsCache = {
        notifyDropPercent: row.notifyDropPercent,
        notifyDropAmount: row.notifyDropAmount,
        notifyCooldownMinutes: row.notifyCooldownMinutes,
        notifyAllTimeLow: row.notifyAllTimeLow,
        notifyEnabled: row.notifyEnabled,
        notifyMinPrice: row.notifyMinPrice,
        notifyMaxPrice: row.notifyMaxPrice,
      };
      settingsCacheTime = now;
      return settingsCache;
    }
  } catch (err) {
    console.warn('[telegram] Failed to fetch settings from DB, using env defaults:', err instanceof Error ? err.message : err);
  }

  // Env var fallback
  return {
    notifyDropPercent: ENV_MIN_DROP_PERCENT,
    notifyDropAmount: ENV_MIN_DROP_AMOUNT,
    notifyCooldownMinutes: Math.round(ENV_COOLDOWN_MS / 60_000),
    notifyAllTimeLow: true,
    notifyEnabled: true,
    notifyMinPrice: null,
    notifyMaxPrice: null,
  };
}

// ─── Types ───────────────────────────────────────────────────────
export interface PriceDropPayload {
  listingId: string;
  variantLabel: string;      // "iPhone 15 Pro Max 256GB Natural Titanium"
  retailerName: string;      // "Hepsiburada"
  retailerSlug: string;
  productUrl: string;
  newPrice: number;
  oldPrice: number;
  lowestPrice: number | null;
  isAllTimeLow: boolean;
}

// ─── Smart Deal Types ────────────────────────────────────────────
export interface SmartDealPayload {
  listingId: string;
  variantId: string;
  variantLabel: string;
  retailerName: string;
  retailerSlug: string;
  productUrl: string;
  newPrice: number;
  oldPrice: number | null;
}

interface DealScoreResult {
  score: number;
  tier: 'ignore' | 'minor' | 'good' | 'super';
  reasons: string[];
  indicators: string[];
  metrics: {
    lowestPrice: number | null;
    top3Average: number | null;
    marketAverage: number | null;
    historicalLowest: number | null;
    priceStandardDeviation: number | null;
    savingsVsMarket: number | null;
    savingsVsTop3: number | null;
    clusterGapPercent: number | null;
  };
}

// ─── Stats ───────────────────────────────────────────────────────
let sentCount = 0;
let failCount = 0;
let skippedCount = 0;
let subscriberCount = 0;

export function getTelegramStats() {
  return { sentCount, failCount, skippedCount, subscriberCount, enabled: TELEGRAM_ENABLED };
}

// ─── Core: Send message to a single chat ─────────────────────────
async function sendToChat(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await resp.json() as { ok: boolean; description?: string };

    if (!data.ok) {
      // If user blocked the bot, deactivate subscriber
      if (resp.status === 403) {
        await prisma.telegramSubscriber.updateMany({
          where: { chatId },
          data: { isActive: false },
        }).catch(() => {});
      }
      return { ok: false, error: data.description ?? `HTTP ${resp.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Broadcast: send to ALL active subscribers ───────────────────
async function broadcast(text: string): Promise<{ sent: number; failed: number }> {
  const subscribers = await prisma.telegramSubscriber.findMany({
    where: { isActive: true },
    select: { chatId: true },
  });

  subscriberCount = subscribers.length;

  if (subscribers.length === 0) {
    console.log('[telegram] No active subscribers, skipping broadcast');
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const result = await sendToChat(sub.chatId, text);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      console.error(`[telegram] Failed to send to ${sub.chatId}: ${result.error}`);
    }
  }

  return { sent, failed };
}

// ─── Build Turkish price drop message ────────────────────────────
function buildPriceDropMessage(payload: PriceDropPayload): string {
  const { variantLabel, retailerName, productUrl, newPrice, oldPrice, lowestPrice, isAllTimeLow } = payload;

  const dropAmount = oldPrice - newPrice;
  const dropPercent = ((dropAmount / oldPrice) * 100).toFixed(1);

  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

  const lines: string[] = [];

  if (isAllTimeLow) {
    lines.push('🔥 <b>YENİ EN DÜŞÜK FİYAT!</b>');
  } else {
    lines.push('📉 <b>Fiyat Düşüşü Tespit Edildi</b>');
  }

  lines.push('');
  lines.push(`📱 <b>${variantLabel}</b>`);
  lines.push(`🏪 ${retailerName}`);
  lines.push('');
  lines.push(`💰 <s>${fmtPrice(oldPrice)} TL</s>  →  <b>${fmtPrice(newPrice)} TL</b>`);
  lines.push('');
  lines.push(`📉 <b>%${dropPercent} düşüş</b> (${fmtPrice(dropAmount)} TL fark)`);
  lines.push('');
  lines.push(`🔗 <a href="${productUrl}">Ürüne Git</a>`);

  return lines.join('\n');
}

// ─── Anti-spam / deduplication checks ────────────────────────────
async function shouldNotify(payload: PriceDropPayload): Promise<{ send: boolean; reason?: string }> {
  const { listingId, newPrice, oldPrice, isAllTimeLow } = payload;
  const settings = await getNotifySettings();

  // Master switch from DB
  if (!settings.notifyEnabled) {
    return { send: false, reason: 'Notifications disabled in settings' };
  }

  const dropAmount = oldPrice - newPrice;
  const dropPercent = ((dropAmount / oldPrice) * 100);

  // All-time low bypass: skip threshold check if enabled
  const allTimeLowBypass = isAllTimeLow && settings.notifyAllTimeLow;

  if (!allTimeLowBypass && dropPercent < settings.notifyDropPercent && dropAmount < settings.notifyDropAmount) {
    return { send: false, reason: `Drop too small: ${dropAmount.toFixed(0)} TL (${dropPercent.toFixed(1)}%) — min %${settings.notifyDropPercent} or ${settings.notifyDropAmount} TL` };
  }

  // Price range filter
  if (settings.notifyMinPrice != null && newPrice < settings.notifyMinPrice) {
    return { send: false, reason: `Price ${newPrice} TL below min filter ${settings.notifyMinPrice} TL` };
  }
  if (settings.notifyMaxPrice != null && newPrice > settings.notifyMaxPrice) {
    return { send: false, reason: `Price ${newPrice} TL above max filter ${settings.notifyMaxPrice} TL` };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { lastNotifiedPrice: true, notificationSentAt: true },
  });

  if (listing?.lastNotifiedPrice === newPrice) {
    return { send: false, reason: `Already notified for this price (${newPrice} TL)` };
  }

  const cooldownMs = settings.notifyCooldownMinutes * 60_000;
  if (listing?.notificationSentAt) {
    const elapsed = Date.now() - listing.notificationSentAt.getTime();
    if (elapsed < cooldownMs) {
      const remainingMin = Math.round((cooldownMs - elapsed) / 60_000);
      return { send: false, reason: `Cooldown active (${remainingMin}m remaining)` };
    }
  }

  return { send: true };
}

// ─── Public: Attempt to send price drop notification ─────────────
export async function notifyPriceDrop(payload: PriceDropPayload): Promise<void> {
  if (!TELEGRAM_ENABLED) {
    return;
  }

  const check = await shouldNotify(payload);
  if (!check.send) {
    skippedCount++;
    console.log(`[telegram] Skipped ${payload.retailerSlug} ${payload.variantLabel}: ${check.reason}`);
    return;
  }

  // ── Atomic claim: prevent duplicate sends across replicas ──
  // Only proceed if we successfully mark this listing as "notification claimed"
  // The WHERE clause ensures only one replica wins the race.
  const cooldownMs = (await getNotifySettings()).notifyCooldownMinutes * 60_000;
  const cooldownThreshold = new Date(Date.now() - cooldownMs);

  const claimed = await prisma.listing.updateMany({
    where: {
      id: payload.listingId,
      OR: [
        { lastNotifiedPrice: { not: payload.newPrice } },
        { lastNotifiedPrice: null },
      ],
      AND: [
        {
          OR: [
            { notificationSentAt: null },
            { notificationSentAt: { lt: cooldownThreshold } },
          ],
        },
      ],
    },
    data: {
      lastNotifiedPrice: payload.newPrice,
      notificationSentAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    skippedCount++;
    console.log(`[telegram] Skipped ${payload.retailerSlug} ${payload.variantLabel}: already claimed by another replica`);
    return;
  }

  const message = buildPriceDropMessage(payload);
  const result = await broadcast(message);

  const msgType = payload.isAllTimeLow ? 'ALL_TIME_LOW' : 'PRICE_DROP';

  if (result.sent > 0) {
    sentCount++;
    console.log(`[telegram] ✓ Broadcast price drop: ${payload.retailerSlug} — ${payload.variantLabel} (${payload.newPrice} TL) → ${result.sent} subscriber(s)`);

    await prisma.notificationLog.create({
      data: {
        messageType: msgType as never,
        status: result.failed > 0 ? 'PARTIAL' : 'SENT',
        productName: payload.variantLabel,
        retailer: payload.retailerName,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        dropPercent: ((payload.oldPrice - payload.newPrice) / payload.oldPrice) * 100,
        messageText: message,
        sentTo: result.sent,
        failedTo: result.failed,
        listingId: payload.listingId,
      },
    }).catch(() => {});
  } else {
    failCount++;
    console.error(`[telegram] ✗ Broadcast failed: ${result.failed} failure(s), 0 sent`);

    await prisma.notificationLog.create({
      data: {
        messageType: msgType as never,
        status: 'FAILED',
        productName: payload.variantLabel,
        retailer: payload.retailerName,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        dropPercent: ((payload.oldPrice - payload.newPrice) / payload.oldPrice) * 100,
        messageText: message,
        sentTo: 0,
        failedTo: result.failed,
        errorMessage: 'All subscribers failed',
        listingId: payload.listingId,
      },
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SMART DEAL ALERT SYSTEM — Intelligent high-confidence deal detection
//  Only sends Telegram alerts for score ≥ 80 (SUPER DEAL)
// ═══════════════════════════════════════════════════════════════════

// ─── Constants ───────────────────────────────────────────────────
const SMART_COOLDOWN_MS = 60 * 60 * 1000;  // 1 hour minimum between alerts per listing
const SMART_RE_ALERT_DROP_PERCENT = 1;      // must drop at least 1% more to re-alert
const SMART_MIN_SCORE = 80;                 // only score >= 80 triggers Telegram

// ─── Live Market Analysis ────────────────────────────────────────
interface MarketAnalysis {
  lowestPrice: number;
  top3AveragePrice: number;
  marketAveragePrice: number;
  historicalLowestPrice: number | null;
  priceStandardDeviation: number;
  clusterGapPercent: number | null;
  retailerCount: number;
  allPrices: { price: number; slug: string; name: string }[];
  // Enhancement fields
  crossColorCheapest: number | null;    // cheapest price among sibling colors
  trendMomentumDrops: number;           // consecutive recent price drops
  historicalPercentile: number | null;   // price percentile in historical distribution (0=cheapest ever)
}

/**
 * Compute live market metrics for a variant by querying all active retailer prices.
 * This avoids relying on potentially stale VariantPriceAnalytics.
 */
async function computeLiveMarketAnalysis(variantId: string): Promise<MarketAnalysis | null> {
  // Get the variant to find its familyId + storageGb for cross-color comparison
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { familyId: true, storageGb: true },
  });

  const listings = await prisma.listing.findMany({
    where: {
      variantId,
      isActive: true,
      currentPrice: { not: null, gt: 0 },
      stockStatus: { in: ['IN_STOCK', 'LIMITED'] },
    },
    include: { retailer: true },
    orderBy: { currentPrice: 'asc' },
  });

  const activePrices = listings
    .filter(l => l.currentPrice != null && l.currentPrice > 0)
    .map(l => ({ price: l.currentPrice!, slug: l.retailer.slug, name: l.retailer.name, listingId: l.id }));

  if (activePrices.length < 2) return null; // Need at least 2 retailers for meaningful comparison

  const prices = activePrices.map(p => p.price);
  const lowestPrice = prices[0];
  const top3 = prices.slice(0, Math.min(3, prices.length));
  const top3AveragePrice = top3.reduce((a, b) => a + b, 0) / top3.length;
  const marketAveragePrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Standard deviation of current market prices
  const mean = marketAveragePrice;
  const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
  const priceStandardDeviation = Math.sqrt(variance);

  // Cluster gap: % difference between cheapest and second cheapest
  let clusterGapPercent: number | null = null;
  if (prices.length >= 2 && prices[1] > 0) {
    clusterGapPercent = Math.round(((prices[1] - prices[0]) / prices[1]) * 100 * 10) / 10;
  }

  // Historical lowest across ALL snapshots for this variant
  const listingIds = listings.map(l => l.id);
  const historicalAgg = await prisma.priceSnapshot.aggregate({
    where: { listingId: { in: listingIds } },
    _min: { observedPrice: true },
  });

  // ── Cross-color cheapest: find cheapest price across all colors of the same model+storage ──
  let crossColorCheapest: number | null = null;
  if (variant) {
    const siblingListings = await prisma.listing.findMany({
      where: {
        variant: { familyId: variant.familyId, storageGb: variant.storageGb },
        variantId: { not: variantId },
        isActive: true,
        currentPrice: { not: null, gt: 0 },
        stockStatus: { in: ['IN_STOCK', 'LIMITED'] },
      },
      select: { currentPrice: true },
      orderBy: { currentPrice: 'asc' },
      take: 1,
    });
    if (siblingListings.length > 0 && siblingListings[0].currentPrice != null) {
      crossColorCheapest = siblingListings[0].currentPrice;
    }
  }

  // ── Trend momentum: check for consecutive price drops in recent snapshots ──
  let trendMomentumDrops = 0;
  if (listingIds.length > 0) {
    const recentSnapshots = await prisma.priceSnapshot.findMany({
      where: { listingId: { in: listingIds } },
      orderBy: { observedAt: 'desc' },
      take: 10,
      select: { observedPrice: true },
    });
    if (recentSnapshots.length >= 3) {
      for (let i = 0; i < recentSnapshots.length - 1; i++) {
        if (recentSnapshots[i].observedPrice < recentSnapshots[i + 1].observedPrice) {
          trendMomentumDrops++;
        } else {
          break; // Consecutive check: stop at first non-drop
        }
      }
    }
  }

  // ── Historical percentile: what percentile is the current cheapest price in? ──
  let historicalPercentile: number | null = null;
  if (listingIds.length > 0) {
    const [totalCount, belowCount] = await Promise.all([
      prisma.priceSnapshot.count({ where: { listingId: { in: listingIds } } }),
      prisma.priceSnapshot.count({ where: { listingId: { in: listingIds }, observedPrice: { gte: lowestPrice } } }),
    ]);
    if (totalCount > 0) {
      historicalPercentile = Math.round(((totalCount - belowCount) / totalCount) * 100);
    }
  }

  return {
    lowestPrice,
    top3AveragePrice,
    marketAveragePrice,
    historicalLowestPrice: historicalAgg._min.observedPrice,
    priceStandardDeviation,
    clusterGapPercent,
    retailerCount: activePrices.length,
    allPrices: activePrices.map(p => ({ price: p.price, slug: p.slug, name: p.name })),
    crossColorCheapest,
    trendMomentumDrops,
    historicalPercentile,
  };
}

// ─── Deal Score Computation (live market data) ──────────────────
async function computeDealScore(variantId: string, newPrice: number, oldPrice: number | null): Promise<DealScoreResult> {
  const empty: DealScoreResult = {
    score: 0, tier: 'ignore', reasons: [], indicators: [],
    metrics: { lowestPrice: null, top3Average: null, marketAverage: null, historicalLowest: null, priceStandardDeviation: null, savingsVsMarket: null, savingsVsTop3: null, clusterGapPercent: null },
  };

  const market = await computeLiveMarketAnalysis(variantId);
  if (!market) return empty;

  let score = 0;
  const reasons: string[] = [];
  const indicators: string[] = [];

  // ── +40: Below all-time historical lowest ──
  if (market.historicalLowestPrice != null && newPrice < market.historicalLowestPrice) {
    score += 40;
    reasons.push('Tüm zamanların en düşük fiyatı');
    indicators.push('🔥');
  }

  // ── +25: Below top 3 average by 3%+ ──
  if (newPrice < market.top3AveragePrice * 0.97) {
    const pct = ((market.top3AveragePrice - newPrice) / market.top3AveragePrice * 100).toFixed(1);
    score += 25;
    reasons.push(`Top 3 ortalamanın %${pct} altında`);
  }

  // ── +20: Below market average by 5%+ ──
  if (newPrice < market.marketAveragePrice * 0.95) {
    const pct = ((market.marketAveragePrice - newPrice) / market.marketAveragePrice * 100).toFixed(1);
    score += 20;
    reasons.push(`Piyasa ortalamasının %${pct} altında`);
  }

  // ── +10: Cluster gap > 5% (cheapest is significantly below 2nd cheapest) ──
  if (market.clusterGapPercent != null && market.clusterGapPercent > 5 && newPrice <= market.lowestPrice) {
    score += 10;
    reasons.push(`Rakiplerden %${market.clusterGapPercent.toFixed(1)} daha ucuz`);
    indicators.push('⚡');
  }

  // ── +5: Statistical outlier — price > 2σ below market mean ──
  if (market.priceStandardDeviation > 0) {
    const zScore = (market.marketAveragePrice - newPrice) / market.priceStandardDeviation;
    if (zScore > 2) {
      score += 5;
      reasons.push('Piyasada istatistiksel anomali');
    }
  }

  // ══ NEW ENHANCEMENT 1: Cross-color comparison (+15) ══
  // If this variant's cheapest price beats all sibling colors of the same model+storage
  if (market.crossColorCheapest != null && newPrice < market.crossColorCheapest) {
    const colorDiffPct = ((market.crossColorCheapest - newPrice) / market.crossColorCheapest * 100).toFixed(1);
    score += 15;
    reasons.push(`Diğer renklere göre %${colorDiffPct} daha ucuz`);
    indicators.push('🎨');
  }

  // ══ NEW ENHANCEMENT 2: Trend momentum (+10) ══
  // Reward consistent downward price trend (3+ consecutive drops = strong signal)
  if (market.trendMomentumDrops >= 3) {
    score += 10;
    reasons.push(`Ardışık ${market.trendMomentumDrops} fiyat düşüşü (güçlü düşüş trendi)`);
    indicators.push('📉');
  } else if (market.trendMomentumDrops >= 2) {
    score += 5;
    reasons.push(`Ardışık ${market.trendMomentumDrops} fiyat düşüşü`);
  }

  // ══ NEW ENHANCEMENT 3: Historical percentile position (+10) ══
  // If price is in the bottom 10th percentile of all historical prices
  if (market.historicalPercentile != null && market.historicalPercentile <= 10) {
    score += 10;
    reasons.push(`Tarihsel fiyatların en düşük %${market.historicalPercentile} diliminde`);
    indicators.push('📊');
  } else if (market.historicalPercentile != null && market.historicalPercentile <= 20) {
    score += 5;
    reasons.push(`Tarihsel fiyatların en düşük %${market.historicalPercentile} diliminde`);
  }

  // ── Bonus indicator: sudden crash (>10% from previous price) ──
  if (oldPrice != null && oldPrice > 0) {
    const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
    if (dropPct > 10) {
      indicators.push('📉');
      reasons.push(`Ani %${dropPct.toFixed(1)} fiyat çöküşü tespit edildi`);
    }
  }

  score = Math.min(100, score);

  let tier: DealScoreResult['tier'];
  if (score >= 80) tier = 'super';
  else if (score >= 60) tier = 'good';
  else if (score >= 40) tier = 'minor';
  else tier = 'ignore';

  const savingsVsMarket = Math.round(market.marketAveragePrice - newPrice);
  const savingsVsTop3 = Math.round(market.top3AveragePrice - newPrice);

  return {
    score,
    tier,
    reasons,
    indicators,
    metrics: {
      lowestPrice: market.lowestPrice,
      top3Average: Math.round(market.top3AveragePrice),
      marketAverage: Math.round(market.marketAveragePrice),
      historicalLowest: market.historicalLowestPrice,
      priceStandardDeviation: Math.round(market.priceStandardDeviation),
      savingsVsMarket: savingsVsMarket > 0 ? savingsVsMarket : null,
      savingsVsTop3: savingsVsTop3 > 0 ? savingsVsTop3 : null,
      clusterGapPercent: market.clusterGapPercent,
    },
  };
}

// ─── Smart Anti-Spam ─────────────────────────────────────────────
async function shouldSendSmartAlert(listingId: string, newPrice: number): Promise<{ send: boolean; reason?: string }> {
  const settings = await getNotifySettings();
  if (!settings.notifyEnabled) {
    return { send: false, reason: 'Bildirimler ayarlardan kapatılmış' };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { lastNotifiedPrice: true, notificationSentAt: true },
  });

  // Same price — never re-alert
  if (listing?.lastNotifiedPrice === newPrice) {
    return { send: false, reason: `Bu fiyat için zaten bildirim gönderildi (${newPrice} TL)` };
  }

  // Cooldown: 1 hour per listing
  if (listing?.notificationSentAt) {
    const elapsed = Date.now() - listing.notificationSentAt.getTime();
    if (elapsed < SMART_COOLDOWN_MS) {
      const remainingMin = Math.round((SMART_COOLDOWN_MS - elapsed) / 60_000);
      return { send: false, reason: `Bekleme süresi aktif (${remainingMin}dk kaldı)` };
    }
  }

  // Re-alert threshold: price must drop at least 1% more from last alerted price
  if (listing?.lastNotifiedPrice != null) {
    const additionalDropPct = ((listing.lastNotifiedPrice - newPrice) / listing.lastNotifiedPrice) * 100;
    if (additionalDropPct < SMART_RE_ALERT_DROP_PERCENT) {
      return { send: false, reason: `Son uyarıdan bu yana yeterli düşüş yok (%${additionalDropPct.toFixed(1)} < %${SMART_RE_ALERT_DROP_PERCENT})` };
    }
  }

  return { send: true };
}

// ─── Rich Turkish Message Builder ────────────────────────────────
function buildSmartAlertMessage(payload: SmartDealPayload, sr: DealScoreResult): string {
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const lines: string[] = [];

  // ── Header based on tier ──
  if (sr.score >= 90) {
    lines.push('🔥🔥🔥 <b>SÜPER FIRSAT TESPİT EDİLDİ!</b> 🔥🔥🔥');
  } else {
    lines.push('🔥🔥 <b>SÜPER FIRSAT TESPİT EDİLDİ!</b> 🔥🔥');
  }
  lines.push('');

  // ── Product & retailer ──
  lines.push(`📱 <b>Ürün:</b>`);
  lines.push(`${payload.variantLabel}`);
  lines.push('');
  lines.push(`🏪 <b>Mağaza:</b> ${payload.retailerName}`);
  lines.push('');

  // ── Price info ──
  lines.push(`💰 <b>Fiyat:</b> <b>${fmtPrice(payload.newPrice)} TL</b>`);
  if (payload.oldPrice != null && payload.oldPrice !== payload.newPrice) {
    lines.push(`   <s>${fmtPrice(payload.oldPrice)} TL</s> → <b>${fmtPrice(payload.newPrice)} TL</b>`);
  }
  lines.push('');

  // ── Market comparison table ──
  if (sr.metrics.top3Average != null) {
    lines.push(`📊 <b>Top 3 Ort:</b> ${fmtPrice(sr.metrics.top3Average)} TL`);
  }
  if (sr.metrics.marketAverage != null) {
    lines.push(`📈 <b>Piyasa Ort:</b> ${fmtPrice(sr.metrics.marketAverage)} TL`);
  }
  if (sr.metrics.historicalLowest != null) {
    lines.push(`📉 <b>Tüm Zamanlar En Düşük:</b> ${fmtPrice(sr.metrics.historicalLowest)} TL`);
  }
  lines.push('');

  // ── Savings ──
  if (sr.metrics.savingsVsMarket != null && sr.metrics.marketAverage != null && sr.metrics.marketAverage > 0) {
    const savingsPct = ((sr.metrics.savingsVsMarket / sr.metrics.marketAverage) * 100).toFixed(1);
    lines.push(`💸 <b>Piyasaya göre tasarruf:</b> <b>-${fmtPrice(sr.metrics.savingsVsMarket)} TL</b> (%${savingsPct})`);
  }
  lines.push('');

  // ── Confidence score ──
  lines.push(`🎯 <b>Güven Skoru:</b> ${sr.score} / 100`);
  lines.push('');

  // ── Deal type / reasons ──
  if (sr.reasons.length > 0) {
    lines.push('<b>Fırsat Nedenleri:</b>');
    for (const reason of sr.reasons) {
      lines.push(`  • ${reason}`);
    }
    lines.push('');
  }

  // ── Link ──
  lines.push(`🔗 <a href="${payload.productUrl}">Ürüne Git →</a>`);

  return lines.join('\n');
}

// ─── Public: Smart Deal Notification (score ≥ 80 only) ───────────
export async function notifySmartDeal(payload: SmartDealPayload): Promise<void> {
  if (!TELEGRAM_ENABLED) return;

  // 1) Compute deal score from live market data
  const sr = await computeDealScore(payload.variantId, payload.newPrice, payload.oldPrice);
  console.log(`[telegram-smart] ${payload.retailerSlug} ${payload.variantLabel}: score=${sr.score} tier=${sr.tier}`);

  // 2) Only SUPER deals (score ≥ 80) get Telegram notifications
  if (sr.score < SMART_MIN_SCORE) {
    skippedCount++;
    console.log(`[telegram-smart] Atlandı (skor ${sr.score} < ${SMART_MIN_SCORE}): ${payload.variantLabel}`);
    return;
  }

  // 3) Anti-spam check (same price, cooldown, re-alert threshold)
  const spam = await shouldSendSmartAlert(payload.listingId, payload.newPrice);
  if (!spam.send) {
    skippedCount++;
    console.log(`[telegram-smart] Anti-spam engeli: ${spam.reason}`);
    return;
  }

  // 4) Atomic claim — prevent duplicate sends across replicas
  const cooldownThreshold = new Date(Date.now() - SMART_COOLDOWN_MS);
  const claimed = await prisma.listing.updateMany({
    where: {
      id: payload.listingId,
      OR: [
        { lastNotifiedPrice: { not: payload.newPrice } },
        { lastNotifiedPrice: null },
      ],
      AND: [{
        OR: [
          { notificationSentAt: null },
          { notificationSentAt: { lt: cooldownThreshold } },
        ],
      }],
    },
    data: {
      lastNotifiedPrice: payload.newPrice,
      notificationSentAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    skippedCount++;
    console.log(`[telegram-smart] Başka replika tarafından talep edilmiş`);
    return;
  }

  // 5) Build & broadcast
  const message = buildSmartAlertMessage(payload, sr);
  const result = await broadcast(message);

  // 6) Log
  const dropPercent = payload.oldPrice != null && payload.oldPrice > 0
    ? ((payload.oldPrice - payload.newPrice) / payload.oldPrice) * 100
    : null;

  if (result.sent > 0) {
    sentCount++;
    console.log(`[telegram-smart] ✓ SÜPER FIRSAT gönderildi: ${payload.variantLabel} (${payload.newPrice} TL, skor=${sr.score}) → ${result.sent} abone`);

    await prisma.notificationLog.create({
      data: {
        messageType: 'DEAL_ALERT' as never,
        status: result.failed > 0 ? 'PARTIAL' : 'SENT',
        productName: payload.variantLabel,
        retailer: payload.retailerName,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        dropPercent,
        messageText: message,
        sentTo: result.sent,
        failedTo: result.failed,
        listingId: payload.listingId,
      },
    }).catch(() => {});
  } else {
    failCount++;
    console.error(`[telegram-smart] ✗ Yayın başarısız: ${result.failed} hata`);

    await prisma.notificationLog.create({
      data: {
        messageType: 'DEAL_ALERT' as never,
        status: 'FAILED',
        productName: payload.variantLabel,
        retailer: payload.retailerName,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        dropPercent,
        messageText: message,
        sentTo: 0,
        failedTo: result.failed,
        errorMessage: 'Tüm abonelere gönderilemedi',
        listingId: payload.listingId,
      },
    }).catch(() => {});
  }
}

// ─── Public: Send a test message to all subscribers ──────────────
export async function sendTestMessage(): Promise<{ ok: boolean; sent?: number; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const text = [
    '✅ <b>Telegram Bildirim Testi</b>',
    '',
    'bakiphone.vercel.app worker bağlantısı başarılı!',
    `⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
  ].join('\n');

  const result = await broadcast(text);

  await prisma.notificationLog.create({
    data: {
      messageType: 'TEST_MESSAGE',
      status: result.sent > 0 ? 'SENT' : 'FAILED',
      messageText: text,
      sentTo: result.sent,
      failedTo: result.failed,
      errorMessage: result.sent === 0 ? (result.failed > 0 ? `${result.failed} failed` : 'No active subscribers') : null,
    },
  }).catch(() => {});

  if (result.sent > 0) {
    return { ok: true, sent: result.sent };
  }
  return { ok: false, sent: 0, error: result.failed > 0 ? `${result.failed} failed` : 'No active subscribers' };
}

// ─── Public: Send a custom text message to all subscribers ───────
export async function sendCustomMessage(text: string): Promise<{ ok: boolean; sent?: number; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const result = await broadcast(text);

  await prisma.notificationLog.create({
    data: {
      messageType: 'TEST_MESSAGE',
      status: result.sent > 0 ? 'SENT' : 'FAILED',
      messageText: text,
      sentTo: result.sent,
      failedTo: result.failed,
      errorMessage: result.sent === 0 ? (result.failed > 0 ? `${result.failed} failed` : 'No active subscribers') : null,
    },
  }).catch(() => {});

  if (result.sent > 0) {
    return { ok: true, sent: result.sent };
  }
  return { ok: false, sent: 0, error: result.failed > 0 ? `${result.failed} failed` : 'No active subscribers' };
}

// ─── Public: Send a listing price alert (test/manual) ────────────
export async function sendListingAlert(listingId: string): Promise<{ ok: boolean; sent?: number; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { variant: { include: { family: true } }, retailer: true },
  });

  if (!listing) {
    return { ok: false, error: 'Listing not found' };
  }

  const variantLabel = `${listing.variant.family.name} ${listing.variant.color} ${listing.variant.storageGb}GB`;
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

  const lines: string[] = [
    '📊 <b>Fiyat Bilgisi</b>',
    '',
    `📱 <b>${variantLabel}</b>`,
    `🏪 ${listing.retailer.name}`,
    '',
  ];

  if (listing.currentPrice && listing.previousPrice) {
    lines.push(`💰 <s>${fmtPrice(listing.previousPrice)} TL</s>  →  <b>${fmtPrice(listing.currentPrice)} TL</b>`);
    const diff = listing.previousPrice - listing.currentPrice;
    const pct = ((diff / listing.previousPrice) * 100).toFixed(1);
    if (diff > 0) {
      lines.push('');
      lines.push(`📉 <b>%${pct} düşüş</b> (${fmtPrice(diff)} TL fark)`);
    } else if (diff < 0) {
      lines.push('');
      lines.push(`📈 <b>%${(Math.abs(diff) / listing.previousPrice * 100).toFixed(1)} artış</b> (${fmtPrice(Math.abs(diff))} TL fark)`);
    }
  } else if (listing.currentPrice) {
    lines.push(`💰 Güncel: <b>${fmtPrice(listing.currentPrice)} TL</b>`);
  }

  lines.push('');
  lines.push(`🔗 <a href="${listing.productUrl}">Ürüne Git</a>`);

  const text = lines.join('\n');
  const result = await broadcast(text);

  await prisma.notificationLog.create({
    data: {
      messageType: 'TEST_MESSAGE',
      status: result.sent > 0 ? 'SENT' : 'FAILED',
      productName: variantLabel,
      retailer: listing.retailer.name,
      oldPrice: listing.previousPrice,
      newPrice: listing.currentPrice,
      messageText: text,
      sentTo: result.sent,
      failedTo: result.failed,
      listingId: listing.id,
      errorMessage: result.sent === 0 ? (result.failed > 0 ? `${result.failed} failed` : 'No active subscribers') : null,
    },
  }).catch(() => {});

  if (result.sent > 0) {
    return { ok: true, sent: result.sent };
  }
  return { ok: false, sent: 0, error: result.failed > 0 ? `${result.failed} failed` : 'No active subscribers' };
}

// ─── Public: Test Smart Deal Alert (picks best deal or uses a listing) ───
export async function sendSmartDealTest(listingId?: string): Promise<{ ok: boolean; sent?: number; score?: number; tier?: string; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  // Find target listing: specific one or the best current deal
  const includeOpts = { variant: { include: { family: true } }, retailer: true } as const;
  const listing = listingId
    ? await prisma.listing.findUnique({ where: { id: listingId }, include: includeOpts })
    : await prisma.listing.findFirst({
        where: { isActive: true, currentPrice: { not: null, gt: 0 }, stockStatus: 'IN_STOCK' },
        include: includeOpts,
        orderBy: { dealScore: 'desc' },
      });

  if (!listing || !listing.currentPrice) {
    return { ok: false, error: 'Uygun listing bulunamadı' };
  }

  const variantLabel = `${listing.variant.family.name} ${listing.variant.color} ${listing.variant.storageGb}GB`;

  // Compute the real deal score using live market data
  const sr = await computeDealScore(
    listing.variantId,
    listing.currentPrice,
    listing.previousPrice,
  );

  // Build the message (send regardless of score for testing purposes)
  const payload: SmartDealPayload = {
    listingId: listing.id,
    variantId: listing.variantId,
    variantLabel,
    retailerName: listing.retailer.name,
    retailerSlug: listing.retailer.slug,
    productUrl: listing.productUrl,
    newPrice: listing.currentPrice,
    oldPrice: listing.previousPrice,
  };

  const message = [
    '🧪 <b>FIRSAT SKORU TEST MESAJI</b>',
    '',
    buildSmartAlertMessage(payload, sr),
    '',
    '─────────────',
    `⚙️ Bu bir test mesajıdır. Gerçek bildirimler yalnızca skor ≥ ${SMART_MIN_SCORE} olduğunda gönderilir.`,
  ].join('\n');

  const result = await broadcast(message);

  await prisma.notificationLog.create({
    data: {
      messageType: 'TEST_MESSAGE',
      status: result.sent > 0 ? 'SENT' : 'FAILED',
      productName: variantLabel,
      retailer: listing.retailer.name,
      newPrice: listing.currentPrice,
      messageText: message,
      sentTo: result.sent,
      failedTo: result.failed,
      listingId: listing.id,
      errorMessage: result.sent === 0 ? (result.failed > 0 ? `${result.failed} failed` : 'No active subscribers') : null,
    },
  }).catch(() => {});

  if (result.sent > 0) {
    return { ok: true, sent: result.sent, score: sr.score, tier: sr.tier };
  }
  return { ok: false, sent: 0, score: sr.score, tier: sr.tier, error: result.failed > 0 ? `${result.failed} failed` : 'No active subscribers' };
}

// ═══════════════════════════════════════════════════════════════════
//  getUpdates Polling — /start ile abone ol, /stop ile çık
// ═══════════════════════════════════════════════════════════════════

let lastUpdateId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string; username?: string; first_name?: string; title?: string };
    text?: string;
  };
  my_chat_member?: {
    chat: { id: number; type: string; title?: string };
    new_chat_member?: { status: string };
  };
}

async function processUpdates(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=0&allowed_updates=["message","my_chat_member"]`;

  try {
    const resp = await fetch(url);
    const data = await resp.json() as { ok: boolean; result?: TelegramUpdate[] };

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      // ── Handle bot added to / removed from group ──
      const memberUpdate = update.my_chat_member;
      if (memberUpdate) {
        const groupChatId = String(memberUpdate.chat.id);
        const newStatus = memberUpdate.new_chat_member?.status;
        const isGroup = memberUpdate.chat.type === 'group' || memberUpdate.chat.type === 'supergroup';

        if (isGroup && (newStatus === 'member' || newStatus === 'administrator')) {
          await prisma.telegramSubscriber.upsert({
            where: { chatId: groupChatId },
            create: { chatId: groupChatId, username: null, firstName: memberUpdate.chat.title ?? 'Grup', isActive: true },
            update: { isActive: true, firstName: memberUpdate.chat.title ?? 'Grup' },
          });
          await sendToChat(groupChatId, [
            '🎉 <b>Merhaba!</b>',
            '',
            'Bu grup artık iPhone fiyat düşüşü bildirimlerini alacak.',
            'Fiyatlar düştüğünde otomatik olarak bilgilendirileceksiniz.',
            '',
            '🔕 Bildirimleri kapatmak için /stop yazın.',
          ].join('\n'));
          console.log(`[telegram] Bot added to group: ${groupChatId} (${memberUpdate.chat.title ?? 'unknown'})`);
        } else if (isGroup && (newStatus === 'left' || newStatus === 'kicked')) {
          await prisma.telegramSubscriber.updateMany({ where: { chatId: groupChatId }, data: { isActive: false } });
          console.log(`[telegram] Bot removed from group: ${groupChatId}`);
        }
        continue;
      }

      // ── Handle text messages ──
      const msg = update.message;
      if (!msg?.text) continue;

      const chatId = String(msg.chat.id);
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
      const displayName = isGroup ? (msg.chat.title ?? 'Grup') : (msg.chat.first_name ?? null);

      // Parse command: strip leading /, strip @botname suffix, lowercase
      const raw = msg.text.trim().toLowerCase();
      const command = raw.replace(/^\//, '').replace(/@\S+$/, '').trim();

      if (command === 'start') {
        // Upsert subscriber
        await prisma.telegramSubscriber.upsert({
          where: { chatId },
          create: {
            chatId,
            username: msg.chat.username ?? null,
            firstName: displayName,
            isActive: true,
          },
          update: {
            isActive: true,
            username: msg.chat.username ?? null,
            firstName: displayName,
          },
        });

        await sendToChat(chatId, [
          '🎉 <b>Hoş geldiniz!</b>',
          '',
          'iPhone fiyat düşüşü bildirimlerine abone oldunuz.',
          'Fiyatlar düştüğünde otomatik olarak bilgilendirileceksiniz.',
          '',
          '🔕 Bildirimleri kapatmak için /stop yazın.',
        ].join('\n'));

        console.log(`[telegram] New subscriber: ${chatId} (@${msg.chat.username ?? 'unknown'})`);
      } else if (command === 'stop') {
        await prisma.telegramSubscriber.updateMany({
          where: { chatId },
          data: { isActive: false },
        });

        await sendToChat(chatId, '🔕 Bildirimler kapatıldı. Yeniden açmak için /start yazın.');
        console.log(`[telegram] Subscriber deactivated: ${chatId}`);
      } else if (!isGroup) {
        // Only reply to unknown messages in private chats (avoid noise in groups)
        await sendToChat(chatId, [
          '👋 Merhaba! Ben BakiBot.',
          '',
          '📱 iPhone fiyat düşüşlerini takip ediyorum.',
          '',
          '<b>Komutlar:</b>',
          '/start — Bildirimlere abone ol',
          '/stop — Aboneliği durdur',
        ].join('\n'));
      }
    }
  } catch (err) {
    console.error('[telegram] Polling error:', err instanceof Error ? err.message : err);
  }
}

/** Start polling for /start and /stop commands. Only one replica polls at a time. */
export function startTelegramPolling(): void {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) {
    console.log('[telegram] Disabled or no token — polling not started');
    return;
  }

  console.log(`[telegram] Attempting to start subscriber polling (instance ${INSTANCE_ID.slice(0, 8)})`);

  async function pollCycle() {
    // Only poll if we hold the telegram lock
    const acquired = await telegramPollLock.tryAcquire();
    if (acquired) {
      await processUpdates().catch(() => {});
    }
  }

  // Run once immediately, then on interval
  pollCycle();
  pollTimer = setInterval(() => {
    pollCycle();
  }, POLL_INTERVAL_MS);
}

export function stopTelegramPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
