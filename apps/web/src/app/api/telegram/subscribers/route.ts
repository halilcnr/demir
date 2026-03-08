import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

export async function GET() {
  try {
    const subscribers = await prisma.telegramSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, username: true, firstName: true, isActive: true, createdAt: true },
    });

    const active = subscribers.filter(s => s.isActive).length;

    return NextResponse.json({ subscribers, activeCount: active, totalCount: subscribers.length });
  } catch (err) {
    return NextResponse.json(
      { error: 'Subscriber fetch failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
