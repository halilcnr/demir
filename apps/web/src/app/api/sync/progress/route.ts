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

/** GET /api/sync/progress — live sync progress from worker */
export async function GET() {
  try {
    const res = await fetch(`${WORKER_URL}/sync-progress`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return NextResponse.json({
        running: false, progress: 0, currentRetailer: null,
        currentVariant: null, successCount: 0, failureCount: 0,
        blockedCount: 0, totalListings: 0, processedListings: 0,
        step: 'idle', startedAt: null, estimatedRemainingMs: null,
      });
    }

    const data = await res.json();

    // Estimate remaining time
    let estimatedRemainingMs: number | null = null;
    if (data.running && data.startedAt && data.processedListings > 0 && data.totalListings > 0) {
      const elapsed = Date.now() - new Date(data.startedAt).getTime();
      const rate = data.processedListings / elapsed;
      const remaining = data.totalListings - data.processedListings;
      estimatedRemainingMs = rate > 0 ? Math.round(remaining / rate) : null;
    }

    return NextResponse.json({ ...data, estimatedRemainingMs });
  } catch {
    return NextResponse.json({
      running: false, progress: 0, currentRetailer: null,
      currentVariant: null, successCount: 0, failureCount: 0,
      blockedCount: 0, totalListings: 0, processedListings: 0,
      step: 'idle', startedAt: null, estimatedRemainingMs: null,
    });
  }
}
