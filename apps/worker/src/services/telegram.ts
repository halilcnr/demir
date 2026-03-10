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
  oldPrice: number;
}

interface DealScoreResult {
  score: number;
  tier: 'ignore' | 'minor' | 'good' | 'super';
  reasons: string[];
  indicators: string[];
  metrics: {
    top3Average: number | null;
    marketAverage: number | null;
    allTimeLowest: number | null;
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
//  SMART DEAL ALERT SYSTEM — Only high-confidence deals (score ≥ 80)
// ═══════════════════════════════════════════════════════════════════

// ─── Smart Deal Scoring Engine ───────────────────────────────────
const SMART_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per listing
const SMART_RE_ALERT_DROP_PERCENT = 1;     // must drop another 1% to re-alert

async function computeDealScore(variantId: string, newPrice: number, oldPrice: number): Promise<DealScoreResult> {
  const empty: DealScoreResult = {
    score: 0, tier: 'ignore', reasons: [], indicators: [],
    metrics: { top3Average: null, marketAverage: null, allTimeLowest: null, savingsVsMarket: null, savingsVsTop3: null, clusterGapPercent: null },
  };

  const analytics = await prisma.variantPriceAnalytics.findUnique({ where: { variantId } });
  if (!analytics || !analytics.top3AveragePrice || !analytics.marketAveragePrice) {
    return empty;
  }

  let score = 0;
  const reasons: string[] = [];
  const indicators: string[] = [];

  // +40: below historical lowest
  if (analytics.allTimeLowest != null && newPrice < analytics.allTimeLowest) {
    score += 40;
    reasons.push('Tüm zamanların en düşüğü');
    indicators.push('🔥');
  }

  // +25: below top 3 average by 3%
  if (newPrice < analytics.top3AveragePrice * 0.97) {
    const pct = ((analytics.top3AveragePrice - newPrice) / analytics.top3AveragePrice * 100).toFixed(1);
    score += 25;
    reasons.push(`Top 3 ortalamanın %${pct} altı`);
  }

  // +20: below market average by 5%
  if (newPrice < analytics.marketAveragePrice * 0.95) {
    const pct = ((analytics.marketAveragePrice - newPrice) / analytics.marketAveragePrice * 100).toFixed(1);
    score += 20;
    reasons.push(`Piyasa ortalamasının %${pct} altı`);
  }

  // +10: cluster gap — cheapest significantly below second cheapest
  let clusterGapPercent: number | null = null;
  if (analytics.bestRetailerPrice != null && analytics.secondBestPrice != null && analytics.secondBestPrice > 0) {
    // Use the lower of newPrice and stored bestRetailerPrice as the cheapest
    const cheapest = Math.min(newPrice, analytics.bestRetailerPrice);
    const gap = ((analytics.secondBestPrice - cheapest) / analytics.secondBestPrice) * 100;
    clusterGapPercent = Math.round(gap * 10) / 10;
    if (gap > 5) {
      score += 10;
      reasons.push(`Rakiplerden %${clusterGapPercent.toFixed(1)} daha ucuz`);
      indicators.push('⚡');
    }
  }

  // Bonus indicator: sudden price crash (>10% in one scrape)
  if (oldPrice > 0) {
    const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
    if (dropPct > 10) {
      indicators.push('📉');
    }
  }

  score = Math.min(100, score);

  let tier: DealScoreResult['tier'];
  if (score >= 80) tier = 'super';
  else if (score >= 60) tier = 'good';
  else if (score >= 40) tier = 'minor';
  else tier = 'ignore';

  return {
    score,
    tier,
    reasons,
    indicators,
    metrics: {
      top3Average: Math.round(analytics.top3AveragePrice),
      marketAverage: Math.round(analytics.marketAveragePrice),
      allTimeLowest: analytics.allTimeLowest,
      savingsVsMarket: Math.round(analytics.marketAveragePrice - newPrice),
      savingsVsTop3: Math.round(analytics.top3AveragePrice - newPrice),
      clusterGapPercent,
    },
  };
}

// ─── Smart Anti-Spam ─────────────────────────────────────────────
async function shouldSendSmartAlert(listingId: string, newPrice: number): Promise<{ send: boolean; reason?: string }> {
  const settings = await getNotifySettings();
  if (!settings.notifyEnabled) {
    return { send: false, reason: 'Notifications disabled in settings' };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { lastNotifiedPrice: true, notificationSentAt: true },
  });

  // Cooldown: 1 hour per listing
  if (listing?.notificationSentAt) {
    const elapsed = Date.now() - listing.notificationSentAt.getTime();
    if (elapsed < SMART_COOLDOWN_MS) {
      const remainingMin = Math.round((SMART_COOLDOWN_MS - elapsed) / 60_000);
      return { send: false, reason: `Akıllı uyarı bekleme süresi (${remainingMin}dk kaldı)` };
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

  // Header
  lines.push('🔥🔥 <b>SÜPER FIRSAT!</b> 🔥🔥');
  lines.push('');

  // Product & retailer
  lines.push(`📱 <b>${payload.variantLabel}</b>`);
  lines.push(`🏪 ${payload.retailerName}`);
  lines.push('');

  // Price with old price strikethrough
  lines.push(`💰 <s>${fmtPrice(payload.oldPrice)} TL</s>  →  <b>${fmtPrice(payload.newPrice)} TL</b>`);
  lines.push('');

  // Market comparison
  if (sr.metrics.top3Average != null) {
    lines.push(`📊 Top 3 Ort: ${fmtPrice(sr.metrics.top3Average)} TL`);
  }
  if (sr.metrics.marketAverage != null) {
    lines.push(`📈 Piyasa Ort: ${fmtPrice(sr.metrics.marketAverage)} TL`);
  }
  if (sr.metrics.allTimeLowest != null) {
    lines.push(`📉 Tüm Zamanlar En Düşük: ${fmtPrice(sr.metrics.allTimeLowest)} TL`);
  }
  lines.push('');

  // Savings
  if (sr.metrics.savingsVsMarket != null && sr.metrics.marketAverage != null && sr.metrics.marketAverage > 0) {
    const savingsPct = ((sr.metrics.savingsVsMarket / sr.metrics.marketAverage) * 100).toFixed(1);
    lines.push(`💸 Tasarruf: <b>${fmtPrice(sr.metrics.savingsVsMarket)} TL</b> (%${savingsPct})`);
  }
  lines.push('');

  // Confidence score
  lines.push(`🎯 Güven Skoru: <b>${sr.score}/100</b>`);
  lines.push('');

  // Deal indicators
  if (sr.indicators.length > 0 || sr.reasons.length > 0) {
    for (let i = 0; i < sr.reasons.length; i++) {
      const icon = sr.indicators[i] ?? '✅';
      lines.push(`${icon} ${sr.reasons[i]}`);
    }
    // Extra indicators without matching reasons (e.g. 📉 crash)
    if (sr.indicators.length > sr.reasons.length) {
      for (let i = sr.reasons.length; i < sr.indicators.length; i++) {
        if (sr.indicators[i] === '📉') {
          lines.push('📉 Ani fiyat düşüşü');
        }
      }
    }
    lines.push('');
  }

  // Link
  lines.push(`🔗 <a href="${payload.productUrl}">Ürüne Git</a>`);

  return lines.join('\n');
}

// ─── Public: Smart Deal Notification (score ≥ 80 only) ───────────
export async function notifySmartDeal(payload: SmartDealPayload): Promise<void> {
  if (!TELEGRAM_ENABLED) return;

  // 1) Compute deal score
  const sr = await computeDealScore(payload.variantId, payload.newPrice, payload.oldPrice);
  console.log(`[telegram-smart] ${payload.retailerSlug} ${payload.variantLabel}: score=${sr.score} tier=${sr.tier}`);

  // 2) Only SUPER deals (≥80) get Telegram
  if (sr.score < 80) {
    skippedCount++;
    console.log(`[telegram-smart] Skipped (score ${sr.score} < 80): ${payload.variantLabel}`);
    return;
  }

  // 3) Anti-spam check
  const spam = await shouldSendSmartAlert(payload.listingId, payload.newPrice);
  if (!spam.send) {
    skippedCount++;
    console.log(`[telegram-smart] Anti-spam blocked: ${spam.reason}`);
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
    console.log(`[telegram-smart] Already claimed by another replica`);
    return;
  }

  // 5) Build & broadcast
  const message = buildSmartAlertMessage(payload, sr);
  const result = await broadcast(message);

  // 6) Log
  if (result.sent > 0) {
    sentCount++;
    console.log(`[telegram-smart] ✓ SÜPER FIRSAT sent: ${payload.variantLabel} (${payload.newPrice} TL, score=${sr.score}) → ${result.sent} subscriber(s)`);

    await prisma.notificationLog.create({
      data: {
        messageType: 'DEAL_ALERT' as never,
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
    console.error(`[telegram-smart] ✗ Broadcast failed: ${result.failed} failure(s)`);

    await prisma.notificationLog.create({
      data: {
        messageType: 'DEAL_ALERT' as never,
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
