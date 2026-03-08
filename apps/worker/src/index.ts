import { startScheduler } from './scheduler';
import { createServer } from 'http';
import { runSync } from './sync';
import { getSyncLogs, getSyncProgress } from './sync-logger';
import { sendTestMessage, getTelegramStats, startTelegramPolling, sendCustomMessage, sendListingAlert } from './services/telegram';

console.log('=== iPhone Price Tracker Worker ===');
console.log(`Ortam: ${process.env.NODE_ENV ?? 'development'}`);
console.log(`Mock Providers: ${process.env.USE_MOCK_PROVIDERS === 'true' ? 'Evet' : 'Hayır'}`);
console.log('==================================');

// ── HTTP trigger endpoint for manual sync ──
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

let isSyncing = false;

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, syncing: isSyncing }));
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
      res.end(JSON.stringify({ error: 'Sync already in progress' }));
      return;
    }

    // Read body to get optional variantId
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      let variantId: string | undefined;
      try {
        const parsed = JSON.parse(body);
        if (parsed.variantId && typeof parsed.variantId === 'string') {
          variantId = parsed.variantId;
        }
      } catch {
        // No body or invalid JSON — full sync
      }

      isSyncing = true;
      res.writeHead(202);
      res.end(JSON.stringify({
        message: variantId ? 'Variant sync triggered' : 'Sync triggered',
        variantId: variantId ?? null,
        startedAt: new Date().toISOString(),
      }));

      runSync(undefined, variantId)
        .then((result) => {
          console.log(`[trigger] ${variantId ? 'Variant' : 'Manual'} sync completed: ${result.itemsScanned} scanned, ${result.itemsMatched} matched`);
        })
        .catch((err) => {
          console.error(`[trigger] ${variantId ? 'Variant' : 'Manual'} sync failed:`, err);
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[worker] HTTP trigger listening on port ${PORT}`);
});

// Start Telegram subscriber polling (/start, /stop commands)
startTelegramPolling();

startScheduler().catch((err) => {
  console.error('[worker] Kritik hata:', err);
  process.exit(1);
});
