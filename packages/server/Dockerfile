# syntax=docker/dockerfile:1.7

FROM node:20-alpine
RUN corepack enable
WORKDIR /app

# Workspace meta — needed by pnpm to resolve workspace:* deps.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Workspace package manifests so pnpm install can resolve `workspace:*`
# refs without copying the whole source tree first.
COPY packages/server/package.json packages/server/
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/

# Install dependencies for the server filter — pnpm follows workspace:*
# links and pulls in @arrowfall/engine + @arrowfall/shared transitively.
RUN pnpm install --frozen-lockfile --filter @arrowfall/server...

# Workspace source — server, engine, shared. Client is intentionally
# excluded (browser-only, pulls Pixi which is multi-MB).
COPY packages/server packages/server
COPY packages/engine packages/engine
COPY packages/shared packages/shared

EXPOSE 2567
ENV NODE_ENV=production
ENV PORT=2567
WORKDIR /app/packages/server
CMD ["pnpm", "start"]
