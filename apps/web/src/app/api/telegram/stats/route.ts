import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

export async function GET() {
  try {
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const results = await Promise.all(
      days.map(async (dayStart) => {
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const [sent, failed] = await Promise.all([
          prisma.notificationLog.count({
            where: { status: { in: ['SENT', 'PARTIAL'] }, createdAt: { gte: dayStart, lt: dayEnd } },
          }),
          prisma.notificationLog.count({
            where: { status: 'FAILED', createdAt: { gte: dayStart, lt: dayEnd } },
          }),
        ]);

        return {
          date: dayStart.toISOString().slice(0, 10),
          sent,
          failed,
        };
      }),
    );

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: 'Stats fetch failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
