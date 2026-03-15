import { startScheduler, getSchedulerState, taskGenLock, cleanupLock } from './scheduler';
import { createServer } from 'http';
import { runSync } from './sync';
import { getSyncLogs, getSyncProgress } from './sync-logger';
import { getAllProviderHealth, getDiscoverySourceHealth } from './provider-health';
import { sendTestMessage, getTelegramStats, startTelegramPolling, sendCustomMessage, sendListingAlert, sendSmartDealTest, getNotifySettings } from './services/telegram';
import { getWorkerConfig, invalidateConfigCache, MODE_PRESETS } from './worker-config';
import { getAllProviderLiveMetrics, computeGlobalRiskScore, getRiskLevel, persistMetricsToDB } from './metrics-collector';
import { getQueueDepth, getActiveRequests, estimateCycleDuration } from './provider-queue';
import { WORKER_ID, startWorkerIdentity, stopWorkerIdentity, getClusterWorkers, getOnlineWorkerCount, cleanupDeadWorkers } from './worker-identity';
import { initRateLimits, resetAllConcurrency } from './distributed-rate-limiter';
import { getTaskQueueStats, cleanupOldTasks } from './task-queue';
import { getTaskWorkerState } from './task-worker';
import { getScrapeHealthDashboard, generateDailyReport, buildHealthReportMessage, flushHourlySnapshots, cleanupOldSnapshots } from './services/scrape-health';
import { computeAllVariantAnalytics, detectSmartDeals, buildSmartDealMessage } from './services/price-analytics';
import { runPriceMaintenance, getPriceStorageStats } from './services/price-maintenance';

const startedAt = new Date().toISOString();
console.log('=== iPhone Price Tracker Worker ===');
console.log(`Ortam: ${process.env.NODE_ENV ?? 'development'}`);
console.log(`Mock Providers: ${process.env.USE_MOCK_PROVIDERS === 'true' ? 'Evet' : 'Hayır'}`);
console.log(`Started at: ${startedAt}`);
console.log('==================================');

// ── HTTP trigger endpoint for manual sync ──
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

let isSyncing = false;

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Health check — detailed
  if (req.method === 'GET' && req.url === '/health') {
    const scheduler = getSchedulerState();
    res.writeHead(200);
    res.end(JSON.stringify({
      ok: true,
      instanceId: WORKER_ID.slice(0, 12),
      isLeader: scheduler.isLeader,
      syncing: isSyncing || scheduler.syncRunning,
      startedAt,
      uptime: Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
      cycleCount: scheduler.cycleCount,
      intervalMs: scheduler.intervalMs,
      lastSync: scheduler.lastSyncResult,
    }));
    return;
  }

  // Cluster status — all workers + task queue
  if (req.method === 'GET' && req.url === '/cluster-status') {
    const workers = await getClusterWorkers();
    const onlineCount = workers.filter(w => w.isAlive).length;
    const taskStats = await getTaskQueueStats();
    const tw = getTaskWorkerState();
    res.writeHead(200);
    res.end(JSON.stringify({
      workerId: WORKER_ID,
      onlineWorkers: onlineCount,
      workers,
      taskQueue: taskStats,
      thisWorker: {
        isProcessing: tw.isProcessing,
        currentSyncJobId: tw.currentSyncJobId,
        concurrency: tw.concurrency,
      },
    }));
    return;
  }

  // Readiness probe — returns 200 only when worker is ready to accept syncs
  if (req.method === 'GET' && req.url === '/ready') {
    const scheduler = getSchedulerState();
    const isReady = scheduler.cycleCount > 0 || !scheduler.syncRunning;
    res.writeHead(isReady ? 200 : 503);
    res.end(JSON.stringify({ ready: isReady, syncing: scheduler.syncRunning }));
    return;
  }

  // Sync logs endpoint
  if (req.method === 'GET' && req.url?.startsWith('/sync-logs')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const since = url.searchParams.get('since');
    const data = getSyncLogs(since ? parseInt(since, 10) : undefined);
    res.writeHead(200);
    res.end(JSON.stringify(data));
    return;
  }

  if (req.method === 'GET' && req.url === '/sync-progress') {
    const data = getSyncProgress();
    res.writeHead(200);
    res.end(JSON.stringify(data));
    return;
  }

  // Provider + discovery source health
  if (req.method === 'GET' && req.url === '/provider-health') {
    const providers = getAllProviderHealth();
    const discoverySources = getDiscoverySourceHealth();
    res.writeHead(200);
    res.end(JSON.stringify({ providers, discoverySources }));
    return;
  }

  // Manual sync trigger
  if (req.method === 'POST' && req.url === '/trigger-sync') {
    // Auth check
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (isSyncing) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: 'Sync already in progress on this instance' }));
      return;
    }

    // Read body to get optional variantId or retailerSlug
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      let variantId: string | undefined;
      let retailerSlug: string | undefined;
      try {
        const parsed = JSON.parse(body);
        if (parsed.variantId && typeof parsed.variantId === 'string') {
          variantId = parsed.variantId;
        }
        if (parsed.retailerSlug && typeof parsed.retailerSlug === 'string') {
          retailerSlug = parsed.retailerSlug;
        }
      } catch {
        // No body or invalid JSON — full sync
      }

      const label = retailerSlug ? `Retailer(${retailerSlug})` : variantId ? 'Variant' : 'Manual';

      isSyncing = true;
      res.writeHead(202);
      res.end(JSON.stringify({
        message: retailerSlug ? `Retailer sync triggered: ${retailerSlug}` : variantId ? 'Variant sync triggered' : 'Sync triggered',
        variantId: variantId ?? null,
        retailerSlug: retailerSlug ?? null,
        startedAt: new Date().toISOString(),
      }));

      runSync(retailerSlug, variantId)
        .then((result) => {
          console.log(`[trigger] ${label} sync completed: ${result.itemsScanned} scanned, ${result.itemsMatched} matched`);
        })
        .catch((err) => {
          console.error(`[trigger] ${label} sync failed:`, err);
        })
        .finally(() => {
          isSyncing = false;
        });
    });
    return;
  }

  // Telegram test endpoint
  if (req.method === 'GET' && req.url === '/test-telegram') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const result = await sendTestMessage();
    res.writeHead(result.ok ? 200 : 500);
    res.end(JSON.stringify(result));
    return;
  }

  // Telegram stats endpoint
  if (req.method === 'GET' && req.url === '/telegram-stats') {
    const stats = getTelegramStats();
    // Also fetch subscriber count from DB
    const { prisma } = await import('@repo/shared');
    const [activeCount, totalCount] = await Promise.all([
      prisma.telegramSubscriber.count({ where: { isActive: true } }),
      prisma.telegramSubscriber.count(),
    ]);
    res.writeHead(200);
    res.end(JSON.stringify({ ...stats, activeSubscribers: activeCount, totalSubscribers: totalCount }));
    return;
  }

  // Telegram subscribers list
  if (req.method === 'GET' && req.url === '/telegram-subscribers') {
    const { prisma } = await import('@repo/shared');
    const subscribers = await prisma.telegramSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, chatId: true, username: true, firstName: true, isActive: true, createdAt: true },
    });
    res.writeHead(200);
    res.end(JSON.stringify(subscribers));
    return;
  }

  // Send custom telegram message
  if (req.method === 'POST' && req.url === '/send-custom-telegram') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body);
        if (!text || typeof text !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'text is required' }));
          return;
        }
        const result = await sendCustomMessage(text);
        res.writeHead(result.ok ? 200 : 500);
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // Test smart deal alert
  if (req.method === 'POST' && req.url === '/test-smart-deal') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = await sendSmartDealTest(parsed.listingId);
        res.writeHead(result.ok ? 200 : 500);
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // Send listing price alert
  if (req.method === 'POST' && req.url === '/send-listing-telegram') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { listingId } = JSON.parse(body);
        if (!listingId || typeof listingId !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'listingId is required' }));
          return;
        }
        const result = await sendListingAlert(listingId);
        res.writeHead(result.ok ? 200 : 500);
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // ─── Ops: full stats (metrics + config + queue) ──────────
  if (req.method === 'GET' && req.url === '/ops/stats') {
    const config = await getWorkerConfig();
    const scheduler = getSchedulerState();
    const metrics = getAllProviderLiveMetrics();
    const globalRisk = computeGlobalRiskScore(metrics);
    const progress = getSyncProgress();
    const queueDepth = getQueueDepth();
    const activeReqs = getActiveRequests();
    const totalListings = progress.totalListings || 0;
    const estimate = await estimateCycleDuration(totalListings, 2000);
    const onlineWorkers = await getOnlineWorkerCount();
    const taskStats = await getTaskQueueStats();
    const tw = getTaskWorkerState();

    res.writeHead(200);
    res.end(JSON.stringify({
      config,
      scheduler: {
        syncRunning: scheduler.syncRunning,
        cycleCount: scheduler.cycleCount,
        intervalMs: scheduler.intervalMs,
        intervalRange: scheduler.intervalRange,
        lastSync: scheduler.lastSyncResult,
      },
      metrics,
      globalRisk: { score: globalRisk, level: getRiskLevel(globalRisk) },
      queue: { depth: queueDepth, active: activeReqs },
      estimate,
      modePresets: MODE_PRESETS,
      progress,
      cluster: {
        workerId: WORKER_ID,
        onlineWorkers,
        taskQueue: taskStats,
        thisWorker: {
          isProcessing: tw.isProcessing,
          currentSyncJobId: tw.currentSyncJobId,
          concurrency: tw.concurrency,
        },
      },
    }));
    return;
  }

  // ─── Ops: update config ─────────────────────────────────
  if (req.method === 'PATCH' && req.url === '/ops/config') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const updates = JSON.parse(body);
        const { prisma } = await import('@repo/shared');

        // Validate fields
        const allowed = [
          'syncIntervalMinMs', 'syncIntervalMaxMs', 'requestDelayMinMs',
          'requestDelayMaxMs', 'jitterPercent', 'globalConcurrency',
          'providerConcurrency', 'maxRetries', 'cooldownMultiplier',
          'blockCooldownMinutes', 'activeMode',
        ];
        const data: Record<string, unknown> = {};
        for (const key of allowed) {
          if (key in updates) data[key] = updates[key];
        }

        const result = await prisma.workerConfig.upsert({
          where: { id: 'default' },
          update: data,
          create: { id: 'default', ...data },
        });
        invalidateConfigCache();
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, config: result }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Invalid request' }));
      }
    });
    return;
  }

  // ─── Ops: activity log (recent structured events) ───────
  if (req.method === 'GET' && req.url === '/ops/logs') {
    const data = getSyncLogs();
    const metrics = getAllProviderLiveMetrics();
    res.writeHead(200);
    res.end(JSON.stringify({ ...data, providerMetrics: metrics }));
    return;
  }

  // ─── Scrape Health Dashboard ───────────────────────────
  if (req.method === 'GET' && req.url === '/scrape-health') {
    try {
      const dashboard = await getScrapeHealthDashboard();
      res.writeHead(200);
      res.end(JSON.stringify(dashboard));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }
    return;
  }

  // ─── Daily Health Report (generate + optionally send to Telegram) ──
  if (req.method === 'POST' && req.url === '/health-report') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      const report = await generateDailyReport();
      const message = buildHealthReportMessage(report);
      const sendResult = await sendCustomMessage(message);
      res.writeHead(200);
      res.end(JSON.stringify({ report, telegramSent: sendResult.ok }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }
    return;
  }

  // ─── Price Analytics: compute all + return smart deals ─
  if (req.method === 'GET' && req.url === '/analytics') {
    try {
      const deals = await detectSmartDeals();
      res.writeHead(200);
      res.end(JSON.stringify({ deals, count: deals.length }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }
    return;
  }

  // ─── Trigger analytics recomputation ───────────────────
  if (req.method === 'POST' && req.url === '/analytics/compute') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      const count = await computeAllVariantAnalytics();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, computedVariants: count }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }
    return;
  }

  // ─── Price Storage Stats ─────────────────────────────────
  if (req.method === 'GET' && req.url === '/price-storage') {
    try {
      const stats = await getPriceStorageStats();
      res.writeHead(200);
      res.end(JSON.stringify(stats));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }
    return;
  }

  // ─── Trigger Price Maintenance ───────────────────────────
  if (req.method === 'POST' && req.url === '/price-maintenance') {
    const authHeader = req.headers['authorization'] ?? '';
    if (TRIGGER_SECRET && authHeader !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      const report = await runPriceMaintenance();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, ...report }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[worker] HTTP trigger listening on port ${PORT}`);
});

// Start Telegram subscriber polling (/start, /stop commands)
startTelegramPolling();

// ─── Keep-alive self-ping (prevents Railway auto-sleep) ─────────
// Railway sleeps services that receive no HTTP traffic for ~10 min.
// Our OOS filter means cycles finish fast → long idle → sleep.
setInterval(() => {
  const url = `http://localhost:${PORT}/health`;
  fetch(url).catch(() => {}); // fire-and-forget
}, 4 * 60_000); // every 4 min

// ─── Overlap-guarded periodic tasks ─────────────────────────────
// Each flag prevents re-entry if the previous invocation is still running.
let metricsRunning = false;
let healthFlushRunning = false;
let analyticsRunning = false;
let maintenanceRunning = false;
let housekeepingRunning = false;

// Periodically persist metrics to DB (every 60s)
setInterval(async () => {
  if (metricsRunning) return;
  metricsRunning = true;
  try { await persistMetricsToDB(); } catch {} finally { metricsRunning = false; }
}, 60_000);

// Flush hourly health snapshots (every 5 min)
setInterval(async () => {
  if (healthFlushRunning) return;
  healthFlushRunning = true;
  try { await flushHourlySnapshots(); } catch {} finally { healthFlushRunning = false; }
}, 5 * 60_000);

// Recompute price analytics (every 15 min) — overlap guard CRITICAL for memory
setInterval(async () => {
  if (analyticsRunning) return;
  analyticsRunning = true;
  try { await computeAllVariantAnalytics(); }
  catch (err) { console.error('[worker] Analytics failed:', err); }
  finally { analyticsRunning = false; }
}, 15 * 60_000);

// Daily health report to Telegram (check every hour, send at ~09:00 Istanbul time)
let lastReportDate = '';
setInterval(async () => {
  const now = new Date();
  const istHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }));
  const todayStr = now.toISOString().split('T')[0];
  if (istHour === 9 && lastReportDate !== todayStr) {
    lastReportDate = todayStr;

    // Check daily report toggle from DB
    const settings = await getNotifySettings();
    if (!settings.notifyDailyReport) {
      console.log('[worker] Daily report disabled in settings, skipping');
      return;
    }

    try {
      const report = await generateDailyReport();
      const message = buildHealthReportMessage(report);
      await sendCustomMessage(message);
      console.log('[worker] Daily health report sent to Telegram');

      // Also detect and send smart deals
      const deals = await detectSmartDeals();
      for (const deal of deals.slice(0, 3)) { // Top 3 deals only
        const dealMsg = buildSmartDealMessage(deal);
        await sendCustomMessage(dealMsg);
      }
    } catch (err) {
      console.error('[worker] Failed to send daily report:', err);
    }
  }
}, 60 * 60_000);

// Cleanup old snapshots + price maintenance (daily)
setInterval(async () => {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    await cleanupOldSnapshots();
    await runPriceMaintenance();
  } catch (err) { console.error('[worker] Maintenance failed:', err); }
  finally { maintenanceRunning = false; }
}, 24 * 60 * 60_000);

// Periodic housekeeping — dead workers + old tasks (every 10 min)
setInterval(async () => {
  if (housekeepingRunning) return;
  housekeepingRunning = true;
  try {
    await cleanupDeadWorkers();
    await cleanupOldTasks();
  } catch {} finally { housekeepingRunning = false; }
}, 10 * 60_000);

// NOTE: Periodic prisma.$disconnect() removed — it was causing
// "Engine is not yet connected" errors on in-flight queries
// (metrics upsert, heartbeat, rate limiter, locks, etc.).

// Initialize distributed worker identity + rate limits, then start scheduler
(async () => {
  try {
    const config = await getWorkerConfig();
    await startWorkerIdentity(config.globalConcurrency);
    await initRateLimits();
    await resetAllConcurrency();
    console.log(`[worker] ✅ Worker identity registered: ${WORKER_ID}`);
    await startScheduler();
  } catch (err) {
    console.error('[worker] Kritik hata:', err);
    process.exit(1);
  }
})();

// Graceful shutdown with lock release + timeout
async function gracefulShutdown(signal: string) {
  console.log(`[worker] ${signal} received — shutting down...`);
  const forceExit = setTimeout(() => {
    console.error('[worker] Shutdown timeout — forcing exit');
    process.exit(1);
  }, 10_000);
  try {
    await Promise.allSettled([
      taskGenLock.release(),
      cleanupLock.release(),
      stopWorkerIdentity(),
    ]);
  } catch { /* swallow */ }
  clearTimeout(forceExit);
  process.exit(0);
}
process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
