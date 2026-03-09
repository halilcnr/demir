import { NextResponse } from 'next/server';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

/** GET /api/ops/logs — Live sync activity log from worker */
export async function GET() {
  try {
    const resp = await fetch(`${WORKER_URL}/ops/logs`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      return NextResponse.json({ error: 'Worker unavailable' }, { status: 502 });
    }
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Worker unreachable' }, { status: 502 });
  }
}
