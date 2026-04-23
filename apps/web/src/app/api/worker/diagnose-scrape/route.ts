import { NextResponse } from 'next/server';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');

// NB: snapshots are per-worker ring buffers. A single request hits ONE replica
// via the load balancer, so the data returned is that replica's recent view.
// That's fine for diagnosis — blocks tend to correlate across replicas, and
// any single replica's ring shows the pattern.

export async function GET(request: Request) {
  const incomingUrl = new URL(request.url);
  const qs = incomingUrl.searchParams.toString();
  const target = `${WORKER_URL}/diagnose-scrape${qs ? `?${qs}` : ''}`;

  try {
    const r = await fetch(target, { signal: AbortSignal.timeout(8_000) });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Worker unreachable' },
      { status: 502 },
    );
  }
}
