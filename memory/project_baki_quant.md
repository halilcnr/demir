---
name: Baki-Quant Architecture
description: Monorepo structure and core components of the Baki-Quant arbitrage engine
type: project
---

Baki-Quant is a Next.js + Prisma + Postgres (Neon) arbitrage engine that scrapes Turkish retailers for iPhone price deals.

**Why:** The system hunts sub-second arbitrage opportunities across retailers; performance and correctness of the "Global Floor" / "12-Hour Ghost Rule" / "Generational Gap" computations are the core value.

**How to apply:** When optimizing, focus on:
- `apps/worker/src/deals.ts` — `fetchGlobalMarketSnapshot`, `computeArbitrage`, generational-gap logic, cycle-scoped `marketSnapshotCache`
- `apps/worker/src/services/price-maintenance.ts` — 3-phase daily maintenance (merge / aggregate / prune), currently N+1 per listing
- `apps/web/src/app/api/**` — dashboard + deals APIs; no Vercel `maxDuration` declared anywhere
- `packages/shared/src/db.ts` — single Prisma client, `connection_limit=10` appended to DATABASE_URL; no PgBouncer `pgbouncer=true` flag yet
- `prisma/schema.prisma` — compound indexes exist for deals/dashboard but gaps around `PriceSnapshot(listingId, observedAt, changePercent)` and `Listing(isDeal, lastSeenAt, createdAt)` sort order
