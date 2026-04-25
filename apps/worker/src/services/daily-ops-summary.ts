/**
 * V5 — 00:00 Daily Ops Summary.
 *
 * Single Telegram message at midnight Europe/Istanbul that answers:
 *   "How did the system perform yesterday, and is the calibration drifting?"
 *
 * Sections:
 *   1. Throughput  — total scrapes, deals sent, NO-MISS triggered, skipped.
 *   2. Latency     — avg P50 / P95 across the cluster (from ScrapeHealthSnapshot).
 *   3. Brier score — calibration metric on yesterday's alerts (lower = better).
 *      For each NotificationLog with feedback (GOT_IT or OUT_OF_STOCK) we treat
 *      "real fırsat" as p=1, "fake" as p=0. The model implicitly predicted p=1
 *      (we sent it). Brier = mean((1 - actual)^2) across feedback.
 *      Without feedback we report null and skip the line.
 *   4. Best deal of the day — biggest dropPercent SENT alert.
 *   5. Per-retailer health card — one line per active retailer:
 *      "Hepsiburada 23 deal/3 fake (87% trust)".
 *
 * Idempotency: writes a DailyOpsSummary row keyed on date — the cron may
 * fire twice and the upsert deduplicates. Telegram broadcast is wrapped in
 * a Postgres advisory-style flag (createdAt check) so a duplicate firing
 * within 30 minutes does NOT re-broadcast.
 */

import { prisma } from '@repo/shared';
import { broadcast } from './telegram';
import { getNoMissDailyStats } from './no-miss-engine';

const ISTANBUL_TZ = 'Europe/Istanbul';

/** Returns the start-of-day in Europe/Istanbul, expressed as a UTC Date. */
function istanbulStartOfDay(referenceDate = new Date()): Date {
  const istParts = referenceDate.toLocaleString('en-CA', {
    timeZone: ISTANBUL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // istParts comes as "YYYY-MM-DD" with en-CA locale.
  // Construct a UTC date at the Istanbul midnight; Istanbul is UTC+3 (no DST).
  const [y, m, d] = istParts.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, -3, 0, 0)); // -3 to land at IST 00:00
}

interface SummaryNumbers {
  totalScrapes: number;
  totalDeals: number;
  totalSkipped: number;
  totalNoMiss: number;
  avgP50: number;
  avgP95: number;
  brier: number | null;
  feedbackCount: number;
  feedbackPositive: number;
  feedbackNegative: number;
  bestDeal: {
    variantId: string | null;
    productName: string | null;
    retailer: string | null;
    price: number | null;
    dropPct: number | null;
  };
  retailers: Array<{ slug: string; name: string; deals: number; fakes: number; trustScore: number }>;
}

async function gatherNumbers(dayStart: Date, dayEnd: Date): Promise<SummaryNumbers> {
  // 1. Total scrapes: sum of all PriceSnapshot rows in the day.
  const totalScrapes = await prisma.priceSnapshot.count({
    where: { observedAt: { gte: dayStart, lt: dayEnd } },
  });

  // 2. Notifications: split SENT (=deals) vs SKIPPED.
  const notifGroups = await prisma.notificationLog.groupBy({
    by: ['status'],
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
    _count: true,
  });
  const findCount = (s: string) => notifGroups.find(g => g.status === s)?._count ?? 0;
  const totalDeals   = findCount('SENT') + findCount('PARTIAL');
  const totalSkipped = findCount('SKIPPED');

  // 3. NO-MISS day stats.
  const noMissStats = await getNoMissDailyStats(dayStart);

  // 4. Latency (cluster avg from hourly snapshots — already computed by scrape-health).
  //    p50 isn't stored, so we use avgResponseMs as the central tendency proxy.
  const healthRows = await prisma.scrapeHealthSnapshot.findMany({
    where: { periodStart: { gte: dayStart, lt: dayEnd } },
    select: { avgResponseMs: true, p95ResponseMs: true, totalAttempts: true },
  });
  let weightedP50 = 0, weightedP95 = 0, totalSamples = 0;
  for (const h of healthRows) {
    const n = h.totalAttempts ?? 0;
    weightedP50 += (h.avgResponseMs ?? 0) * n;
    weightedP95 += (h.p95ResponseMs ?? 0) * n;
    totalSamples += n;
  }
  const avgP50 = totalSamples > 0 ? Math.round(weightedP50 / totalSamples) : 0;
  const avgP95 = totalSamples > 0 ? Math.round(weightedP95 / totalSamples) : 0;

  // 5. Brier score on yesterday's alerts that received feedback.
  //    Sent alerts are listingId-keyed; pull SENT logs for the day, then look up
  //    GOT_IT / OUT_OF_STOCK feedback that arrived AFTER each alert.
  const sentAlerts = await prisma.notificationLog.findMany({
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
      status:    { in: ['SENT', 'PARTIAL'] },
      listingId: { not: null },
    },
    select: { id: true, listingId: true, createdAt: true },
  });
  let brierSum = 0, brierN = 0, fbPos = 0, fbNeg = 0;
  for (const a of sentAlerts) {
    if (!a.listingId) continue;
    const events = await prisma.telegramFeedbackEvent.findMany({
      where: {
        listingId: a.listingId,
        createdAt: { gte: a.createdAt, lt: dayEnd },
        button: { in: ['GOT_IT', 'OUT_OF_STOCK'] },
      },
      select: { button: true },
    });
    if (events.length === 0) continue;
    const positive = events.filter(e => e.button === 'GOT_IT').length;
    const negative = events.filter(e => e.button === 'OUT_OF_STOCK').length;
    if (positive + negative === 0) continue;
    fbPos += positive; fbNeg += negative;
    // p_actual = positive / (positive+negative); we predicted p=1.
    const pActual = positive / (positive + negative);
    brierSum += (1 - pActual) ** 2;
    brierN++;
  }
  const brier = brierN > 0 ? brierSum / brierN : null;

  // 6. Best deal of day = SENT log with biggest dropPercent.
  const best = await prisma.notificationLog.findFirst({
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
      status:    { in: ['SENT', 'PARTIAL'] },
      dropPercent: { not: null },
    },
    orderBy: { dropPercent: 'desc' },
    select: {
      productName: true, retailer: true, newPrice: true,
      dropPercent: true, variantId: true,
    },
  });

  // 7. Per-retailer health card.
  const retailers = await prisma.retailer.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, trustScore: true },
  });
  const perRetailer = await Promise.all(retailers.map(async (r) => {
    const dealsCount = await prisma.notificationLog.count({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd },
        retailer:  r.name,
        status:    { in: ['SENT', 'PARTIAL'] },
      },
    });
    const fakesCount = await prisma.telegramFeedbackEvent.count({
      where: {
        retailerSlug: r.slug,
        button:       'OUT_OF_STOCK',
        createdAt:    { gte: dayStart, lt: dayEnd },
      },
    });
    return { slug: r.slug, name: r.name, deals: dealsCount, fakes: fakesCount, trustScore: r.trustScore };
  }));

  return {
    totalScrapes,
    totalDeals,
    totalSkipped,
    totalNoMiss: noMissStats.alerted + noMissStats.confirmed + noMissStats.anomaly,
    avgP50, avgP95,
    brier,
    feedbackCount: fbPos + fbNeg,
    feedbackPositive: fbPos,
    feedbackNegative: fbNeg,
    bestDeal: {
      variantId:   best?.variantId ?? null,
      productName: best?.productName ?? null,
      retailer:    best?.retailer ?? null,
      price:       best?.newPrice ?? null,
      dropPct:     best?.dropPercent ?? null,
    },
    retailers: perRetailer,
  };
}

function formatMessage(n: SummaryNumbers, dayStart: Date): string {
  const fmtPrice = (p: number | null) =>
    p == null ? '—' : p.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' TL';
  const dateStr = dayStart.toLocaleDateString('tr-TR', { timeZone: ISTANBUL_TZ });
  const lines: string[] = [];
  lines.push(`📊 <b>Günlük Operasyon Özeti — ${dateStr}</b>`);
  lines.push('');

  // Throughput
  lines.push('⚙️ <b>İş Hacmi</b>');
  lines.push(`  • Scrape: <b>${n.totalScrapes.toLocaleString('tr-TR')}</b>`);
  lines.push(`  • Bildirim: <b>${n.totalDeals}</b> gönderildi, <b>${n.totalSkipped}</b> atlandı`);
  if (n.totalNoMiss > 0) lines.push(`  • 🚨 NO-MISS: <b>${n.totalNoMiss}</b>`);
  lines.push('');

  // Latency
  lines.push('⏱️ <b>Latans</b>');
  lines.push(`  • P50: <b>${n.avgP50}ms</b> | P95: <b>${n.avgP95}ms</b>`);
  lines.push('');

  // Brier
  if (n.brier != null) {
    const grade =
      n.brier < 0.10 ? '🟢 Mükemmel' :
      n.brier < 0.25 ? '🟡 İyi'      :
      n.brier < 0.40 ? '🟠 Orta'     : '🔴 Zayıf';
    lines.push('🎯 <b>Kalibrasyon (Brier)</b>');
    lines.push(`  • Skor: <b>${n.brier.toFixed(3)}</b> ${grade} (n=${n.feedbackCount})`);
    lines.push(`  • Pozitif: ${n.feedbackPositive} | Negatif: ${n.feedbackNegative}`);
    lines.push('');
  }

  // Best deal
  if (n.bestDeal.productName) {
    lines.push('🏆 <b>Günün En İyi Fırsatı</b>');
    lines.push(`  • ${n.bestDeal.productName}`);
    lines.push(`  • ${fmtPrice(n.bestDeal.price)} @ ${n.bestDeal.retailer ?? '?'} (${n.bestDeal.dropPct?.toFixed(1) ?? '?'}%)`);
    lines.push('');
  }

  // Per-retailer health
  if (n.retailers.length > 0) {
    lines.push('🏪 <b>Retailer Sağlık Kartı</b>');
    const sorted = [...n.retailers].sort((a, b) => b.deals - a.deals);
    for (const r of sorted) {
      if (r.deals === 0 && r.fakes === 0) continue;
      const trust = `${r.trustScore}%`;
      const trustEmoji = r.trustScore >= 80 ? '🟢' : r.trustScore >= 50 ? '🟡' : '🔴';
      lines.push(`  ${trustEmoji} ${r.name}: ${r.deals} fırsat / ${r.fakes} fake (trust ${trust})`);
    }
    lines.push('');
  }

  lines.push(`<i>Baki-Quant V5 • ${new Date().toLocaleString('tr-TR', { timeZone: ISTANBUL_TZ })}</i>`);
  return lines.join('\n');
}

/**
 * Public entry — invoked by the 00:00 cron tick. Idempotent: re-firing within
 * 30 minutes will refresh the DailyOpsSummary row but NOT re-broadcast.
 */
export async function runDailyOpsSummary(opts: {
  /** When set, treat this as the day to summarize (UTC). Defaults to "yesterday in Istanbul". */
  forDate?: Date;
  /** Skip the Telegram broadcast (smoke testing). */
  silent?: boolean;
} = {}): Promise<{ broadcast: boolean; brier: number | null; deals: number }> {
  // Default: summarize the day that just ended in Istanbul (yesterday).
  const today = istanbulStartOfDay(opts.forDate ?? new Date());
  const dayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dayEnd = today;

  const numbers = await gatherNumbers(dayStart, dayEnd);

  // Upsert audit row.
  const existing = await prisma.dailyOpsSummary.findUnique({
    where: { date: dayStart },
    select: { createdAt: true },
  });
  const upsertData = {
    totalScrapes:      numbers.totalScrapes,
    totalDeals:        numbers.totalDeals,
    totalSkipped:      numbers.totalSkipped,
    totalNoMiss:       numbers.totalNoMiss,
    avgP50LatencyMs:   numbers.avgP50,
    avgP95LatencyMs:   numbers.avgP95,
    brierScore:        numbers.brier,
    feedbackCount:     numbers.feedbackCount,
    feedbackPositive:  numbers.feedbackPositive,
    feedbackNegative:  numbers.feedbackNegative,
    bestDealVariantId: numbers.bestDeal.variantId,
    bestDealPrice:     numbers.bestDeal.price,
    bestDealRetailer:  numbers.bestDeal.retailer,
    bestDealDropPct:   numbers.bestDeal.dropPct,
    perRetailerHealth: numbers.retailers as never,
  };
  await prisma.dailyOpsSummary.upsert({
    where:  { date: dayStart },
    update: upsertData,
    create: { ...upsertData, date: dayStart },
  });

  // Skip the broadcast if a row was already created within the last 30 minutes
  // (guards against double-firings of the 00:00 cron when leaders churn).
  const recentlyBroadcast = existing && (Date.now() - existing.createdAt.getTime()) < 30 * 60_000;
  if (recentlyBroadcast || opts.silent) {
    console.log('[daily-ops-summary] Skipping broadcast (already sent or silent mode).');
    return { broadcast: false, brier: numbers.brier, deals: numbers.totalDeals };
  }

  const message = formatMessage(numbers, dayStart);
  const result = await broadcast(message);
  console.log(`[daily-ops-summary] 📩 Sent to ${result.sent} subscriber(s) (${result.failed} failed). Brier=${numbers.brier ?? 'n/a'}`);
  return { broadcast: result.sent > 0, brier: numbers.brier, deals: numbers.totalDeals };
}
