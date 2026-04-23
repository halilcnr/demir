import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

// Summary for the command center strip. Uses indexed aggregations —
// no COUNT(*) on hot tables, only the TelegramFeedbackEvent table which
// is small (one row per vote).
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [counts, ghosted] = await Promise.all([
      prisma.telegramFeedbackEvent.groupBy({
        by: ['button', 'retailerSlug'],
        where: { createdAt: { gte: cutoff } },
        _count: true,
      }),
      prisma.listing.findMany({
        where: { ghostUntil: { gt: new Date() } },
        select: {
          id: true,
          ghostUntil: true,
          ghostReason: true,
          currentPrice: true,
          retailer: { select: { slug: true, name: true } },
          variant: { select: { color: true, storageGb: true, family: { select: { name: true } } } },
        },
        orderBy: { ghostUntil: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      last24h: counts.map(c => ({
        button: c.button,
        retailerSlug: c.retailerSlug,
        count: c._count,
      })),
      ghostedListings: ghosted.map(g => ({
        id: g.id,
        ghostUntil: g.ghostUntil?.toISOString() ?? null,
        ghostReason: g.ghostReason,
        currentPrice: g.currentPrice,
        retailer: g.retailer,
        variant: {
          label: `${g.variant.family.name} ${g.variant.color} ${g.variant.storageGb}GB`,
        },
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
