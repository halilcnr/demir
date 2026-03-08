import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** GET /api/deal-events — recent deal intelligence events */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)));
  const variantId = searchParams.get('variantId');
  const listingId = searchParams.get('listingId');
  const severity = searchParams.get('severity');
  const onlySuspicious = searchParams.get('suspicious') === 'true';

  const where: Record<string, unknown> = {};
  if (variantId) where.variantId = variantId;
  if (listingId) where.listingId = listingId;
  if (severity) where.severity = severity;
  if (onlySuspicious) where.isSuspiciousDiscount = true;

  const events = await prisma.dealEvent.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    take: limit,
    include: {
      listing: {
        include: {
          variant: { include: { family: true } },
          retailer: true,
        },
      },
    },
  });

  return NextResponse.json({
    events: events.map(e => ({
      id: e.id,
      listingId: e.listingId,
      variantId: e.variantId,
      retailerId: e.retailerId,
      eventType: e.eventType,
      oldPrice: e.oldPrice,
      newPrice: e.newPrice,
      dropAmount: e.dropAmount,
      dropPercent: e.dropPercent,
      basis: e.basis,
      severity: e.severity,
      isNewAllTimeLow: e.isNewAllTimeLow,
      isBelowAverage: e.isBelowAverage,
      isSuspiciousDiscount: e.isSuspiciousDiscount,
      suspiciousReason: e.suspiciousReason,
      detectedAt: e.detectedAt.toISOString(),
      variantName: e.listing?.variant?.normalizedName ?? null,
      retailerName: e.listing?.retailer?.name ?? null,
      familyName: e.listing?.variant?.family?.name ?? null,
    })),
  });
}
