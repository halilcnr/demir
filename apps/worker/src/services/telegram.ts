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
  // Notification type toggles
  notifyPriceDrop: boolean;
  notifySmartDeal: boolean;
  notifyDailyReport: boolean;
  // Smart deal settings
  smartDealMinScore: number;
  smartDealCooldownMin: number;
  // Timing breakdown in messages
  notifyTimingBreakdown: boolean;
}

let settingsCache: CachedSettings | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 60_000; // 1 min cache

export async function getNotifySettings(): Promise<CachedSettings> {
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
        notifyPriceDrop: row.notifyPriceDrop,
        notifySmartDeal: row.notifySmartDeal,
        notifyDailyReport: row.notifyDailyReport,
        smartDealMinScore: row.smartDealMinScore,
        smartDealCooldownMin: row.smartDealCooldownMin,
        notifyTimingBreakdown: row.notifyTimingBreakdown,
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
    notifyPriceDrop: true,
    notifySmartDeal: true,
    notifyDailyReport: true,
    smartDealMinScore: 80,
    smartDealCooldownMin: 60,
    notifyTimingBreakdown: false,
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
  discoveredAt: number;      // Date.now() at scrape time
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
  discoveredAt: number;      // Date.now() at scrape time
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
function buildPriceDropMessage(payload: PriceDropPayload, showBreakdown: boolean): string {
  const { variantLabel, retailerName, productUrl, newPrice, oldPrice, lowestPrice, isAllTimeLow, discoveredAt } = payload;

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

  // ── Timing info ──
  const totalMs = Date.now() - discoveredAt;
  const totalSec = (totalMs / 1000).toFixed(1);
  lines.push(`⏱ <b>Bildirim ulaşma süresi:</b> ${totalSec} saniye`);
  if (showBreakdown) {
    lines.push(`  📡 Keşiften bildirime: ${totalSec}s`);
  }
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

  // Price drop toggle
  if (!settings.notifyPriceDrop) {
    return { send: false, reason: 'Price drop notifications disabled in settings' };
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

  const settings = await getNotifySettings();
  const message = buildPriceDropMessage(payload, settings.notifyTimingBreakdown);
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
//  GLOBAL ARBITRAGE DEAL ALERT SYSTEM
//  Uses multi-provider, color-agnostic arbitrage for real deal detection.
//  Settings read from DB (AppSettings) via getNotifySettings()
// ═══════════════════════════════════════════════════════════════════

import { fetchGlobalMarketSnapshot, computeArbitrage } from '../deals';
import type { ArbitrageResult, GlobalMarketSnapshot } from '../deals';

// ─── Fallback Constants ──────────────────────────────────────────
const SMART_RE_ALERT_DROP_PERCENT = 1;

// ─── Smart Anti-Spam ─────────────────────────────────────────────
async function shouldSendSmartAlert(listingId: string, newPrice: number): Promise<{ send: boolean; reason?: string }> {
  const settings = await getNotifySettings();
  if (!settings.notifyEnabled) {
    return { send: false, reason: 'Bildirimler ayarlardan kapatılmış' };
  }
  if (!settings.notifySmartDeal) {
    return { send: false, reason: 'Akıllı fırsat bildirimleri kapalı' };
  }

  const smartCooldownMs = settings.smartDealCooldownMin * 60_000;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { lastNotifiedPrice: true, notificationSentAt: true },
  });

  if (listing?.lastNotifiedPrice === newPrice) {
    return { send: false, reason: `Bu fiyat için zaten bildirim gönderildi (${newPrice} TL)` };
  }

  if (listing?.notificationSentAt) {
    const elapsed = Date.now() - listing.notificationSentAt.getTime();
    if (elapsed < smartCooldownMs) {
      const remainingMin = Math.round((smartCooldownMs - elapsed) / 60_000);
      return { send: false, reason: `Bekleme süresi aktif (${remainingMin}dk kaldı)` };
    }
  }

  if (listing?.lastNotifiedPrice != null) {
    const additionalDropPct = ((listing.lastNotifiedPrice - newPrice) / listing.lastNotifiedPrice) * 100;
    if (additionalDropPct < SMART_RE_ALERT_DROP_PERCENT) {
      return { send: false, reason: `Son uyarıdan bu yana yeterli düşüş yok (%${additionalDropPct.toFixed(1)} < %${SMART_RE_ALERT_DROP_PERCENT})` };
    }
  }

  return { send: true };
}

// ─── Turkish Telegram Message 3.0 (Arbitrage-Powered) ────────────
function buildArbitrageAlertMessage(
  payload: SmartDealPayload,
  arb: ArbitrageResult,
  market: GlobalMarketSnapshot,
  showBreakdown: boolean,
  timings?: { analysisMs: number; totalMs: number },
): string {
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const lines: string[] = [];

  // ── Header based on verdict ──
  if (arb.isMarketLeader) {
    lines.push('🔥 <b>PİYASA LİDERİ FIRSAT!</b>');
  } else if (arb.score >= 80) {
    lines.push('🔥🔥 <b>SÜPER FIRSAT TESPİT EDİLDİ!</b>');
  } else {
    lines.push('📉 <b>İYİ FIRSAT TESPİT EDİLDİ</b>');
  }
  lines.push('');

  // ── Product + Color ──
  lines.push(`📱 <b>${payload.variantLabel}</b>`);
  lines.push('');

  // ── Price + Retailer ──
  lines.push(`💰 <b>Fiyat:</b> <b>${fmtPrice(payload.newPrice)} TL</b> (@${payload.retailerName})`);
  if (payload.oldPrice != null && payload.oldPrice !== payload.newPrice) {
    const dropPct = ((payload.oldPrice - payload.newPrice) / payload.oldPrice * 100).toFixed(1);
    lines.push(`   <s>${fmtPrice(payload.oldPrice)} TL</s> → <b>${fmtPrice(payload.newPrice)} TL</b> (-%${dropPct})`);
  }
  lines.push('');

  // ── Market status ──
  if (arb.isMarketLeader) {
    lines.push('🏆 <b>Durum:</b> PİYASADAKİ EN UCUZ SEÇENEK');
  } else {
    lines.push(`🏆 <b>Durum:</b> Piyasa tabanına çok yakın (en ucuz: ${fmtPrice(arb.globalFloor)} TL)`);
  }
  lines.push('');

  // ── Market Comparison ──
  lines.push('📊 <b>Piyasa Karşılaştırması:</b>');

  // Local siblings (other colors at this store)
  if (market.localSiblings.length > 0) {
    const siblingLines = market.localSiblings
      .slice(0, 3) // show top 3
      .map(s => {
        const diff = s.price - payload.newPrice;
        return `${s.color}: ${fmtPrice(s.price)} TL (+${fmtPrice(diff)} TL fark)`;
      })
      .join(', ');
    lines.push(`🔹 <b>Diğer Renkler (Bu Mağaza):</b> ${siblingLines}`);
  }

  // Global competitors (other retailers)
  if (market.globalCompetitors.length > 0) {
    // Group by retailer, show cheapest per retailer
    const byRetailer = new Map<string, { name: string; price: number }>();
    for (const c of market.globalCompetitors) {
      const existing = byRetailer.get(c.retailerSlug);
      if (!existing || c.price < existing.price) {
        byRetailer.set(c.retailerSlug, { name: c.retailerName, price: c.price });
      }
    }
    const competitorParts = [...byRetailer.values()]
      .sort((a, b) => a.price - b.price)
      .slice(0, 4)
      .map(c => `${c.name} ${fmtPrice(c.price)} TL`);
    if (competitorParts.length > 0) {
      lines.push(`🔹 <b>Diğer Mağazalar:</b> ${competitorParts.join(', ')}`);
    }
  }
  lines.push('');

  // ── Net savings ──
  const closestCompetitorPrice = market.allInStockPrices
    .filter(p => p.listingId !== payload.listingId && p.price > payload.newPrice)
    .sort((a, b) => a.price - b.price)[0]?.price;

  if (closestCompetitorPrice != null && arb.isMarketLeader) {
    const savings = closestCompetitorPrice - payload.newPrice;
    lines.push(`📉 <b>Net Kazanç:</b> Piyasadaki en yakın rakibine göre <b>${fmtPrice(savings)} TL</b> daha avantajlı.`);
    lines.push('');
  }

  // ── Market average context ──
  if (market.marketAverage > 0) {
    lines.push(`⚠️ <b>Not:</b> Diğer renkler ve satıcılarda fiyatlar <b>${fmtPrice(Math.round(market.marketAverage))} TL</b> seviyesinde seyrediyor.`);
    lines.push('');
  }

  // ── Historical context ──
  if (market.groupAllTimeLow != null) {
    if (payload.newPrice <= market.groupAllTimeLow) {
      lines.push('🏅 <b>TÜM ZAMANLARIN EN DÜŞÜK FİYATI!</b>');
    } else {
      const distPct = (((payload.newPrice - market.groupAllTimeLow) / market.groupAllTimeLow) * 100).toFixed(1);
      lines.push(`📈 <b>Tüm zamanların en düşüğü:</b> ${fmtPrice(market.groupAllTimeLow)} TL (%${distPct} üstünde)`);
    }
    lines.push('');
  }

  // ── Score ──
  lines.push(`🎯 <b>Fırsat Skoru:</b> ${arb.score}/100`);
  if (market.isMarketCorrection) {
    lines.push('⚠️ Piyasa genelinde düzeltme tespit edildi');
  }
  lines.push('');

  // ── Timing ──
  if (timings) {
    const totalSec = (timings.totalMs / 1000).toFixed(1);
    lines.push(`⏱ <b>Bildirim süresi:</b> ${totalSec}s`);
    if (showBreakdown) {
      const scrapeSec = ((timings.totalMs - timings.analysisMs) / 1000).toFixed(1);
      const analysisSec = (timings.analysisMs / 1000).toFixed(1);
      lines.push(`  📡 Veri: ${scrapeSec}s | 🧠 Analiz: ${analysisSec}s`);
    }
    lines.push('');
  }

  // ── Link ──
  lines.push(`🔗 <a href="${payload.productUrl}">Fırsatı Gör &amp; Satın Al →</a>`);

  return lines.join('\n');
}

// ─── Public: Smart Deal Notification (Arbitrage-Powered) ─────────
export async function notifySmartDeal(payload: SmartDealPayload): Promise<void> {
  if (!TELEGRAM_ENABLED) return;

  const settings = await getNotifySettings();

  if (!settings.notifySmartDeal) {
    skippedCount++;
    console.log(`[telegram-arb] Akıllı fırsat bildirimleri kapalı`);
    return;
  }

  const minScore = settings.smartDealMinScore;
  const smartCooldownMs = settings.smartDealCooldownMin * 60_000;

  // 1) Fetch global market snapshot (single optimized query)
  const analysisStartMs = Date.now();
  const market = await fetchGlobalMarketSnapshot(payload.variantId);
  if (!market) {
    skippedCount++;
    console.log(`[telegram-arb] No market data for ${payload.variantLabel}`);
    return;
  }

  // 2) Run arbitrage algorithm
  const arb = computeArbitrage(payload.newPrice, payload.retailerSlug, market);
  const analysisMs = Date.now() - analysisStartMs;

  console.log(`[telegram-arb] ${payload.retailerSlug} ${payload.variantLabel}: verdict=${arb.verdict} score=${arb.score}`);

  // 3) DISCARD: a cheaper option exists elsewhere → suppress
  if (arb.verdict === 'DISCARD') {
    skippedCount++;
    console.log(`[telegram-arb] DISCARD: ${payload.newPrice} TL > floor ${arb.globalFloor} TL @ ${arb.globalFloorRetailer}/${arb.globalFloorColor}`);
    return;
  }

  // 4) Score gate: only high-quality deals get through
  if (arb.score < minScore) {
    skippedCount++;
    console.log(`[telegram-arb] Atlandı (skor ${arb.score} < ${minScore}): ${payload.variantLabel}`);
    return;
  }

  // 5) Anti-spam check
  const spam = await shouldSendSmartAlert(payload.listingId, payload.newPrice);
  if (!spam.send) {
    skippedCount++;
    console.log(`[telegram-arb] Anti-spam engeli: ${spam.reason}`);
    return;
  }

  // 6) Atomic claim — prevent duplicate sends across replicas
  const cooldownThreshold = new Date(Date.now() - smartCooldownMs);
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
    console.log(`[telegram-arb] Başka replika tarafından talep edilmiş`);
    return;
  }

  // 7) Build & broadcast
  const totalMs = Date.now() - payload.discoveredAt;
  const message = buildArbitrageAlertMessage(payload, arb, market, settings.notifyTimingBreakdown, { analysisMs, totalMs });
  const result = await broadcast(message);

  // 8) Log
  const dropPercent = payload.oldPrice != null && payload.oldPrice > 0
    ? ((payload.oldPrice - payload.newPrice) / payload.oldPrice) * 100
    : null;

  if (result.sent > 0) {
    sentCount++;
    console.log(`[telegram-arb] ✓ ${arb.verdict} gönderildi: ${payload.variantLabel} (${payload.newPrice} TL, skor=${arb.score}) → ${result.sent} abone`);

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
    console.error(`[telegram-arb] ✗ Yayın başarısız: ${result.failed} hata`);

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

  // Compute using the new arbitrage engine
  const market = await fetchGlobalMarketSnapshot(listing.variantId);
  if (!market) {
    return { ok: false, error: 'Bu ürün için piyasa verisi bulunamadı' };
  }

  const arb = computeArbitrage(listing.currentPrice, listing.retailer.slug, market);

  const tier = arb.score >= 80 ? 'super' : arb.score >= 60 ? 'good' : arb.score >= 40 ? 'minor' : 'ignore';

  const settings = await getNotifySettings();
  const payload: SmartDealPayload = {
    listingId: listing.id,
    variantId: listing.variantId,
    variantLabel,
    retailerName: listing.retailer.name,
    retailerSlug: listing.retailer.slug,
    productUrl: listing.productUrl,
    newPrice: listing.currentPrice,
    oldPrice: listing.previousPrice,
    discoveredAt: Date.now(),
  };

  const message = [
    '🧪 <b>ARBİTRAJ FIRSAT TESTİ</b>',
    '',
    buildArbitrageAlertMessage(payload, arb, market, settings.notifyTimingBreakdown),
    '',
    '─────────────',
    `⚙️ Karar: ${arb.verdict} | Skor: ${arb.score}/100`,
    `⚙️ Global taban: ${market.globalFloor.toLocaleString('tr-TR')} TL (${market.globalFloorRetailer}/${market.globalFloorColor})`,
    `⚙️ Gerçek bildirimler yalnızca skor ≥ ${settings.smartDealMinScore} ve DISCARD olmayan fırsatlarda gönderilir.`,
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
    return { ok: true, sent: result.sent, score: arb.score, tier };
  }
  return { ok: false, sent: 0, score: arb.score, tier, error: result.failed > 0 ? `${result.failed} failed` : 'No active subscribers' };
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
