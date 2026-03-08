import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

/**
 * Fiyat senkronizasyonunu tetikler.
 * Vercel Cron veya manuel çağrı ile kullanılır.
 * CRON_SECRET ile korunur.
 */
export async function POST(req: NextRequest) {
  // Yetkilendirme kontrolü
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const retailerSlug = (body as { retailer?: string }).retailer;

  try {
    const result = await runSync(retailerSlug);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
