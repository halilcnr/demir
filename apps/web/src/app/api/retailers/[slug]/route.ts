import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** Toggle retailer isActive status */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const retailer = await prisma.retailer.findUnique({
    where: { slug },
    select: { id: true, isActive: true, name: true },
  });

  if (!retailer) {
    return NextResponse.json({ error: 'Retailer not found' }, { status: 404 });
  }

  const updated = await prisma.retailer.update({
    where: { slug },
    data: { isActive: !retailer.isActive },
    select: { slug: true, name: true, isActive: true },
  });

  return NextResponse.json(updated);
}
