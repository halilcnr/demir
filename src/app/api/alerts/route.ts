import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const alertSchema = z.object({
  variantId: z.string().min(1).optional(),
  familyId: z.string().min(1).optional(),
  retailerSlug: z.string().optional(),
  type: z.enum(['PRICE_DROP_PERCENT', 'PRICE_BELOW', 'NEW_LOWEST', 'CROSS_RETAILER']),
  threshold: z.number().optional(),
});

/** Tüm alarm kurallarını listele */
export async function GET() {
  const rules = await prisma.alertRule.findMany({
    include: {
      variant: { include: { family: true } },
      family: true,
      events: {
        orderBy: { triggeredAt: 'desc' },
        take: 5,
        include: {
          listing: { include: { retailer: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    rules.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      familyId: r.familyId,
      variantName: r.variant?.normalizedName ?? null,
      familyName: r.family?.name ?? r.variant?.family?.name ?? null,
      retailerSlug: r.retailerSlug,
      type: r.type,
      threshold: r.threshold,
      isActive: r.isActive,
      lastTriggered: r.lastTriggered?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      recentEvents: r.events.map((e) => ({
        id: e.id,
        alertType: e.alertType,
        triggerReason: e.triggerReason,
        oldPrice: e.oldPrice,
        newPrice: e.newPrice,
        dropPercent: e.dropPercent,
        isRead: e.isRead,
        triggeredAt: e.triggeredAt.toISOString(),
        retailerName: e.listing?.retailer?.name ?? null,
        productUrl: e.listing?.productUrl ?? null,
      })),
    }))
  );
}

/** Yeni alarm kuralı oluştur */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = alertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { variantId, familyId, retailerSlug, type, threshold } = parsed.data;

  if (!variantId && !familyId) {
    return NextResponse.json(
      { error: 'variantId veya familyId gerekli' },
      { status: 400 }
    );
  }

  if (variantId) {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }
  }

  if (familyId) {
    const family = await prisma.productFamily.findUnique({ where: { id: familyId } });
    if (!family) {
      return NextResponse.json({ error: 'Family not found' }, { status: 404 });
    }
  }

  const rule = await prisma.alertRule.create({
    data: { variantId, familyId, retailerSlug, type, threshold },
  });

  return NextResponse.json(rule, { status: 201 });
}
