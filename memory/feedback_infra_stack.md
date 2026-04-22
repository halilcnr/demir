---
name: Infra stack — Railway DB + worker, Vercel web only
description: Reject Neon/pgbouncer-specific patterns; Railway Postgres is direct TCP, not pooled
type: feedback
---

This project runs Postgres + worker on **Railway**; only the Next.js frontend is on **Vercel**. There is no Neon, no PgBouncer, no external pooler — `DATABASE_URL` points at Railway's direct TCP proxy (`*.proxy.rlwy.net`).

**Why:** I previously assumed Neon based on the `.env.example` comment (`# Database (Neon PostgreSQL)`) and added `pgbouncer=true` + a `directUrl` block. Both are wrong on Railway: `pgbouncer=true` disables Prisma's prepared-statement cache (perf regression), and `directUrl` is redundant when DATABASE_URL is already direct. The `.env.example` comment is stale.

**How to apply:**
- Do NOT add `pgbouncer=true`, `directUrl`, or `CREATE INDEX CONCURRENTLY` to this repo.
- Regular `CREATE INDEX` is fine — Prisma wraps migrations in a tx and CONCURRENTLY breaks that.
- `connection_limit` and `pool_timeout` on `DATABASE_URL` are still useful and correct.
- When optimizing, keep in mind: worker talks to DB over Railway's internal network (low latency); Vercel web talks over public TCP (higher latency — caching matters more here).
