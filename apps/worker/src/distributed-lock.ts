/**
 * Distributed lock / leader election using PostgreSQL.
 *
 * Each worker instance gets a random UUID. To become leader for a
 * resource (e.g. "scheduler", "telegram-poll"), it must acquire or
 * renew a lock row. Locks auto-expire so a crashed instance doesn't
 * hold the lock forever.
 *
 * Usage:
 *   const lock = new DistributedLock('scheduler', 30_000);
 *   if (await lock.tryAcquire()) { … leader work … }
 *   // call lock.renew() periodically while doing leader work
 *   // call lock.release() when done
 */

import { prisma } from '@repo/shared';
import { randomUUID } from 'crypto';

/** Unique ID for this worker process (persists for the lifetime of the process) */
export const INSTANCE_ID = randomUUID();

export class DistributedLock {
  constructor(
    private readonly lockId: string,
    /** How long the lock is valid before auto-expiring (ms) */
    private readonly ttlMs: number = 30_000,
  ) {}

  /**
   * Try to acquire the lock. Returns true if this instance is now the holder.
   * - If lock doesn't exist → create it (we're the leader)
   * - If lock exists but expired → take it over
   * - If lock exists and held by us → renew it
   * - If lock exists and held by another live instance → return false
   */
  async tryAcquire(): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    try {
      // Upsert: create if missing, otherwise only take over if expired or already ours
      const existing = await prisma.distributedLock.findUnique({ where: { id: this.lockId } });

      if (!existing) {
        // No lock row — create it (first instance wins)
        await prisma.distributedLock.create({
          data: {
            id: this.lockId,
            holder: INSTANCE_ID,
            acquiredAt: now,
            expiresAt,
            renewedAt: now,
          },
        }).catch(() => {
          // Race: another replica created it between findUnique and create — fall through
        });
      }

      // Take over expired lock, or renew our own
      const result = await prisma.distributedLock.updateMany({
        where: {
          id: this.lockId,
          OR: [
            { expiresAt: { lt: now } },           // expired
            { holder: INSTANCE_ID },               // already ours
          ],
        },
        data: {
          holder: INSTANCE_ID,
          expiresAt,
          renewedAt: now,
        },
      });
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /** Renew the lock (extend TTL). Only succeeds if we're the current holder. */
  async renew(): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    try {
      const result = await prisma.distributedLock.updateMany({
        where: { id: this.lockId, holder: INSTANCE_ID },
        data: { expiresAt, renewedAt: now },
      });
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /** Release the lock so another instance can take over. */
  async release(): Promise<void> {
    try {
      await prisma.distributedLock.deleteMany({
        where: { id: this.lockId, holder: INSTANCE_ID },
      });
    } catch {
      // ignore
    }
  }

  /** Check if we currently hold this lock (without network call — use with caution) */
  async isLeader(): Promise<boolean> {
    try {
      const lock = await prisma.distributedLock.findUnique({ where: { id: this.lockId } });
      if (!lock) return false;
      return lock.holder === INSTANCE_ID && lock.expiresAt > new Date();
    } catch {
      return false;
    }
  }
}
