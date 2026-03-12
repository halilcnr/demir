FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ── Install dependencies ──
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./
COPY prisma ./prisma/
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --no-frozen-lockfile

# ── Build ──
FROM base AS builder
WORKDIR /app

COPY --from=deps /app ./
COPY packages/shared ./packages/shared/
COPY apps/web ./apps/web/
COPY prisma ./prisma/

RUN pnpm db:generate
RUN pnpm --filter @repo/web build

# ── Production ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output (outputFileTracingRoot = monorepo root)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
