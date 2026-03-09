import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

/** GET /api/telegram/settings — current notification settings */
export async function GET() {
  const settings = await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  return NextResponse.json(settings);
}

/** PUT /api/telegram/settings — update notification settings */
export async function PUT(request: Request) {
  const body = await request.json();

  // Validate numeric fields
  const updates: Record<string, unknown> = {};

  if (body.notifyDropPercent !== undefined) {
    const v = parseFloat(body.notifyDropPercent);
    if (isNaN(v) || v < 0 || v > 100) {
      return NextResponse.json({ error: 'notifyDropPercent must be between 0 and 100' }, { status: 400 });
    }
    updates.notifyDropPercent = v;
  }

  if (body.notifyDropAmount !== undefined) {
    const v = parseFloat(body.notifyDropAmount);
    if (isNaN(v) || v < 0) {
      return NextResponse.json({ error: 'notifyDropAmount must be >= 0' }, { status: 400 });
    }
    updates.notifyDropAmount = v;
  }

  if (body.notifyCooldownMinutes !== undefined) {
    const v = parseInt(body.notifyCooldownMinutes, 10);
    if (isNaN(v) || v < 0 || v > 1440) {
      return NextResponse.json({ error: 'notifyCooldownMinutes must be between 0 and 1440' }, { status: 400 });
    }
    updates.notifyCooldownMinutes = v;
  }

  if (body.notifyAllTimeLow !== undefined) {
    updates.notifyAllTimeLow = Boolean(body.notifyAllTimeLow);
  }

  if (body.notifyEnabled !== undefined) {
    updates.notifyEnabled = Boolean(body.notifyEnabled);
  }

  if (body.notifyMinPrice !== undefined) {
    if (body.notifyMinPrice === null) {
      updates.notifyMinPrice = null;
    } else {
      const v = parseFloat(body.notifyMinPrice);
      if (isNaN(v) || v < 0) {
        return NextResponse.json({ error: 'notifyMinPrice must be >= 0 or null' }, { status: 400 });
      }
      updates.notifyMinPrice = v;
    }
  }

  if (body.notifyMaxPrice !== undefined) {
    if (body.notifyMaxPrice === null) {
      updates.notifyMaxPrice = null;
    } else {
      const v = parseFloat(body.notifyMaxPrice);
      if (isNaN(v) || v < 0) {
        return NextResponse.json({ error: 'notifyMaxPrice must be >= 0 or null' }, { status: 400 });
      }
      updates.notifyMaxPrice = v;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const settings = await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: updates,
    create: { id: 'default', ...updates },
  });

  return NextResponse.json(settings);
}
