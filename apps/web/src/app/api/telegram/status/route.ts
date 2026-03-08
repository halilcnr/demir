import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

function normalizeWorkerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return 'http://localhost:3001';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const WORKER_URL = normalizeWorkerUrl(process.env.WORKER_URL ?? 'http://localhost:3001');
const SYNC_TRIGGER_SECRET = process.env.SYNC_TRIGGER_SECRET ?? '';

export async function GET() {
  try {
    // Fetch runtime stats from worker
    let workerStats = null;
    let workerReachable = false;
    try {
      const res = await fetch(`${WORKER_URL}/telegram-stats`, {
        headers: SYNC_TRIGGER_SECRET ? { Authorization: `Bearer ${SYNC_TRIGGER_SECRET}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        workerStats = await res.json();
        workerReachable = true;
      }
    } catch {
      workerReachable = false;
    }

    // Fetch DB-level stats
    const [totalSent, totalFailed, totalSkipped, lastSent, lastFailed, subscriberCount] = await Promise.all([
      prisma.notificationLog.count({ where: { status: 'SENT' } }),
      prisma.notificationLog.count({ where: { status: 'FAILED' } }),
      prisma.notificationLog.count({ where: { status: 'SKIPPED' } }),
      prisma.notificationLog.findFirst({ where: { status: 'SENT' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.notificationLog.findFirst({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.telegramSubscriber.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      enabled: workerStats?.enabled ?? false,
      workerReachable,
      subscriberCount,
      totalSent,
      totalFailed,
      totalSkipped,
      lastSentAt: lastSent?.createdAt ?? null,
      lastFailedAt: lastFailed?.createdAt ?? null,
      runtime: workerStats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Status fetch failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
