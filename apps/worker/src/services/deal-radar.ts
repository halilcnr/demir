/**
 * Fırsat Radarı — Historical Low & 30-Day Price Tracker
 *
 * Independent notification system that triggers ONLY when:
 * 1. Current price ≤ 30-day minimum OR ≤ all-time low (ATL)
 * 2. Baki Protocol passes (≥10% gap to next-gen model N+1)
 *
 * Anti-spam: per family+storage, only the cheapest color triggers.
 * Fully independent from the existing notifySmartDeal flow.
 */

import { prisma } from '@repo/shared';
import { checkGenerationalBarrier } from '../deals';
import { broadcast, getNotifySettings } from './telegram';

// ─── Constants ───────────────────────────────────────────────────
const RADAR_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h anti-spam per family+storage
const BAKI_GAP_PERCENT = 10; // minimum % gap to next-gen model

// Real discount thresholds (to prevent spam on 5-10 TL drops)
const MIN_RADAR_DROP_TL = 1000;
const MIN_RADAR_DROP_PERCENT = 2;

/**
 * Minimum snapshot count before ATL/30-day low are considered meaningful.
 * The first scrape of any product IS its ATL by definition — that's not a deal.
 * We need at least this many historical data points to confirm a real low.
 */
const MIN_SNAPSHOT_COUNT_FOR_RADAR = 3;

/**
 * Minimum sane price for a phone listing (TL).
 * Anything below this is a scraping error, accessory price, or bait.
 * Galaxy A36 starts at ~14,000 TL, so 5000 TL is a safe floor.
 */
const MIN_SANE_PHONE_PRICE_TL = 5000;

// Track last notification per family+storage to avoid spam
const lastNotifiedMap = new Map<string, number>(); // key → timestamp

// ─── Types ───────────────────────────────────────────────────────

interface RadarCandidate {
  variantId: string;
  variantName: string;
  familyId: string;
  familyName: string;
  storageGb: number;
  color: string;
  currentPrice: number;
  allTimeLowest: number | null;
  lowest30d: number | null;
  isATL: boolean;
  is30DayLow: boolean;
  bestRetailerName: string | null;
  bestRetailerSlug: string | null;
  productUrl: string | null;
  listingId: string | null;
  previousPrice: number | null;
  lastNotifiedPrice: number | null;
}

// ─── Main Scan ───────────────────────────────────────────────────

export async function runDealRadar(): Promise<number> {
  const settings = await getNotifySettings();
  if (!settings.notifyEnabled) {
    console.log('[deal-radar] Notifications disabled in settings, skipping');
    return 0;
  }

  // Fetch all analytics with active listings
  const allAnalytics = await prisma.variantPriceAnalytics.findMany({
    where: {
      lowestCurrentPrice: { not: null, gt: 0 },
      activeListingCount: { gte: 1 },
    },
    include: {
      variant: {
        include: {
          family: true,
          listings: {
            where: {
              isActive: true,
              currentPrice: { not: null, gt: 0 },
              stockStatus: { in: ['IN_STOCK', 'LIMITED'] },
            },
            include: { retailer: true },
            orderBy: { currentPrice: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  // Step 1: Find candidates that hit 30-day or ATL
  const candidates: RadarCandidate[] = [];

  for (const a of allAnalytics) {
    const price = a.lowestCurrentPrice;
    if (!price || price <= 0) continue;

    // ── Sanity check: reject garbage prices from scraping errors ──
    if (price < MIN_SANE_PHONE_PRICE_TL) {
      console.log(`[deal-radar] Saçma fiyat atlandı: ${a.variant.normalizedName} = ${price} TL (< ${MIN_SANE_PHONE_PRICE_TL} TL minimum)`);
      continue;
    }

    const isATL = a.allTimeLowest != null && price <= a.allTimeLowest;
    const is30DayLow = a.lowest30d != null && price <= a.lowest30d;

    if (!isATL && !is30DayLow) continue;

    const bestListing = a.variant.listings[0];

    // --- SPAM FİLTRESİ: GERÇEK İNDİRİM Mİ? ---
    // Sadece 5-10 TL düşüşlerle sürekli bildirim gitmesini engellemek için
    // önceki fiyata kıyasla en az 250 TL veya %0.5 indirim olmalı.
    if (bestListing?.previousPrice != null && bestListing.previousPrice > price) {
      const dropAmount = bestListing.previousPrice - price;
      const dropPercent = (dropAmount / bestListing.previousPrice) * 100;
      
      if (dropAmount < MIN_RADAR_DROP_TL && dropPercent < MIN_RADAR_DROP_PERCENT) {
        // Drop is too small to be newsworthy
        continue;
      }
    }

    // --- DB KALICI SPAM FİLTRESİ ---
    // Eğer listing daha önce bildirildiyse, ve yeni fiyat eskisine çok yakınsa es geç.
    if (bestListing?.lastNotifiedPrice != null) {
      const dropFromLast = bestListing.lastNotifiedPrice - price;
      const dropFromLastPercent = (dropFromLast / bestListing.lastNotifiedPrice) * 100;

      // Sadece daha da ucuzladıysa (ve tatmin edici miktardaysa) tekrar at.
      if (dropFromLast < MIN_RADAR_DROP_TL && dropFromLastPercent < MIN_RADAR_DROP_PERCENT) {
        continue;
      }
    }

    // ── First-observation guard: require enough price history ──
    // On first scrape, the first price IS the ATL by definition — not a real deal.
    const listingIds = a.variant.listings.map((l: { id: string }) => l.id);
    let snapshotCount = 0;
    if (listingIds.length > 0) {
      snapshotCount = await prisma.priceSnapshot.count({
        where: { listingId: { in: listingIds } },
      });
    }
    if (snapshotCount < MIN_SNAPSHOT_COUNT_FOR_RADAR) {
      console.log(`[deal-radar] Yetersiz veri geçmişi: ${a.variant.normalizedName} (${snapshotCount}/${MIN_SNAPSHOT_COUNT_FOR_RADAR} snapshot)`);
      continue;
    }

    candidates.push({
      variantId: a.variantId,
      variantName: a.variant.normalizedName,
      familyId: a.variant.familyId,
      familyName: a.variant.family.name,
      storageGb: a.variant.storageGb,
      color: a.variant.color,
      currentPrice: price,
      allTimeLowest: a.allTimeLowest,
      lowest30d: a.lowest30d,
      isATL,
      is30DayLow,
      bestRetailerName: bestListing?.retailer.name ?? null,
      bestRetailerSlug: bestListing?.retailer.slug ?? null,
      productUrl: bestListing?.productUrl ?? null,
      listingId: bestListing?.id ?? null,
      previousPrice: bestListing?.previousPrice ?? null,
      lastNotifiedPrice: bestListing?.lastNotifiedPrice ?? null,
    });
  }

  if (candidates.length === 0) {
    console.log('[deal-radar] No 30-day or ATL lows found');
    return 0;
  }

  console.log(`[deal-radar] Found ${candidates.length} price-low candidates, applying filters...`);

  // Step 2: Per-family+storage dedup — keep only cheapest color
  const familyGroups = new Map<string, RadarCandidate[]>();
  for (const c of candidates) {
    const key = `${c.familyId}:${c.storageGb}`;
    const group = familyGroups.get(key) ?? [];
    group.push(c);
    familyGroups.set(key, group);
  }

  const deduped: RadarCandidate[] = [];
  for (const group of familyGroups.values()) {
    // Sort by price ascending, pick cheapest
    group.sort((a, b) => a.currentPrice - b.currentPrice);
    // Prefer ATL over 30-day low if same price
    const best = group.find(g => g.isATL) ?? group[0];
    deduped.push(best);
  }

  console.log(`[deal-radar] After color dedup: ${deduped.length} candidates`);

  // Step 3: Apply Baki Protocol + anti-spam + send
  let sentCount = 0;

  for (const candidate of deduped) {
    const groupKey = `${candidate.familyId}:${candidate.storageGb}`;

    // Anti-spam: skip if already notified for this family+storage within cooldown
    const lastNotified = lastNotifiedMap.get(groupKey) ?? 0;
    if (Date.now() - lastNotified < RADAR_COOLDOWN_MS) {
      console.log(`[deal-radar] Cooldown active for ${candidate.familyName} ${candidate.storageGb}GB, skipping`);
      continue;
    }

    // Baki Protocol: check generational barrier (≥10% gap to N+1)
    const genContext = await checkGenerationalBarrier(candidate.variantId, candidate.currentPrice);
    if (genContext && !genContext.isLatestGen && !genContext.barrierPassed) {
      console.log(`[deal-radar] Baki Protocol BLOCKED: ${candidate.familyName} — ${genContext.reason}`);
      continue;
    }

    // Additional Baki check: explicitly verify ≥10% gap
    if (genContext && !genContext.isLatestGen && genContext.gapPercent != null && genContext.gapPercent < BAKI_GAP_PERCENT) {
      console.log(`[deal-radar] Baki Protocol gap too small: ${candidate.familyName} — gap ${genContext.gapPercent.toFixed(1)}% < ${BAKI_GAP_PERCENT}%`);
      continue;
    }

    // Build and send message
    const message = buildDealRadarMessage(candidate, genContext);
    const result = await broadcast(message);

    const dropPercent = candidate.previousPrice ? ((candidate.previousPrice - candidate.currentPrice) / candidate.previousPrice) * 100 : null;

    if (result.sent > 0) {
      sentCount++;
      lastNotifiedMap.set(groupKey, Date.now());
      console.log(`[deal-radar] ✅ Sent: ${candidate.variantName} — ${candidate.currentPrice} TL (${candidate.isATL ? 'ATL' : '30-day low'}) -> ${result.sent} subs`);

      // Log to NotificationLog and update Listing.lastNotifiedPrice
      await prisma.$transaction([
        ...(candidate.listingId ? [
          prisma.listing.update({
            where: { id: candidate.listingId },
            data: { 
              lastNotifiedPrice: candidate.currentPrice,
              notificationSentAt: new Date()
            }
          })
        ] : []),
        prisma.notificationLog.create({
          data: {
            messageType: 'DEAL_ALERT',
            status: result.failed > 0 ? 'PARTIAL' : 'SENT',
            productName: candidate.variantName,
            retailer: candidate.bestRetailerName,
            oldPrice: candidate.previousPrice,
            newPrice: candidate.currentPrice,
            dropPercent,
            messageText: message,
            sentTo: result.sent,
            failedTo: result.failed,
            listingId: candidate.listingId,
          },
        })
      ]).catch(err => {
        console.error('[deal-radar] Failed to log notification or update listing:', err);
      });
    } else {
      console.error(`[deal-radar] ❌ Broadcast failed for ${candidate.variantName}: ${result.failed} failures (0 sent)`);
      
      await prisma.notificationLog.create({
        data: {
          messageType: 'DEAL_ALERT',
          status: 'FAILED',
          productName: candidate.variantName,
          retailer: candidate.bestRetailerName,
          oldPrice: candidate.previousPrice,
          newPrice: candidate.currentPrice,
          dropPercent,
          messageText: message,
          sentTo: 0,
          failedTo: result.failed,
          errorMessage: 'All subscribers failed or zero subscribers',
          listingId: candidate.listingId,
        },
      }).catch(() => {});
    }
  }

  console.log(`[deal-radar] Scan complete: ${sentCount} alerts sent out of ${deduped.length} candidates`);
  return sentCount;
}

// ─── Message Builder (Turkish) ───────────────────────────────────

function buildDealRadarMessage(
  candidate: RadarCandidate,
  genContext: Awaited<ReturnType<typeof checkGenerationalBarrier>>,
): string {
  const fmtPrice = (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const lines: string[] = [];

  // Tier label — ATL takes priority over 30-day low
  if (candidate.isATL) {
    lines.push('💎 <b>TÜM ZAMANLARIN EN DÜŞÜĞÜ!</b>');
  } else {
    lines.push('🗓️ <b>SON 30 GÜNÜN EN DÜŞÜK FİYATI!</b>');
  }
  lines.push('');

  // Product info
  lines.push(`📱 <b>${candidate.variantName}</b>`);
  lines.push(`💰 Fiyat: <b>${fmtPrice(candidate.currentPrice)} TL</b>`);

  // Status
  if (candidate.isATL) {
    lines.push('📉 Durum: Bu ürün şu an tüm zamanların en düşük seviyesinde!');
  } else {
    lines.push('📉 Durum: Bu ürün şu an son 30 günün en düşük seviyesinde!');
  }
  lines.push('');

  // Value analysis — generational comparison
  if (genContext && !genContext.isLatestGen && genContext.gapPercent != null) {
    const anchorPrice = genContext.nextGenPrice ?? genContext.latestGenPrice;
    const anchorName = genContext.nextGenFamilyName ?? genContext.latestGenFamilyName;

    if (anchorPrice != null && anchorName != null) {
      lines.push('⚖️ <b>DEĞER ANALİZİ:</b>');
      lines.push('');
      lines.push(`🟢 Bu Fırsat: <b>${fmtPrice(candidate.currentPrice)} TL</b>`);
      lines.push(`🔴 ${anchorName}: <b>${fmtPrice(anchorPrice)} TL</b> (En Ucuz Renk)`);
      lines.push('');

      lines.push('📊 <b>MAKAS ANALİZİ:</b>');
      lines.push(`Bu fiyat, bir üst nesilden tam <b>%${genContext.gapPercent.toFixed(1)}</b> daha avantajlı.`);
      lines.push('');

      lines.push('🏆 <b>EDİTÖRÜN YORUMU:</b>');
      lines.push(`${candidate.familyName} için ${candidate.isATL ? 'tüm zamanların' : 'son 1 ayın'} en iyi alım fırsatı yakalandı. Üst modelle aradaki makas %10 eşiğini geçtiği için bu fiyat "<b>kaçıran üzülür</b>" seviyesindedir.`);
      lines.push('');
    }
  } else if (genContext?.isLatestGen) {
    lines.push('⚡ <b>En güncel nesil</b> — nesil kıyaslaması gerekmez');
    lines.push('');
  }

  // Deal score — ATL gets 100, 30-day low gets 95
  const score = candidate.isATL ? 100 : 95;
  lines.push(`🎯 Fırsat Skoru: <b>${score}/100</b>`);

  // Link
  if (candidate.productUrl) {
    lines.push('');
    lines.push(`🔗 <a href="${candidate.productUrl}">Ürüne Git</a>`);
  }

  // Retailer
  if (candidate.bestRetailerName) {
    lines.push(`🏪 ${candidate.bestRetailerName}`);
  }

  return lines.join('\n');
}
