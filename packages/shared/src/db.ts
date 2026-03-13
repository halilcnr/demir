import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Ensure connection pool is capped to prevent "too many clients" */
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes('connection_limit')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=3';
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: withPoolLimit(process.env.DATABASE_URL),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
