import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const type = url.searchParams.get('type'); // PRICE_DROP, ALL_TIME_LOW, TEST_MESSAGE
    const status = url.searchParams.get('status'); // SENT, FAILED, SKIPPED
    const search = url.searchParams.get('search');
    const period = url.searchParams.get('period'); // 24h, 7d, 30d, all

    const where: Record<string, unknown> = {};

    if (type) where.messageType = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { retailer: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (period && period !== 'all') {
      const now = Date.now();
      const ms = period === '24h' ? 86400000 : period === '7d' ? 604800000 : 2592000000;
      where.createdAt = { gte: new Date(now - ms) };
    }

    const [logs, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notificationLog.count({ where: where as never }),
    ]);

    return NextResponse.json({ logs, total, limit, offset });
  } catch (err) {
    return NextResponse.json(
      { error: 'History fetch failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
