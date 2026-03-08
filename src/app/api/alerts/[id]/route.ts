import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Alarm kuralını güncelle (aktif/pasif, threshold değiştir) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const rule = await prisma.alertRule.findUnique({ where: { id } });
  if (!rule) {
    return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
  }

  const updated = await prisma.alertRule.update({
    where: { id },
    data: {
      isActive: body.isActive ?? rule.isActive,
      threshold: body.threshold ?? rule.threshold,
    },
  });

  return NextResponse.json(updated);
}

/** Alarm kuralını sil */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.alertRule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
