import { NextRequest, NextResponse } from 'next/server';

/**
 * Sync tetikleme (Dashboard'tan manual sync).
 * Worker'a HTTP ile sync trigger gönderir, yoksa hata döner.
 * Worker Railway'de çalışırken doğrudan DB kendi schedule'ıyla güncellenir.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Dashboard'tan gelen istekleri de kabul et (internal)
    const origin = req.headers.get('origin') ?? '';
    const isInternal = origin.includes('localhost') || origin.includes('vercel.app');
    if (!isInternal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Worker Railway'de çalışıyor, dashboard'dan doğrudan sync çalıştırılamaz
  // Bu endpoint bilgilendirme amaçlı
  return NextResponse.json({
    message: 'Sync işlemi Railway worker tarafından otomatik olarak çalıştırılmaktadır.',
    info: 'Manuel sync tetiklemek için Railway worker loglarını kontrol edin.',
  });
}
