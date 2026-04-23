import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

// Paginated feed of recent feedback events for the viewer page.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get('limit') ?? '200', 10);
  const limit = Math.min(Math.max(limitParam, 1), 500);
  const buttonFilter = url.searchParams.get('button'); // optional
  const retailerFilter = url.searchParams.get('retailer'); // optional

  try {
    const events = await prisma.telegramFeedbackEvent.findMany({
      where: {
        ...(buttonFilter ? { button: buttonFilter as never } : {}),
        ...(retailerFilter ? { retailerSlug: retailerFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // TelegramFeedbackEvent doesn't have a Prisma relation to Listing (keeps the
    // FK graph simple). Stitch in-memory with a single findMany.
    const listingIds = [...new Set(events.map(e => e.listingId))];
    const listings = await prisma.listing.findMany({
      where: { id: { in: listingIds } },
      select: {
        id: true,
        currentPrice: true,
        productUrl: true,
        ghostUntil: true,
        variant: { select: { color: true, storageGb: true, family: { select: { name: true } } } },
        retailer: { select: { name: true } },
      },
    });
    const byId = new Map(listings.map(l => [l.id, l]));
    const now = new Date();

    return NextResponse.json({
      events: events.map(e => {
        const l = byId.get(e.listingId);
        return {
          id: e.id,
          listingId: e.listingId,
          chatId: e.chatId.slice(0, 6) + '…', // redact for privacy
          button: e.button,
          retailerSlug: e.retailerSlug,
          retailerName: l?.retailer.name ?? null,
          variantLabel: l?.variant
            ? `${l.variant.family.name} ${l.variant.color} ${l.variant.storageGb}GB`
            : null,
          currentPrice: l?.currentPrice ?? null,
          productUrl: l?.productUrl ?? null,
          isGhosted: l?.ghostUntil ? l.ghostUntil > now : false,
          createdAt: e.createdAt.toISOString(),
        };
      }),
      count: events.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
