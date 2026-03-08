import { prisma } from '@repo/shared';

// ─── Configuration ───────────────────────────────────────────────
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

const MIN_DROP_PERCENT = 2;    // Minimum % düşüş (bildirim eşiği)
const MIN_DROP_AMOUNT = 300;   // Minimum TL düşüş
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // Aynı listing için 4 saat bekleme

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

// ─── Stats ───────────────────────────────────────────────────────
let sentCount = 0;
let failCount = 0;
let skippedCount = 0;

export function getTelegramStats() {
  return { sentCount, failCount, skippedCount, enabled: TELEGRAM_ENABLED };
}

// ─── Core: Send raw message via Telegram Bot API ─────────────────
async function sendTelegramMessage(text: string): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { ok: false, error: 'Bot token or chat ID not configured' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await resp.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${resp.status}` };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
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
  lines.push(`💰 <b>${fmtPrice(newPrice)} TL</b>  ←  <s>${fmtPrice(oldPrice)} TL</s>`);
  lines.push(`📉 ${fmtPrice(dropAmount)} TL düşüş (%${dropPercent})`);

  if (lowestPrice !== null && lowestPrice > 0) {
    lines.push(`📊 Tarihsel en düşük: ${fmtPrice(lowestPrice)} TL`);
  }

  lines.push('');
  lines.push(`🔗 <a href="${productUrl}">Ürüne Git</a>`);

  return lines.join('\n');
}

// ─── Anti-spam / deduplication checks ────────────────────────────
async function shouldNotify(payload: PriceDropPayload): Promise<{ send: boolean; reason?: string }> {
  const { listingId, newPrice, oldPrice } = payload;

  // Check minimum thresholds
  const dropAmount = oldPrice - newPrice;
  const dropPercent = ((dropAmount / oldPrice) * 100);

  if (dropPercent < MIN_DROP_PERCENT && dropAmount < MIN_DROP_AMOUNT) {
    return { send: false, reason: `Drop too small: ${dropAmount.toFixed(0)} TL (${dropPercent.toFixed(1)}%)` };
  }

  // Check deduplication: was this exact price already notified?
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { lastNotifiedPrice: true, notificationSentAt: true },
  });

  if (listing?.lastNotifiedPrice === newPrice) {
    return { send: false, reason: `Already notified for this price (${newPrice} TL)` };
  }

  // Cooldown: don't spam for same listing within window
  if (listing?.notificationSentAt) {
    const elapsed = Date.now() - listing.notificationSentAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const remainingMin = Math.round((COOLDOWN_MS - elapsed) / 60_000);
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

  // Anti-spam check
  const check = await shouldNotify(payload);
  if (!check.send) {
    skippedCount++;
    console.log(`[telegram] Skipped ${payload.retailerSlug} ${payload.variantLabel}: ${check.reason}`);
    return;
  }

  const message = buildPriceDropMessage(payload);
  const result = await sendTelegramMessage(message);

  if (result.ok) {
    sentCount++;
    console.log(`[telegram] ✓ Sent price drop alert for ${payload.retailerSlug} — ${payload.variantLabel} (${payload.newPrice} TL)`);

    // Update listing notification tracking
    await prisma.listing.update({
      where: { id: payload.listingId },
      data: {
        lastNotifiedPrice: payload.newPrice,
        notificationSentAt: new Date(),
      },
    }).catch((err) => {
      console.error('[telegram] Failed to update notification tracking:', err instanceof Error ? err.message : err);
    });
  } else {
    failCount++;
    console.error(`[telegram] ✗ Failed to send alert: ${result.error}`);
  }
}

// ─── Public: Send a test message ─────────────────────────────────
export async function sendTestMessage(): Promise<{ ok: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' };
  }

  const text = [
    '✅ <b>Telegram Bildirim Testi</b>',
    '',
    'bakiphone.vercel.app worker bağlantısı başarılı!',
    `⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
  ].join('\n');

  return sendTelegramMessage(text);
}
