# syntax=docker/dockerfile:1
# Build context: the repository root.
# Only the dev stage exists for now; the Vite build + nginx stages arrive in Story 3.1.

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
RUN pnpm install --frozen-lockfile --filter @todos/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
WORKDIR /app/apps/web
EXPOSE 8080
CMD ["./node_modules/.bin/vite", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]
