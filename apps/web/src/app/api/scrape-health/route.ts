import { NextResponse } from 'next/server';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

/**
 * GET /api/scrape-health — proxies to worker /scrape-health endpoint
 * Returns: { providers: ProviderHealthRow[], staleListings: StaleListingRow[], summary: {...} }
 */
export async function GET() {
  try {
    const res = await fetch(`${WORKER_URL}/scrape-health`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Worker returned error', status: res.status },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Worker unreachable' },
      { status: 503 },
    );
  }
}

/**
 * POST /api/scrape-health — triggers daily health report generation + Telegram send
 */
export async function POST() {
  try {
    const res = await fetch(`${WORKER_URL}/health-report`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Worker returned error', status: res.status },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Worker unreachable' },
      { status: 503 },
    );
  }
}
