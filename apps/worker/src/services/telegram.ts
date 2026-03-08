import { prisma } from '@repo/shared';

// ─── Configuration ───────────────────────────────────────────────
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

const MIN_DROP_PERCENT = 2;    // Minimum % düşüş (bildirim eşiği)
const MIN_DROP_AMOUNT = 300;   // Minimum TL düşüş
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // Aynı listing için 4 saat bekleme
const POLL_INTERVAL_MS = 30_000; // getUpdates polling interval

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

  const dropAmount = oldPrice - newPrice;
  const dropPercent = ((dropAmount / oldPrice) * 100);

  if (dropPercent < MIN_DROP_PERCENT && dropAmount < MIN_DROP_AMOUNT) {
    return { send: false, reason: `Drop too small: ${dropAmount.toFixed(0)} TL (${dropPercent.toFixed(1)}%)` };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { lastNotifiedPrice: true, notificationSentAt: true },
  });

  if (listing?.lastNotifiedPrice === newPrice) {
    return { send: false, reason: `Already notified for this price (${newPrice} TL)` };
  }

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

  const check = await shouldNotify(payload);
  if (!check.send) {
    skippedCount++;
    console.log(`[telegram] Skipped ${payload.retailerSlug} ${payload.variantLabel}: ${check.reason}`);
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

  if (listing.currentPrice) {
    lines.push(`💰 Güncel: <b>${fmtPrice(listing.currentPrice)} TL</b>`);
  }
  if (listing.previousPrice) {
    lines.push(`📉 Önceki: ${fmtPrice(listing.previousPrice)} TL`);
  }
  if (listing.lowestPrice) {
    lines.push(`🏆 En düşük: ${fmtPrice(listing.lowestPrice)} TL`);
  }
  if (listing.highestPrice) {
    lines.push(`📈 En yüksek: ${fmtPrice(listing.highestPrice)} TL`);
  }

  if (listing.currentPrice && listing.previousPrice && listing.currentPrice < listing.previousPrice) {
    const drop = ((listing.previousPrice - listing.currentPrice) / listing.previousPrice * 100).toFixed(1);
    lines.push('');
    lines.push(`✅ %${drop} düşüş tespit edildi`);
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

/** Start polling for /start and /stop commands. Call once at worker boot. */
export function startTelegramPolling(): void {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) {
    console.log('[telegram] Disabled or no token — polling not started');
    return;
  }

  console.log('[telegram] Subscriber polling started');
  // Run once immediately, then on interval
  processUpdates().catch(() => {});
  pollTimer = setInterval(() => {
    processUpdates().catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function stopTelegramPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
