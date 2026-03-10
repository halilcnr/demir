/**
 * Scrape Health Monitoring Service
 *
 * Aggregates scrape results into hourly snapshots, detects stale listings,
 * and generates daily health reports for Telegram.
 */

import { prisma } from '@repo/shared';
import type { ScrapeHealthDashboard, ProviderHealthRow, StaleListingRow, DailyHealthReport, ScrapeHealthStatus } from '@repo/shared';

// ─── In-memory accumulator for current hour ─────────────────────

interface HourlyAccumulator {
  retailerSlug: string;
  attempts: number;
  successes: number;
  failures: number;
  blocked: number;
  timeouts: number;
  responseTimes: number[];
  listingsUpdated: Set<string>;
  listingsFailed: Set<string>;
  httpStatuses: Record<string, number>;
}

const accumulators = new Map<string, HourlyAccumulator>();
let currentHourStart = getHourStart(new Date());

function getHourStart(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function getAccumulator(slug: string): HourlyAccumulator {
  // Roll over to new hour if needed
  const nowHour = getHourStart(new Date());
  if (nowHour.getTime() !== currentHourStart.getTime()) {
    flushHourlySnapshots().catch(console.error);
    currentHourStart = nowHour;
  }

  if (!accumulators.has(slug)) {
    accumulators.set(slug, {
      retailerSlug: slug,
      attempts: 0,
      successes: 0,
      failures: 0,
      blocked: 0,
      timeouts: 0,
      responseTimes: [],
      listingsUpdated: new Set(),
      listingsFailed: new Set(),
      httpStatuses: {},
    });
  }
  return accumulators.get(slug)!;
}

// ─── Record events from task-worker ─────────────────────────────

export function recordHealthSuccess(slug: string, listingId: string, responseTimeMs: number, httpStatus = 200): void {
  const acc = getAccumulator(slug);
  acc.attempts++;
  acc.successes++;
  acc.responseTimes.push(responseTimeMs);
  acc.listingsUpdated.add(listingId);
  acc.httpStatuses[String(httpStatus)] = (acc.httpStatuses[String(httpStatus)] ?? 0) + 1;
}

export function recordHealthFailure(slug: string, listingId: string, reason: 'blocked' | 'timeout' | 'error', httpStatus?: number): void {
  const acc = getAccumulator(slug);
  acc.attempts++;
  acc.failures++;
  acc.listingsFailed.add(listingId);
  if (reason === 'blocked') acc.blocked++;
  if (reason === 'timeout') acc.timeouts++;
  if (httpStatus) {
    acc.httpStatuses[String(httpStatus)] = (acc.httpStatuses[String(httpStatus)] ?? 0) + 1;
  }
}

// ─── Flush hourly snapshots to DB ───────────────────────────────

export async function flushHourlySnapshots(): Promise<void> {
  const entries = [...accumulators.entries()];
  if (entries.length === 0) return;

  const periodStart = currentHourStart;
  const periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);

  for (const [slug, acc] of entries) {
    if (acc.attempts === 0) continue;

    const sorted = [...acc.responseTimes].sort((a, b) => a - b);
    const avgMs = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p95Ms = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;

    await prisma.scrapeHealthSnapshot.upsert({
      where: {
        retailerSlug_periodStart: { retailerSlug: slug, periodStart },
      },
      update: {
        totalAttempts: acc.attempts,
        successCount: acc.successes,
        failureCount: acc.failures,
        blockedCount: acc.blocked,
        timeoutCount: acc.timeouts,
        avgResponseMs: Math.round(avgMs),
        p95ResponseMs: Math.round(p95Ms),
        successRate: acc.attempts > 0 ? Math.round((acc.successes / acc.attempts) * 100 * 10) / 10 : 0,
        listingsUpdated: acc.listingsUpdated.size,
        listingsFailed: acc.listingsFailed.size,
        httpStatusCodes: JSON.stringify(acc.httpStatuses),
      },
      create: {
        retailerSlug: slug,
        periodStart,
        periodEnd,
        totalAttempts: acc.attempts,
        successCount: acc.successes,
        failureCount: acc.failures,
        blockedCount: acc.blocked,
        timeoutCount: acc.timeouts,
        avgResponseMs: Math.round(avgMs),
        p95ResponseMs: Math.round(p95Ms),
        successRate: acc.attempts > 0 ? Math.round((acc.successes / acc.attempts) * 100 * 10) / 10 : 0,
        listingsUpdated: acc.listingsUpdated.size,
        listingsFailed: acc.listingsFailed.size,
        httpStatusCodes: JSON.stringify(acc.httpStatuses),
      },
    }).catch(err => console.error(`[scrape-health] Failed to persist snapshot for ${slug}:`, err));
  }

  // Clear accumulators
  accumulators.clear();
  console.log(`[scrape-health] Flushed ${entries.length} hourly snapshots`);
}

// ─── Get full health dashboard data ─────────────────────────────

export async function getScrapeHealthDashboard(): Promise<ScrapeHealthDashboard> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const [retailers, todaySnapshots, allListings, lastSync] = await Promise.all([
    prisma.retailer.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        name: true,
        isActive: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        lastBlockedAt: true,
        consecutiveFailures: true,
      },
    }),
    prisma.scrapeHealthSnapshot.findMany({
      where: { periodStart: { gte: oneDayAgo } },
    }),
    prisma.listing.findMany({
      where: { isActive: true },
      select: {
        id: true,
        lastCheckedAt: true,
        lastSuccessAt: true,
        currentPrice: true,
        retailerId: true,
        variant: {
          select: {
            normalizedName: true,
            family: { select: { name: true } },
          },
        },
        retailer: { select: { name: true, slug: true } },
      },
    }),
    prisma.syncJob.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    }),
  ]);

  // Aggregate today's snapshots per provider
  const providerAgg = new Map<string, {
    attempts: number; successes: number; failures: number; blocked: number;
    responseTimes: number[]; listingsUpdated: number; listingsFailed: number;
    httpStatuses: Record<string, number>;
  }>();

  for (const snap of todaySnapshots) {
    const agg = providerAgg.get(snap.retailerSlug) ?? {
      attempts: 0, successes: 0, failures: 0, blocked: 0,
      responseTimes: [], listingsUpdated: 0, listingsFailed: 0, httpStatuses: {},
    };
    agg.attempts += snap.totalAttempts;
    agg.successes += snap.successCount;
    agg.failures += snap.failureCount;
    agg.blocked += snap.blockedCount;
    if (snap.avgResponseMs > 0) agg.responseTimes.push(snap.avgResponseMs);
    agg.listingsUpdated += snap.listingsUpdated;
    agg.listingsFailed += snap.listingsFailed;
    if (snap.httpStatusCodes) {
      try {
        const codes = JSON.parse(snap.httpStatusCodes) as Record<string, number>;
        for (const [code, count] of Object.entries(codes)) {
          agg.httpStatuses[code] = (agg.httpStatuses[code] ?? 0) + count;
        }
      } catch { /* skip */ }
    }
    providerAgg.set(snap.retailerSlug, agg);
  }

  // Build provider rows
  const providers: ProviderHealthRow[] = retailers.map((r) => {
    const agg = providerAgg.get(r.slug);
    const successRate = agg && agg.attempts > 0 ? (agg.successes / agg.attempts) * 100 : 100;
    const avgTime = agg && agg.responseTimes.length > 0
      ? agg.responseTimes.reduce((a, b) => a + b, 0) / agg.responseTimes.length
      : 0;

    let status: ScrapeHealthStatus = 'healthy';
    if (successRate < 50 || r.consecutiveFailures >= 10) status = 'failing';
    else if (successRate < 80 || r.consecutiveFailures >= 3) status = 'unstable';

    const blockedRecently = r.lastBlockedAt ? (now.getTime() - r.lastBlockedAt.getTime()) < 60 * 60 * 1000 : false;

    return {
      slug: r.slug,
      name: r.name,
      isActive: r.isActive,
      status,
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
      lastBlockedAt: r.lastBlockedAt?.toISOString() ?? null,
      successRate: Math.round(successRate * 10) / 10,
      avgScrapeTimeMs: Math.round(avgTime),
      listingsUpdatedToday: agg?.listingsUpdated ?? 0,
      listingsFailedToday: agg?.listingsFailed ?? 0,
      blockedRecently,
      consecutiveFailures: r.consecutiveFailures,
      totalAttempts: agg?.attempts ?? 0,
      httpStatusBreakdown: agg?.httpStatuses ?? {},
    };
  });

  // Find stale listings
  const staleListings: StaleListingRow[] = [];
  let updatedToday = 0;
  let failedToday = 0;

  for (const listing of allListings) {
    const lastCheck = listing.lastCheckedAt ?? listing.lastSuccessAt;
    if (lastCheck && lastCheck.getTime() >= oneDayAgo.getTime()) {
      updatedToday++;
    }
    if (lastCheck && lastCheck.getTime() < oneDayAgo.getTime()) {
      failedToday++;
    }

    if (!lastCheck || lastCheck.getTime() < sixHoursAgo.getTime()) {
      const hoursSince = lastCheck
        ? Math.round((now.getTime() - lastCheck.getTime()) / (60 * 60 * 1000) * 10) / 10
        : 999;
      const staleness = !lastCheck || lastCheck.getTime() < twelveHoursAgo.getTime() ? 'critical' : 'warning';

      staleListings.push({
        listingId: listing.id,
        variantName: listing.variant.normalizedName,
        familyName: listing.variant.family.name,
        retailerName: listing.retailer.name,
        retailerSlug: listing.retailer.slug,
        lastCheckedAt: lastCheck?.toISOString() ?? null,
        lastPrice: listing.currentPrice,
        staleness,
        hoursSinceUpdate: hoursSince,
      });
    }
  }

  // Sort stale listings by hours since update descending
  staleListings.sort((a, b) => b.hoursSinceUpdate - a.hoursSinceUpdate);

  const totalAttempts = providers.reduce((s, p) => s + p.totalAttempts, 0);
  const totalSuccesses = providers.reduce((s, p) => s + Math.round(p.totalAttempts * p.successRate / 100), 0);
  const overallRate = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 100;

  return {
    providers,
    staleListings: staleListings.slice(0, 50), // limit to top 50
    summary: {
      totalListings: allListings.length,
      updatedToday,
      failedToday,
      staleCount: staleListings.length,
      overallSuccessRate: Math.round(overallRate * 10) / 10,
      lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
    },
  };
}

// ─── Generate daily health report ───────────────────────────────

export async function generateDailyReport(): Promise<DailyHealthReport> {
  const dashboard = await getScrapeHealthDashboard();

  const providerSummary = dashboard.providers.map(p => ({
    slug: p.slug,
    name: p.name,
    successRate: p.successRate,
    isWarning: p.successRate < 80,
  }));

  // Top failures: group by provider + reason
  const topFailures: DailyHealthReport['topFailures'] = [];
  for (const p of dashboard.providers) {
    if (p.httpStatusBreakdown['403']) {
      topFailures.push({ provider: p.name, reason: 'HTTP 403 blocks', count: p.httpStatusBreakdown['403'] });
    }
    if (p.httpStatusBreakdown['429']) {
      topFailures.push({ provider: p.name, reason: 'HTTP 429 rate limit', count: p.httpStatusBreakdown['429'] });
    }
    if (p.httpStatusBreakdown['500']) {
      topFailures.push({ provider: p.name, reason: 'HTTP 500 server error', count: p.httpStatusBreakdown['500'] });
    }
    if (p.listingsFailedToday > 0 && !p.httpStatusBreakdown['403'] && !p.httpStatusBreakdown['429']) {
      topFailures.push({ provider: p.name, reason: 'Parse/scrape failure', count: p.listingsFailedToday });
    }
  }
  topFailures.sort((a, b) => b.count - a.count);

  const report: DailyHealthReport = {
    date: new Date().toISOString().split('T')[0],
    providers: providerSummary,
    listings: {
      updatedToday: dashboard.summary.updatedToday,
      failedToday: dashboard.summary.failedToday,
      staleCount: dashboard.summary.staleCount,
    },
    topFailures: topFailures.slice(0, 5),
  };

  // Persist to DB
  await prisma.dailyScrapeReport.upsert({
    where: { reportDate: new Date(report.date) },
    update: {
      totalListings: dashboard.summary.totalListings,
      updatedToday: report.listings.updatedToday,
      failedToday: report.listings.failedToday,
      staleListings: report.listings.staleCount,
      providerSummary: JSON.stringify(providerSummary),
      topFailures: JSON.stringify(topFailures),
    },
    create: {
      reportDate: new Date(report.date),
      totalListings: dashboard.summary.totalListings,
      updatedToday: report.listings.updatedToday,
      failedToday: report.listings.failedToday,
      staleListings: report.listings.staleCount,
      providerSummary: JSON.stringify(providerSummary),
      topFailures: JSON.stringify(topFailures),
    },
  }).catch(err => console.error('[scrape-health] Failed to persist daily report:', err));

  return report;
}

// ─── Build Telegram health report message ───────────────────────

export function buildHealthReportMessage(report: DailyHealthReport): string {
  const lines: string[] = [];
  lines.push('📊 <b>Günlük Scrape Sağlık Raporu</b>');
  lines.push('');
  lines.push('<b>Sağlayıcılar:</b>');

  for (const p of report.providers) {
    const emoji = p.successRate >= 90 ? '🟢' : p.successRate >= 70 ? '🟡' : '🔴';
    const warn = p.isWarning ? ' ⚠️' : '';
    lines.push(`${emoji} ${p.name} → %${p.successRate.toFixed(0)} başarı${warn}`);
  }

  lines.push('');
  lines.push('<b>Listeler:</b>');
  lines.push(`✅ Bugün güncellenen → ${report.listings.updatedToday}`);
  lines.push(`❌ Bugün başarısız → ${report.listings.failedToday}`);
  lines.push(`⏰ Bayat listeler → ${report.listings.staleCount}`);

  if (report.topFailures.length > 0) {
    lines.push('');
    lines.push('<b>En sık hatalar:</b>');
    for (const f of report.topFailures.slice(0, 3)) {
      lines.push(`• ${f.provider}: ${f.reason} (${f.count}x)`);
    }
  }

  lines.push('');
  lines.push(`⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);

  return lines.join('\n');
}

// ─── Cleanup old snapshots (keep 30 days) ───────────────────────

export async function cleanupOldSnapshots(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.scrapeHealthSnapshot.deleteMany({
    where: { periodStart: { lt: cutoff } },
  }).catch(err => console.error('[scrape-health] Cleanup failed:', err));
}
