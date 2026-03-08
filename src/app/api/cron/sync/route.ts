import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

/**
 * Vercel Cron Job endpoint.
 * vercel.json'da tanımlı cron expression ile otomatik çalışır.
 * Her 6 saatte bir tüm retailer'lardan fiyat çeker.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
