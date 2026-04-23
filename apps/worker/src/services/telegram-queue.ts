/**
 * D3 — Postgres-backed distributed Telegram queue (SCAFFOLD — NOT WIRED IN).
 *
 * Status: design committed; schema migration required before activation.
 *
 * Why not Redis: this codebase has no Redis client. All "distributed" state
 * is Postgres (DistributedLock, WorkerHeartbeat, ProviderRateLimit). Adding
 * Upstash is a new infra dep with failure modes, secrets, and ops burden —
 * not worth it at the current scale (≤15 workers, ≤30 msg/sec budget).
 *
 * Schema prerequisite (add to prisma/schema.prisma):
 *
 *   model TelegramQueueItem {
 *     id           String   @id @default(cuid())
 *     priorityTier Int                          // 0=standard, 1=high, 2=elite
 *     score        BigInt                       // priority*1e13 + enqueuedAtMs
 *     chatId       String?                      // null = broadcast-to-all
 *     messageText  String
 *     dedupKey     String?                      // variantId:priceBucket:chatId
 *     enqueuedAt   DateTime @default(now())
 *     agedAt       DateTime @default(now())    // updated by anti-starvation bumps
 *     attempts     Int      @default(0)
 *     lockedBy     String?
 *     lockedAt     DateTime?
 *     status       TelegramQueueStatus @default(PENDING)
 *
 *     @@unique([dedupKey])
 *     @@index([status, score])
 *     @@index([lockedAt])
 *   }
 *
 *   enum TelegramQueueStatus { PENDING SENDING SENT FAILED }
 *
 * Rate budget (real Telegram limits):
 *   - Global: 30 msg/sec. We target 25 msg/sec (1 msg per 40ms) as safety margin.
 *   - Per chat: 1 msg/sec — enforced via per-chat "lastSentAt" map with 1050ms gap.
 *   - Per group: 20 msg/min — reactive (respect 429 Retry-After; don't pre-compute).
 *
 * Anti-starvation:
 *   - A background "ager" task bumps priorityTier of items waiting >60s.
 *   - Elite flood cannot indefinitely starve standard because ager promotes.
 *
 * Deduplication:
 *   - Before enqueue: dedupKey = `${variantId}:${Math.floor(price/100)*100}:${chatId}`.
 *   - TTL handled by cleanup sweep (delete dedupKey rows where SENT and observedAt < now-30min).
 *
 * Dequeue (Postgres analogue of Redis Lua):
 *
 *   WITH claimed AS (
 *     SELECT id FROM "TelegramQueueItem"
 *     WHERE status = 'PENDING'
 *     ORDER BY score DESC
 *     FOR UPDATE SKIP LOCKED
 *     LIMIT 1
 *   )
 *   UPDATE "TelegramQueueItem" t
 *   SET status = 'SENDING', "lockedBy" = $1, "lockedAt" = NOW(),
 *       attempts = attempts + 1
 *   FROM claimed
 *   WHERE t.id = claimed.id
 *   RETURNING t.*;
 *
 * Worst-case latency analysis:
 *   Elite msg ingestion → global rate gate (≤40ms) → per-chat gate (≤1050ms)
 *   → send RTT (~300-800ms) → ACK. Typical: <2s. Elite queue depth = 10 → <20s.
 *
 * Failure modes:
 *   - DB hiccup on enqueue: producer falls back to direct sendToChat (bypassing
 *     queue) for ELITE messages; standard messages drop with log.
 *   - Telegram 429: respect Retry-After, mark item PENDING again, increment
 *     attempts. On attempts > 3, status = FAILED.
 *   - Worker crash mid-send: lockedAt timeout (60s) — reaper flips back to
 *     PENDING; at-most-once is NOT guaranteed. ASSUMES: recipients tolerate
 *     a rare duplicate alert.
 */

export interface TelegramQueueItem {
  priorityTier: 0 | 1 | 2;   // standard | high | elite
  chatId: string | null;
  messageText: string;
  dedupKey?: string;
}

export async function enqueueTelegramMessage(_item: TelegramQueueItem): Promise<void> {
  // NO-OP until schema migration + implementation lands.
  // Callers should continue using the direct sendCustomMessage/broadcast paths.
  throw new Error('[telegram-queue] Not yet implemented — use broadcast() directly until D3 migration ships');
}

export async function getTelegramQueueDepth(): Promise<number> {
  // Return 0 until table exists — safe for /telemetry to call unconditionally.
  return 0;
}
