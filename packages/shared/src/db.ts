import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Ensure connection pool is capped and gives up gracefully under spikes. */
// Railway Postgres is a direct TCP connection (no PgBouncer in front) — do NOT set
// pgbouncer=true here; that would disable Prisma's prepared-statement cache and
// regress perf. connection_limit + pool_timeout are the two knobs that matter.
//
// Sizing math for N workers against Railway's 100-connection ceiling:
//   workers × PRISMA_CONNECTION_LIMIT + (web app serverless peak) ≤ 100
//   e.g. 15 workers × 5 + 20 web peak = 95 → safe with 5.
//        5 workers  × 10 + 20         = 70 → safe with 10.
// Default 5 is the conservative choice that keeps 15-worker scale in budget.
// Bump via env if you're on a single worker or moved to PgBouncer.
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  const params: string[] = [];
  const limit = parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? '5', 10);
  const timeout = parseInt(process.env.PRISMA_POOL_TIMEOUT ?? '20', 10);
  if (!url.includes('connection_limit')) params.push(`connection_limit=${limit}`);
  if (!url.includes('pool_timeout')) params.push(`pool_timeout=${timeout}`);
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

