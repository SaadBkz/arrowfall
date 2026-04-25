# syntax=docker/dockerfile:1.7

FROM node:20-alpine
RUN corepack enable
WORKDIR /app

# Workspace meta
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Server's package.json (so install resolves the workspace)
COPY packages/server/package.json packages/server/

# Install only server's deps (and what they pull in)
RUN pnpm install --frozen-lockfile --filter @arrowfall/server

# Server source
COPY packages/server packages/server

EXPOSE 2567
ENV NODE_ENV=production
ENV PORT=2567
WORKDIR /app/packages/server
CMD ["pnpm", "start"]
