FROM node:20-alpine

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

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@repo/worker", "start"]
