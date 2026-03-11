import { NextRequest, NextResponse } from 'next/server';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');
const SYNC_TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

/**
 * Sync tetikleme (Dashboard'tan manual sync).
 * Worker'a HTTP ile sync trigger gönderir.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const origin = req.headers.get('origin') ?? '';
    const isInternal = origin.includes('localhost') || origin.includes('vercel.app');
    if (!isInternal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Forward optional retailerSlug from request body
    let forwardBody: string | undefined;
    try {
      const reqBody = await req.json();
      if (reqBody && typeof reqBody === 'object') {
        forwardBody = JSON.stringify(reqBody);
      }
    } catch {
      // No body or invalid JSON — full sync
    }

    const workerRes = await fetch(`${WORKER_URL}/trigger-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SYNC_TRIGGER_SECRET ? { Authorization: `Bearer ${SYNC_TRIGGER_SECRET}` } : {}),
      },
      ...(forwardBody ? { body: forwardBody } : {}),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await workerRes.json();

    if (workerRes.status === 409) {
      return NextResponse.json(
        { message: 'Sync zaten çalışıyor', running: true },
        { status: 409 },
      );
    }

    if (!workerRes.ok) {
      return NextResponse.json(
        { error: 'Worker hatası', detail: data },
        { status: workerRes.status },
      );
    }

    return NextResponse.json({
      message: 'Sync başlatıldı',
      startedAt: data.startedAt,
      running: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/sync/run] Worker iletişim hatası:', msg);
    return NextResponse.json(
      { error: 'Worker ile bağlantı kurulamadı', detail: msg },
      { status: 503 },
    );
  }
}
