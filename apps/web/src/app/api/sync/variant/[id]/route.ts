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
 * Tek bir varyant için sync tetikler.
 * POST /api/sync/variant/[id]
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: variantId } = await params;

  if (!variantId || typeof variantId !== 'string') {
    return NextResponse.json({ error: 'Geçersiz varyant ID' }, { status: 400 });
  }

  try {
    const workerRes = await fetch(`${WORKER_URL}/trigger-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SYNC_TRIGGER_SECRET ? { Authorization: `Bearer ${SYNC_TRIGGER_SECRET}` } : {}),
      },
      body: JSON.stringify({ variantId }),
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
      message: 'Varyant sync başlatıldı',
      variantId,
      startedAt: data.startedAt,
      running: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/sync/variant] Worker iletişim hatası:', msg);
    return NextResponse.json(
      { error: 'Worker ile bağlantı kurulamadı', detail: msg },
      { status: 503 },
    );
  }
}
