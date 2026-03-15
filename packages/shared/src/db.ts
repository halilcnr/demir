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

// Use event-based error logging only on the server (Node.js).
// In the browser, PrismaClient is a Proxy that throws on any property access,
// so we must not call $on or use emit:'event' config in browser context.
const isServer = typeof (globalThis as any).window === 'undefined';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : isServer
        ? [{ emit: 'event', level: 'error' }]  // Server: capture as events for proper severity
        : ['error'],                             // Browser: standard config (won't actually run)
    datasourceUrl: withPoolLimit(process.env.DATABASE_URL),
  });

// Ensure Prisma errors are logged with console.error (not info severity)
// Only attach on server side — PrismaClient.$on crashes in browser Proxy
if (isServer && !globalForPrisma.prisma) {
  (prisma as any).$on?.('error', (e: any) => {
    console.error(`[prisma:error] ${e.message ?? e}`);
  });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

