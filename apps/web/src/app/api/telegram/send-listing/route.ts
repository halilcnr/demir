import { NextRequest, NextResponse } from 'next/server';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');
const SYNC_TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${WORKER_URL}/send-listing-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SYNC_TRIGGER_SECRET ? { Authorization: `Bearer ${SYNC_TRIGGER_SECRET}` } : {}),
      },
      body: JSON.stringify({ listingId: body.listingId }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Worker unreachable' },
      { status: 502 },
    );
  }
}
