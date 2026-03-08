FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root-level workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy prisma schema
COPY prisma ./prisma/

# Copy shared package
COPY packages/shared ./packages/shared/

# Copy worker package
COPY apps/worker ./apps/worker/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Generate Prisma client
RUN pnpm db:generate

# Build worker
RUN pnpm --filter @repo/worker build

# ---- Production stage ----
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/turbo.json ./
COPY --from=base /app/prisma ./prisma/
COPY --from=base /app/packages/shared ./packages/shared/
COPY --from=base /app/apps/worker/package.json ./apps/worker/
COPY --from=base /app/apps/worker/dist ./apps/worker/dist/
COPY --from=base /app/node_modules ./node_modules/
COPY --from=base /app/apps/worker/node_modules ./apps/worker/node_modules/
COPY --from=base /app/packages/shared/node_modules ./packages/shared/node_modules/

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
