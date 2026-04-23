/**
 * Telegram Feedback Loop — community-driven reinforcement.
 *
 * Inline-keyboard buttons attached to every smart-deal alert:
 *   ✅ ALABİLDİM           → user confirmed the deal was real & purchasable
 *   ❌ STOK YOK / HATALI   → listing is a ghost price (not buyable)
 *   🔥 GÜZEL FİYAT         → user endorses the price (positive signal)
 *   💩 KÖTÜ FİYAT          → price is common / not actually good
 *
 * Aggregation rules:
 *   - 3+ distinct OUT_OF_STOCK votes within 10 minutes → ghost listing for 6h
 *     (respected by task-queue.generateTasks via ghostUntil).
 *   - GOT_IT → Retailer.confidenceScore += 0.02 (capped at 1.0).
 *   - OUT_OF_STOCK → Retailer.confidenceScore -= 0.02 (floored at 0.0).
 *   - GOOD_PRICE / BAD_PRICE → logged but not wired into pricing logic yet.
 *     (Future: feed into z-score computation; requires per-variant tolerance table.)
 *
 * Idempotency: (listingId, chatId, button) unique in DB → one vote per user per button.
 * Rapid re-clicks show "zaten oyladınız" in the callback answer.
 */

import { prisma } from '@repo/shared';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

export type FeedbackButton = 'GOT_IT' | 'OUT_OF_STOCK' | 'GOOD_PRICE' | 'BAD_PRICE';

// Callback data format: "fb:<button>:<listingId>"
// Telegram caps callback_data at 64 bytes — listingId is cuid (~25 chars), button codes are short.
const CALLBACK_CODES: Record<FeedbackButton, string> = {
  GOT_IT: 'g',
  OUT_OF_STOCK: 'o',
  GOOD_PRICE: 'p',
  BAD_PRICE: 'b',
};
const REVERSE_CALLBACK: Record<string, FeedbackButton> = {
  g: 'GOT_IT',
  o: 'OUT_OF_STOCK',
  p: 'GOOD_PRICE',
  b: 'BAD_PRICE',
};

export function buildFeedbackKeyboard(listingId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ ALABİLDİM',        callback_data: `fb:g:${listingId}` },
        { text: '❌ STOK YOK / HATALI', callback_data: `fb:o:${listingId}` },
      ],
      [
        { text: '🔥 GÜZEL FİYAT', callback_data: `fb:p:${listingId}` },
        { text: '💩 KÖTÜ FİYAT',  callback_data: `fb:b:${listingId}` },
      ],
    ],
  };
}

export function parseCallbackData(data: string): { button: FeedbackButton; listingId: string } | null {
  if (!data.startsWith('fb:')) return null;
  const parts = data.split(':');
  if (parts.length !== 3) return null;
  const code = parts[1];
  const listingId = parts[2];
  const button = REVERSE_CALLBACK[code];
  if (!button || !listingId) return null;
  return { button, listingId };
}

// ─── Aggregation thresholds ──────────────────────────────────────────
const GHOST_VOTE_THRESHOLD = 3;
const GHOST_VOTE_WINDOW_MS = 10 * 60 * 1000;     // 10 minutes
// Soft ghost: "verify bekliyor" süresi. Listing skip edilmez — bir sonraki cycle'da
// normal scrape edilir. Başarılı olursa (valid price, IN_STOCK) bayrak kaldırılır.
// Hâlâ null/hata dönerse bayrak korunur, ama scraping durmaz — sadece deal alert'i
// bastırılır (next iteration). Asıl amaç: anlık stok yenilemelerini kaçırmamak.
const GHOST_VERIFY_WINDOW_MS = 30 * 60 * 1000;   // 30 minutes of "unverified" state
const CONFIDENCE_DELTA = 0.02;

export interface HandleFeedbackResult {
  ok: boolean;
  status: 'recorded' | 'duplicate' | 'unknown-listing' | 'error';
  ghosted?: boolean;
  message: string;
}

export async function handleFeedbackVote(
  listingId: string,
  chatId: string,
  button: FeedbackButton,
  messageId?: number,
): Promise<HandleFeedbackResult> {
  // Make sure the listing exists and capture denorm fields for the event row
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, variantId: true, retailer: { select: { id: true, slug: true } } },
  });
  if (!listing) {
    return { ok: false, status: 'unknown-listing', message: 'Listing bulunamadı.' };
  }

  // Idempotent insert — unique(listingId, chatId, button)
  try {
    await prisma.telegramFeedbackEvent.create({
      data: {
        listingId,
        chatId,
        button,
        messageId: messageId ?? null,
        variantId: listing.variantId,
        retailerSlug: listing.retailer.slug,
      },
    });
  } catch (err) {
    // P2002 = unique violation → user already voted this button on this listing
    if ((err as { code?: string })?.code === 'P2002') {
      return { ok: true, status: 'duplicate', message: 'Zaten oyladınız 👍' };
    }
    console.error('[telegram-feedback] insert failed:', err);
    return { ok: false, status: 'error', message: 'Bir hata oluştu.' };
  }

  // Per-button side effects
  let ghosted = false;
  let message = '';

  switch (button) {
    case 'OUT_OF_STOCK': {
      message = 'Oyunuz kaydedildi. Topluluk oyları sayılıyor...';
      // Count distinct OUT_OF_STOCK votes in last 10 minutes
      const cutoff = new Date(Date.now() - GHOST_VOTE_WINDOW_MS);
      const voteCount = await prisma.telegramFeedbackEvent.count({
        where: {
          listingId,
          button: 'OUT_OF_STOCK',
          createdAt: { gte: cutoff },
        },
      });
      if (voteCount >= GHOST_VOTE_THRESHOLD) {
        // Soft flag: listing normal scrape edilmeye devam eder; ghostUntil geçene kadar
        // sadece deal alert'leri bastırılır. İlk başarılı scrape flag'i temizler.
        await prisma.listing.update({
          where: { id: listingId },
          data: {
            ghostUntil: new Date(Date.now() + GHOST_VERIFY_WINDOW_MS),
            ghostReason: 'community-vote',
          },
        });
        ghosted = true;
        message = `🔍 Bu fiyat doğrulama aşamasında (${voteCount} şüphe oyu / 10dk). Bir sonraki scrape'te otomatik yeniden kontrol edilecek — stok varsa bayrak kaldırılır.`;
        console.log(`[telegram-feedback] Listing ${listingId} flagged for verify after ${voteCount} votes`);
      }
      // Also decrement retailer confidence
      await adjustRetailerConfidence(listing.retailer.slug, -CONFIDENCE_DELTA);
      break;
    }

    case 'GOT_IT': {
      message = '🎉 Tebrikler! Bilgi güvenilirliği arttı.';
      await adjustRetailerConfidence(listing.retailer.slug, +CONFIDENCE_DELTA);
      break;
    }

    case 'GOOD_PRICE':
      message = '🔥 Teşekkürler, sinyal kaydedildi.';
      break;

    case 'BAD_PRICE':
      message = '💩 Not edildi. Benzer fiyatlar daha yüksek eşikten geçecek.';
      break;
  }

  return { ok: true, status: 'recorded', ghosted, message };
}

async function adjustRetailerConfidence(slug: string, delta: number): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "Retailer"
      SET "confidenceScore" = GREATEST(0, LEAST(1, "confidenceScore" + ${delta}))
      WHERE slug = ${slug}
    `;
  } catch (err) {
    console.error(`[telegram-feedback] confidence adjust failed for ${slug}:`, err);
  }
}

// ─── Telegram callback_query answer API ─────────────────────────────
export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text.slice(0, 200), // Telegram caps at ~200 chars
        show_alert: showAlert,
      }),
    });
  } catch (err) {
    console.error('[telegram-feedback] answerCallbackQuery failed:', err);
  }
}

// ─── Feedback stats (for the viewer UI) ─────────────────────────────
export async function getRecentFeedback(limit = 100) {
  return prisma.telegramFeedbackEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      listingId: true,
      chatId: true,
      button: true,
      retailerSlug: true,
      variantId: true,
      createdAt: true,
    },
  });
}

export async function getFeedbackSummary() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const counts = await prisma.telegramFeedbackEvent.groupBy({
    by: ['button', 'retailerSlug'],
    where: { createdAt: { gte: cutoff } },
    _count: true,
  });

  const ghosted = await prisma.listing.findMany({
    where: { ghostUntil: { gt: new Date() } },
    select: {
      id: true,
      ghostUntil: true,
      ghostReason: true,
      currentPrice: true,
      retailer: { select: { slug: true, name: true } },
      variant: { select: { family: { select: { name: true } }, color: true, storageGb: true } },
    },
    orderBy: { ghostUntil: 'desc' },
    take: 50,
  });

  return {
    last24h: counts.map(c => ({
      button: c.button,
      retailerSlug: c.retailerSlug,
      count: c._count,
    })),
    ghostedListings: ghosted,
  };
}
