# syntax=docker/dockerfile:1
# Build context: the repository root.
# Stages: base -> dev (tsx watch + inspector, used by compose.override.yaml)
#         base -> prod (production deps only, the default final stage).
# prod runs TypeScript through tsx's loader in one Node process; server.ts
# applies the committed Drizzle migrations before it listens.

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS dev
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @todos/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 3000 9229
CMD ["./node_modules/.bin/tsx", "watch", "--inspect=0.0.0.0:9229", "src/server.ts"]

FROM base AS prod
ENV NODE_ENV=production
# tsconfig.base.json: the api tsconfig extends it, so tsx transpiles with the
# same options as in dev.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --prod --filter @todos/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 3000
USER node
CMD ["node", "--import", "tsx", "src/server.ts"]
