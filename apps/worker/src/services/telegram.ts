import { prisma } from '@repo/shared';
import { DistributedLock, INSTANCE_ID } from '../distributed-lock';

// ─── Configuration ───────────────────────────────────────────────
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const POLL_INTERVAL_MS = 30_000; // getUpdates polling interval

// ─── Intelligent Filtering Constants ─────────────────────────────
const VELOCITY_COOLDOWN_MS = 4 * 60 * 60 * 1000;  // 4h — cooldown for oscillating variants
const VELOCITY_WINDOW_MS = 4 * 60 * 60 * 1000;    // 4h — look-back for oscillation detection
const VELOCITY_FLIP_THRESHOLD = 3;                 // ≥3 direction changes = oscillating
const DEFAULT_CONFIDENCE_GATE = 75;                // Only push if score ≥ 75
const SIBLING_DISCOUNT_THRESHOLD = 0.90;           // Tier 2: price < siblingAvg * 0.90
const GLOBAL_FLOOR_PROXIMITY = 1.02;               // Tier 2: price <= globalFloor * 1.02

const telegramPollLock = new DistributedLock('telegram-poll', 60_000);

/** Istanbul-local timestamp with ms precision for message footers */
function istanbulTimestamp(): string {
  return new Date().toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

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
    notifyDropPercent: 5,
    notifyDropAmount: 500,
    notifyCooldownMinutes: 240,
    notifyAllTimeLow: true,
    notifyEnabled: true,
    notifyMinPrice: null,
    notifyMaxPrice: null,
    notifyPriceDrop: false,
    notifySmartDeal: true,
    notifyDailyReport: true,
    smartDealMinScore: DEFAULT_CONFIDENCE_GATE,
    smartDealCooldownMin: 60,
    notifyTimingBreakdown: false,
  };
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

// ═══════════════════════════════════════════════════════════════════
//  FRESHNESS & VELOCITY FILTERS
//  Suppress noise: stale benchmarks, oscillating variants
// ═══════════════════════════════════════════════════════════════════

/**
 * Velocity Check: Returns true if this variant is oscillating
 * (≥2 direction changes within the last 4 hours) — suppress to prevent spam.
 */
async function isVariantOscillating(listingId: string): Promise<boolean> {
  const since = new Date(Date.now() - VELOCITY_WINDOW_MS);
  const snapshots = await prisma.priceSnapshot.findMany({
    where: { listingId, observedAt: { gte: since }, changeAmount: { not: null } },
    orderBy: { observedAt: 'asc' },
    select: { changeAmount: true },
  });

  if (snapshots.length < 3) return false;

  let flips = 0;
  let lastDir = 0; // -1 = down, +1 = up, 0 = flat
  for (const snap of snapshots) {
    const amt = snap.changeAmount ?? 0;
    const dir = amt > 0 ? 1 : amt < 0 ? -1 : 0;
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir) {
      flips++;
    }
    if (dir !== 0) lastDir = dir;
  }

  return flips >= VELOCITY_FLIP_THRESHOLD;
}

/**
 * Determine the notification tier:
 * - Tier 1: Global Floor (ATL or absolute cheapest in market)
 * - Tier 2: Family Arbitrage (color drops below sibling avg AND within 2% of floor)
 * - null: Does not qualify for any notification tier
 */
function classifyNotificationTier(
  arb: ArbitrageResult,
  market: GlobalMarketSnapshot,
  currentPrice: number,
): 'GLOBAL_FLOOR' | 'FAMILY_ARBITRAGE' | null {
  // Tier 1: ATL or market leader
  if (arb.isMarketLeader) return 'GLOBAL_FLOOR';
  if (arb.distanceFromATL != null && arb.distanceFromATL <= 0) return 'GLOBAL_FLOOR';

  // Tier 2: Sibling arbitrage — price significantly below siblings AND near global floor
  if (market.localSiblings.length > 0) {
    const siblingAvg = market.localSiblings.reduce((s, p) => s + p.price, 0) / market.localSiblings.length;
    const isBelowSiblingThreshold = currentPrice < siblingAvg * SIBLING_DISCOUNT_THRESHOLD;
    const isNearGlobalFloor = currentPrice <= market.globalFloor * GLOBAL_FLOOR_PROXIMITY;
    if (isBelowSiblingThreshold && isNearGlobalFloor) return 'FAMILY_ARBITRAGE';
  }

  // Fallback: if score is high enough, it may still be a good global floor candidate
  if (arb.score >= 90 && currentPrice <= market.globalFloor * GLOBAL_FLOOR_PROXIMITY) return 'GLOBAL_FLOOR';

  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  GLOBAL ARBITRAGE DEAL ALERT SYSTEM
//  Uses multi-provider, color-agnostic arbitrage for real deal detection.
//  Settings read from DB (AppSettings) via getNotifySettings()
// ═══════════════════════════════════════════════════════════════════

import { fetchGlobalMarketSnapshot, computeArbitrage, checkGenerationalBarrier } from '../deals';
import type { ArbitrageResult, GlobalMarketSnapshot, GenerationalContext } from '../deals';

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

// ─── Turkish Telegram Message 4.0 (Tier-Based Arbitrage) ─────────

type NotificationTier = 'GLOBAL_FLOOR' | 'FAMILY_ARBITRAGE';

// ═══════════════════════════════════════════════════════════════════
//  TWO-PHASE NOTIFICATION SYSTEM
//  Phase 1 (Flash): Product + price + link — sent instantly
//  Phase 2 (Detail): Analytics, gen comparison, score, timing
// ═══════════════════════════════════════════════════════════════════

function buildFlashMessage(
  payload: SmartDealPayload,
  arb: ArbitrageResult,
  market: GlobalMarketSnapshot,
): string {
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const lines: string[] = [];

  // ── Header ──
  const isATL = market.groupAllTimeLow != null && payload.newPrice <= market.groupAllTimeLow;
  if (isATL) {
    lines.push('🏆 <b>TÜM ZAMANLARIN EN DÜŞÜĞÜ</b>');
  } else if (arb.isMarketLeader) {
    lines.push('🔥 <b>PİYASA LİDERİ</b>');
  } else {
    lines.push('💰 <b>FIRSAT</b>');
  }
  lines.push('');

  // ── Product + Price ──
  lines.push(`📱 <b>${payload.variantLabel}</b>`);
  lines.push(`💰 <b>${fmtPrice(payload.newPrice)} TL</b> — ${payload.retailerName}`);
  if (payload.oldPrice != null && payload.oldPrice !== payload.newPrice) {
    const dropPct = ((payload.oldPrice - payload.newPrice) / payload.oldPrice * 100).toFixed(1);
    lines.push(`<s>${fmtPrice(payload.oldPrice)} TL</s> → <b>${fmtPrice(payload.newPrice)} TL</b> (-%${dropPct})`);
  }
  lines.push('');

  // ── Link (immediately actionable) ──
  lines.push(`🔗 <a href="${payload.productUrl}">Satın Al →</a>`);

  // ── Timestamp ──
  lines.push('');
  lines.push(`<i>${istanbulTimestamp()}</i>`);

  return lines.join('\n');
}

interface EngineInfo {
  tier: string;
  minScore: number;
}

function buildDetailMessage(
  payload: SmartDealPayload,
  arb: ArbitrageResult,
  market: GlobalMarketSnapshot,
  genContext: GenerationalContext | null,
  timings: { dataMs: number; analysisMs: number; totalMs: number },
  engine?: EngineInfo,
): string {
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const lines: string[] = [];

  lines.push(`📊 <b>Analiz: ${payload.variantLabel}</b>`);
  lines.push('');

  // ── Market ──
  if (arb.isMarketLeader) {
    lines.push('Tüm mağaza ve renklerde <b>en ucuz</b>');
  } else {
    lines.push(`En ucuz: <b>${fmtPrice(arb.globalFloor)} TL</b> (${market.globalFloorRetailer})`);
  }
  if (market.allInStockPrices.length > 1) {
    const sorted = [...market.allInStockPrices].sort((a, b) => a.price - b.price);
    const secondCheapest = sorted[1];
    if (secondCheapest) {
      const diff = secondCheapest.price - payload.newPrice;
      const diffStr = diff > 0 ? ` (${fmtPrice(Math.round(diff))} TL fark)` : '';
      lines.push(`En yakın 2. teklif: <b>${fmtPrice(secondCheapest.price)} TL</b> — ${secondCheapest.retailerName}/${secondCheapest.color}${diffStr}`);
    }
  }
  if (market.marketAverage > 0) {
    const belowAvgPct = (((market.marketAverage - payload.newPrice) / market.marketAverage) * 100).toFixed(1);
    lines.push(`Piyasa ort: <b>${fmtPrice(Math.round(market.marketAverage))} TL</b>${Number(belowAvgPct) > 0 ? ` (%${belowAvgPct} altında)` : ''}`);
  }
  if (market.groupAllTimeLow != null) {
    const isATL = payload.newPrice <= market.groupAllTimeLow;
    if (isATL) {
      lines.push('🏅 Tüm zamanların en düşük fiyatı!');
    } else {
      const distPct = (((payload.newPrice - market.groupAllTimeLow) / market.groupAllTimeLow) * 100).toFixed(1);
      lines.push(`ATL: ${fmtPrice(market.groupAllTimeLow)} TL (%${distPct} üstünde)`);
    }
  }

  // ── Competitors ──
  if (market.globalCompetitors.length > 0) {
    const byRetailer = new Map<string, { name: string; price: number }>();
    for (const c of market.globalCompetitors) {
      const existing = byRetailer.get(c.retailerSlug);
      if (!existing || c.price < existing.price) {
        byRetailer.set(c.retailerSlug, { name: c.retailerName, price: c.price });
      }
    }
    const parts = [...byRetailer.values()]
      .sort((a, b) => a.price - b.price)
      .slice(0, 4)
      .map(c => `${c.name} ${fmtPrice(c.price)}`);
    if (parts.length > 0) {
      lines.push(`Rakipler: ${parts.join(', ')}`);
    }
  }
  lines.push('');

  // ── Generational Comparison ──
  if (genContext && !genContext.isLatestGen && (genContext.nextGenPrice != null || genContext.latestGenPrice != null)) {
    lines.push('━━━ NESİL KIYASLAMASI ━━━');
    lines.push(`  ${genContext.currentFamilyName}: <b>${fmtPrice(payload.newPrice)} TL</b> ← bu fırsat`);
    if (genContext.nextGenPrice != null && genContext.nextGenFamilyName) {
      const gap = genContext.nextGenPrice - payload.newPrice;
      lines.push(`  ${genContext.nextGenFamilyName}: ${fmtPrice(genContext.nextGenPrice)} TL (+${fmtPrice(gap)} TL)`);
    }
    if (genContext.latestGenPrice != null && genContext.latestGenFamilyName !== genContext.nextGenFamilyName) {
      const gap = genContext.latestGenPrice - payload.newPrice;
      lines.push(`  ${genContext.latestGenFamilyName}: ${fmtPrice(genContext.latestGenPrice)} TL (+${fmtPrice(gap)} TL)`);
    }
    lines.push('✅ Yeterli nesil farkı — değerli alım');
    lines.push('');
  } else if (genContext?.isLatestGen) {
    lines.push('⚡ En güncel nesil');
    lines.push('');
  }

  // ── Score ──
  lines.push(`🎯 <b>${arb.score}/100</b>`);
  if (market.isMarketCorrection) {
    lines.push('⚠️ Piyasa genelinde düzeltme tespit edildi');
  }
  lines.push('');

  // ── Timing breakdown ──
  const totalSec = (timings.totalMs / 1000).toFixed(1);
  const dataSec = (timings.dataMs / 1000).toFixed(1);
  const analysisSec = (timings.analysisMs / 1000).toFixed(1);
  lines.push(`⏱️ ${totalSec}s`);
  lines.push(`  📡 Veri: ${dataSec}s | 🧠 Analiz: ${analysisSec}s`);

  // ── Engine details ──
  if (engine) {
    lines.push('');
    lines.push(`⚙️ Tier: ${engine.tier}`);
    lines.push(`⚙️ Karar: ${arb.verdict} | Skor: ${arb.score}/100`);
    lines.push(`⚙️ Global taban: ${fmtPrice(arb.globalFloor)} TL (${market.globalFloorRetailer}/${market.globalFloorColor})`);
    lines.push(`⚙️ Min skor: ${engine.minScore}`);
  }

  // ── Timestamp ──
  lines.push('');
  lines.push(`<i>${istanbulTimestamp()}</i>`);

  return lines.join('\n');
}

/** Combined message for test endpoint (single message) */
function buildArbitrageAlertMessage(
  payload: SmartDealPayload,
  arb: ArbitrageResult,
  market: GlobalMarketSnapshot,
  genContext: GenerationalContext | null,
  timings?: { dataMs: number; analysisMs: number; totalMs: number },
): string {
  const flash = buildFlashMessage(payload, arb, market);
  const detail = buildDetailMessage(
    payload, arb, market, genContext,
    timings ?? { dataMs: 0, analysisMs: 0, totalMs: 0 },
    { tier: 'Test', minScore: 0 },
  );
  return flash + '\n\n' + detail;
}

// ─── Public: Smart Deal Notification (Tier-Based Arbitrage) ──────
export async function notifySmartDeal(payload: SmartDealPayload): Promise<void> {
  if (!TELEGRAM_ENABLED) {
    console.log(`[telegram-arb] TELEGRAM_ENABLED=false, skipping: ${payload.variantLabel}`);
    return;
  }

  const settings = await getNotifySettings();

  if (!settings.notifySmartDeal) {
    skippedCount++;
    console.log(`[telegram-arb] Akıllı fırsat bildirimleri kapalı (setting)`);
    return;
  }

  // Enforce minimum confidence gate (never below DEFAULT_CONFIDENCE_GATE)
  const minScore = Math.max(settings.smartDealMinScore, DEFAULT_CONFIDENCE_GATE);
  const smartCooldownMs = settings.smartDealCooldownMin * 60_000;

  // ── Filter 1: Velocity — suppress oscillating variants ──
  const oscillating = await isVariantOscillating(payload.listingId);
  if (oscillating) {
    skippedCount++;
    console.log(`[telegram-arb] Oscillating variant (≥${VELOCITY_FLIP_THRESHOLD} flips in ${VELOCITY_WINDOW_MS / 3_600_000}h), suppressed: ${payload.variantLabel}`);
    return;
  }

  // ── Step 1: Fetch global market snapshot ──
  const pipelineStartMs = Date.now();
  const market = await fetchGlobalMarketSnapshot(payload.variantId);
  if (!market) {
    skippedCount++;
    console.log(`[telegram-arb] No market data for ${payload.variantLabel}`);
    return;
  }
  const dataMs = Date.now() - pipelineStartMs;

  // ── Step 2: Run arbitrage algorithm ──
  const computeStartMs = Date.now();
  const arb = computeArbitrage(payload.newPrice, payload.retailerSlug, market);

  console.log(`[telegram-arb] ${payload.retailerSlug} ${payload.variantLabel}: verdict=${arb.verdict} score=${arb.score}`);

  // ── Step 3: DISCARD — a cheaper option exists elsewhere ──
  if (arb.verdict === 'DISCARD') {
    skippedCount++;
    console.log(`[telegram-arb] DISCARD: ${payload.newPrice} TL > floor ${arb.globalFloor} TL @ ${arb.globalFloorRetailer}/${arb.globalFloorColor}`);
    return;
  }

  // ── Step 4: Confidence gate ──
  if (arb.score < minScore) {
    skippedCount++;
    console.log(`[telegram-arb] Low score (${arb.score} < ${minScore}): ${payload.variantLabel}`);
    return;
  }

  // ── Step 4.5: Generational Barrier (Baki Protocol) ──
  const genContext = await checkGenerationalBarrier(payload.variantId, payload.newPrice);
  if (genContext && !genContext.barrierPassed) {
    skippedCount++;
    console.log(`[telegram-arb] Generational barrier: ${genContext.reason}`);
    return;
  }

  // ── Step 5: Tier classification ──
  const tier = classifyNotificationTier(arb, market, payload.newPrice);
  if (!tier) {
    skippedCount++;
    console.log(`[telegram-arb] No qualifying tier for ${payload.variantLabel} (score=${arb.score})`);
    return;
  }

  // ── Step 6: Anti-spam check ──
  const spam = await shouldSendSmartAlert(payload.listingId, payload.newPrice);
  if (!spam.send) {
    skippedCount++;
    console.log(`[telegram-arb] Anti-spam: ${spam.reason}`);
    return;
  }

  // ── Step 7: Atomic claim — prevent duplicate sends across replicas ──
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
    console.log(`[telegram-arb] Already claimed by another replica`);
    return;
  }

  // ── Step 8: Two-phase broadcast ──
  //   Phase 1 (Flash): product + price + link — sent immediately
  //   Phase 2 (Detail): fire-and-forget, don't block on it
  const flashMsg = buildFlashMessage(payload, arb, market);
  const flashResult = await broadcast(flashMsg);

  const analysisMs = Date.now() - computeStartMs;
  const totalMs = Date.now() - pipelineStartMs;
  const tierLabel = tier === 'GLOBAL_FLOOR' ? 'Tier 1 — Global Taban' : 'Tier 2 — Renk Arbitrajı';
  const detailMsg = buildDetailMessage(payload, arb, market, genContext, { dataMs, analysisMs, totalMs }, { tier: tierLabel, minScore });

  // Fire-and-forget: detail mesajı flash'ı bekletmez
  broadcast(detailMsg).catch(err =>
    console.error('[telegram-arb] Detail broadcast failed:', err)
  );

  const result = flashResult;

  // ── Step 9: Log ──
  const dropPercent = payload.oldPrice != null && payload.oldPrice > 0
    ? ((payload.oldPrice - payload.newPrice) / payload.oldPrice) * 100
    : null;

  const msgType = tier === 'GLOBAL_FLOOR' ? 'DEAL_ALERT' : 'DEAL_ALERT';

  if (result.sent > 0) {
    sentCount++;
    console.log(`[telegram-arb] ✓ ${tier} sent: ${payload.variantLabel} (${payload.newPrice} TL, score=${arb.score}) → ${result.sent} subscriber(s)`);

    const fullMessage = flashMsg + '\n\n' + detailMsg;
    await prisma.notificationLog.create({
      data: {
        messageType: msgType as never,
        status: result.failed > 0 ? 'PARTIAL' : 'SENT',
        productName: payload.variantLabel,
        retailer: payload.retailerName,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        dropPercent,
        messageText: fullMessage,
        sentTo: result.sent,
        failedTo: result.failed,
        listingId: payload.listingId,
      },
    }).catch(() => {});
  } else {
    failCount++;
    console.error(`[telegram-arb] ✗ Broadcast failed: ${result.failed} failure(s)`);

    const fullMessage = flashMsg + '\n\n' + detailMsg;
    await prisma.notificationLog.create({
      data: {
        messageType: msgType as never,
        status: 'FAILED',
        productName: payload.variantLabel,
        retailer: payload.retailerName,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        dropPercent,
        messageText: fullMessage,
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

  const tier = classifyNotificationTier(arb, market, listing.currentPrice) ?? 'GLOBAL_FLOOR';
  const genContext = await checkGenerationalBarrier(listing.variantId, listing.currentPrice);

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

  const tierLabel = tier === 'GLOBAL_FLOOR' ? 'Tier 1 — Global Taban' : 'Tier 2 — Renk Arbitrajı';
  const barrierLabel = genContext
    ? (genContext.barrierPassed ? '✅ Geçti' : `🚫 ${genContext.reason}`)
    : '— (veri yok)';
  const minScore = Math.max(settings.smartDealMinScore, DEFAULT_CONFIDENCE_GATE);

  const message = [
    '🧪 <b>ARBİTRAJ FIRSAT TESTİ</b>',
    '',
    buildArbitrageAlertMessage(payload, arb, market, genContext),
    '',
    '─────────────',
    `⚙️ Bariyer: ${barrierLabel}`,
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
