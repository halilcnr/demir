import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const alertSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(['PRICE_DROP_PERCENT', 'PRICE_BELOW', 'NEW_LOWEST']),
  threshold: z.number().optional(),
});

/** Tüm alarm kurallarını listele */
export async function GET() {
  const rules = await prisma.alertRule.findMany({
    include: {
      product: true,
      events: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    rules.map((r) => ({
      id: r.id,
      productId: r.productId,
      productModel: r.product.model,
      storage: r.product.storage,
      type: r.type,
      threshold: r.threshold,
      isActive: r.isActive,
      lastTriggered: r.lastTriggered?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      recentEvents: r.events.map((e) => ({
        id: e.id,
        message: e.message,
        oldPrice: e.oldPrice,
        newPrice: e.newPrice,
        isRead: e.isRead,
        createdAt: e.createdAt.toISOString(),
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

  const { productId, type, threshold } = parsed.data;

  // Ürün var mı kontrol et
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const rule = await prisma.alertRule.create({
    data: { productId, type, threshold },
  });

  return NextResponse.json(rule, { status: 201 });
}
