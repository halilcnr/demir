import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Ensure connection pool is capped and gives up gracefully under spikes. */
// Railway Postgres is a direct TCP connection (no PgBouncer in front) — do NOT set
// pgbouncer=true here; that would disable Prisma's prepared-statement cache and
// regress perf. connection_limit + pool_timeout are the two knobs that matter.
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  const params: string[] = [];
  if (!url.includes('connection_limit')) params.push('connection_limit=10');
  if (!url.includes('pool_timeout')) params.push('pool_timeout=20');
  if (params.length === 0) return url;
  return url + (url.includes('?') ? '&' : '?') + params.join('&');
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

