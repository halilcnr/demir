import { NextResponse } from 'next/server';
import { prisma } from '@repo/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/**
 * Worker liveness probe for external uptime monitors.
 *
 * Returns 200 iff at least one worker heartbeat is fresher than the threshold.
 * Wire an uptime monitor (UptimeRobot / Railway healthcheck) to this endpoint so
 * a silent worker crash becomes an actionable page rather than a stale dashboard.
 *
 *   200 → alive            (at least one recent heartbeat)
 *   503 → stale/dead       (all workers silent beyond threshold, or none registered)
 */
const STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes — matches task lock timeout

export async function GET() {
  const threshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const freshest = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastHeartbeatAt: 'desc' },
    select: {
      id: true,
      hostname: true,
      status: true,
      lastHeartbeatAt: true,
      tasksCompleted: true,
      tasksFailed: true,
    },
  });

  if (!freshest) {
    return NextResponse.json(
      { alive: false, reason: 'no_workers_registered' },
      { status: 503 },
    );
  }

  const ageMs = Date.now() - freshest.lastHeartbeatAt.getTime();
  const alive = freshest.lastHeartbeatAt >= threshold;

  return NextResponse.json(
    {
      alive,
      staleThresholdMs: STALE_THRESHOLD_MS,
      latest: {
        workerId: freshest.id.slice(0, 12),
        hostname: freshest.hostname,
        status: freshest.status,
        lastHeartbeatAt: freshest.lastHeartbeatAt.toISOString(),
        ageMs,
        tasksCompleted: freshest.tasksCompleted,
        tasksFailed: freshest.tasksFailed,
      },
    },
    { status: alive ? 200 : 503 },
  );
}
