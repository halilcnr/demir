import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Ensure connection pool is capped to prevent "too many clients" */
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes('connection_limit')) return url;
  // Increased from 3 → 10: worker runs 6+ concurrent periodic DB writers
  // (heartbeat, rate-limiter sync, metrics persist, counter flush, health snapshots, analytics)
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=10';
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : [
          { emit: 'event', level: 'error' },  // Capture errors as events for proper severity
        ],
    datasourceUrl: withPoolLimit(process.env.DATABASE_URL),
  });

// Ensure Prisma errors are logged with console.error (not info severity)
// This fixes the issue where prisma:error was being logged as severity: "info"
if (!globalForPrisma.prisma) {
  (prisma as any).$on?.('error', (e: any) => {
    console.error(`[prisma:error] ${e.message ?? e}`);
  });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
