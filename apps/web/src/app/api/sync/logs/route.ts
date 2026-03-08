import { NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3001';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');

  try {
    const url = new URL('/sync-logs', WORKER_URL);
    if (since) url.searchParams.set('since', since);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return NextResponse.json({ running: false, total: 0, logs: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ running: false, total: 0, logs: [] });
  }
}
