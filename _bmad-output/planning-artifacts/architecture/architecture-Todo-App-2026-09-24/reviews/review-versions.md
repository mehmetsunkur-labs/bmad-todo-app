# Review — versions & reality check (ARCHITECTURE-SPINE.md, Todos)

- Reviewer lens: every committed decision web-researched or reality-checked (versions, existence/fit, live starter defaults).
- Date checked: 2026-09-24. Sources: live npm registry, Docker Hub, nodejs/Release schedule, the shadcn `vite-app` template on GitHub `main`, published package source (`@tanstack/query-core` 5.103.2, `fastify` 5.12.5, `uuid` 14.0.2, `shadcn` 4.21.0, `create-vite` 9.2.1), plus the official docs linked below.

**Verdict: REVISE.** Two findings are high severity: the TypeScript 7 pin, which breaks the lint toolchain that the live shadcn starter ships with, and the Postgres 18 volume mount path, which can silently lose data and breaks FR-9. Everything else is medium or low, with a one-line fix each.

## Spot-check of the memlog `version` entry (live registry, 2026-09-24)

All the checked pins match the live `latest` dist-tags: TypeScript 7.0.2, Vite 8.3.1, Vitest 5.0.1, Fastify 5.12.5, @fastify/type-provider-zod 1.0.0, Zod 4.6.5, @tanstack/react-query 5.103.2, drizzle-orm 0.45.3 (1.0 is at `rc` 1.0.0-rc.4), drizzle-kit 0.31.11, shadcn 4.21.0, uuid 14.0.2, @playwright/test 1.63.0, pnpm 12.6.0, React 19.3.0, Tailwind 4.3.3. The Docker tags `postgres:18-alpine` and `nginx:1.30-alpine` exist and were rebuilt this week. nginx 1.30 is the stable line and 1.31 is mainline. Node 26 LTS starts on 2026-10-28, which is correct. Two claims were not in the memlog and are now verified: `pg` latest is 8.23.0, so "8.x" is correct, and `tsx` latest is 4.23.15, published 2026-09-20. tsx uses esbuild, needs Node >=18, and does no type checking, so it works with Node 24 and does not depend on TS 7.

## Findings

### F1 — HIGH — The TypeScript 7.0 pin conflicts with typescript-eslint and with the shadcn Vite starter
- **Claim:** Stack `TypeScript | 7.0`. The memlog records "fall back to 6.x if typescript-eslint is incompatible" as an unverified assumption, and the spine does not mention it.
- **Found:**
  - `typescript-eslint@8.70.1` (latest) has the peer dependency `typescript: ">=4.8.4 <6.1.0"`. Its issue #12518 ("TypeScript 7.0.2 Support") was closed as *not planned*. When forced to install, it crashes with `Cannot read properties of undefined (reading 'Cjs')`.
  - Microsoft's TS 7.0 announcement says "TypeScript 7.0 does not ship with an API". The API returns in 7.1. The `typescript@7.0.2` package exports only `unstable/*` entry points.
  - The template that `shadcn init -t vite` scaffolds (`templates/vite-app/package.json`) pins `"typescript": "~6"`, `"typescript-eslint": "^8"`, and `eslint ^10` with `prettier`. `create-vite@9.2.1`'s react-ts template also pins `typescript ~6.0.2`.
  - TS 7 also changes defaults that affect this repo: `types` now defaults to `[]`, so the API and test tsconfigs must list `"types": ["node"]` and `vitest/globals` explicitly; `baseUrl` is removed; `moduleResolution: node` is removed.
- **Sources:** https://registry.npmjs.org/typescript-eslint/latest · https://github.com/typescript-eslint/typescript-eslint/issues/12518 · https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ · https://raw.githubusercontent.com/shadcn-ui/ui/main/templates/vite-app/package.json
- **Fix:** Change the Stack row to `TypeScript | 6.0 (typescript@~6.0.3)`, matching the starter, and add a Deferred bullet: "TypeScript 7: adopt when typescript-eslint supports it (7.1 API)". If you want faster tsc now, use Microsoft's documented side-by-side setup: `"typescript": "npm:@typescript/typescript6@^6.0.2"` with `"@typescript/native": "npm:typescript@^7.0.2"` for the `typecheck` script only. Also update the "Lint and format tooling" deferral: the starter already chooses ESLint 10 + typescript-eslint + Prettier, so record that as the default instead of leaving it open.

### F2 — HIGH — The postgres:18 volume mount path isn't specified, and the old path silently loses data
- **Claim:** AD-10 and the seed say "`db` (`postgres:18-alpine`) plus the named volume `todos-data`". The mount path is not given.
- **Found:** Starting with 18, the official image sets `PGDATA=/var/lib/postgresql/18/docker` and declares `VOLUME /var/lib/postgresql`. The mount almost every tutorial and model will write, `todos-data:/var/lib/postgresql/data`, therefore leaves the named volume empty. The data goes to an anonymous volume that is replaced when the container is recreated, and the next start runs initdb again. That breaks FR-9 and NFR-3, and it hides from the `down -v` guidance in the README.
- **Sources:** https://rdiachenko.com/posts/databases/postgresql/postgres-18-docker-silently-ignores-your-named-volume/ · https://github.com/docker-library/postgres/issues/1370 · https://hub.docker.com/_/postgres
- **Fix:** In AD-10, add: "`db` mounts `todos-data:/var/lib/postgresql` (not `/var/lib/postgresql/data`; the PG18 image keeps PGDATA at `/var/lib/postgresql/18/docker`)". Add an E2E or smoke check that runs `docker compose down && docker compose up` and confirms the Todos are still there.

### F3 — MEDIUM — AD-6 step 4 ("cancel still-queued mutations for that scope") has no TanStack Query API
- **Claim:** AD-6 says that on failure the hook "restores the last confirmed state and cancels any still-queued mutations for that scope". It also assumes that `onMutate` gives instant optimistic UI for queued mutations.
- **Found** in the `@tanstack/query-core@5.103.2` source, `mutation.ts` and `mutationCache.ts`:
  - **Confirmed:** `execute()` dispatches `pending` with `isPaused` and awaits `options.onMutate(...)` *before* `retryer.start()`. The `scope` gate (`canRun`) only holds back the network call, so a queued mutation's `onMutate` runs immediately and the optimistic UI is instant, as the spine assumes.
  - **Not supported:** `Mutation` and `MutationCache` have no cancel or abort method, and `mutationFn` receives no `AbortSignal`. When a mutation finishes, whether it succeeded or failed, `runNext` calls `continue()` on the next paused mutation in the scope. The queued mutations will still send their requests after a rollback, and their `onError` or `onSuccess` will write into the cache over the restored state.
  - A scope id only serializes when it is a string (`typeof scope === 'string'`). UUID strings are fine.
- **Source:** https://github.com/TanStack/query/blob/main/packages/query-core/src/mutation.ts · https://github.com/TanStack/query/blob/main/packages/query-core/src/mutationCache.ts
- **Fix:** Reword step 4 so it can be built: "On failure, restore the last confirmed state and bump a per-Todo *generation* counter held in a module-level map in `apps/web/src/api`. Every `mutationFn` captures the generation in `onMutate`, and if the generation has changed by the time it runs, it throws a client-side `SUPERSEDED` error without calling the network. `onError` or `onSuccess` of a superseded mutation does not touch the cache." Alternatively, name `mutationCache.findAll({ predicate })` + `mutationCache.remove(m)`, but that does not stop a mutation that has already resumed, so the generation guard is still needed.

### F4 — MEDIUM — AD-11 "one line per request" is not Fastify's default. `disableRequestLogging` is deprecated in 5.12.
- **Claim:** "The API logs through Fastify's built-in pino ... one line per request: `reqId`, `method`, `route`, `statusCode`, `responseTime`."
- **Found:** In the `fastify@5.12.5` `lib/log-controller.js`, the default emits two lines, `incoming request` (`{ req }`) and `request completed` (`{ res, responseTime }`). Neither line has a `route` field. The top-level `disableRequestLogging` option now emits a deprecation warning ("Use the logController option ... will be removed in fastify@6"). The replacement is a `LogController` subclass passed as `logController`.
- **Source:** https://github.com/fastify/fastify/blob/main/docs/Reference/Server.md#logcontroller · `fastify@5.12.5/lib/warnings.js`
- **Fix:** Add to AD-11: "Implemented as a `LogController` subclass (Fastify ≥5.12 `logController` option): `incomingRequest` is a no-op; `requestCompleted` logs `{ reqId, method, route: request.routeOptions.url, statusCode, responseTime }`. Do not use the deprecated top-level `disableRequestLogging`."

### F5 — MEDIUM — The shadcn `init -t vite` defaults to Base UI, not Radix. The "Radix variant keeps Sonner" reasoning is partly wrong.
- **Claim:** Stack `shadcn/ui CLI (Radix variant, Sonner) 4.21`. The memlog says "Radix variant keeps Sonner ... over Base UI Toast".
- **Found:** `shadcn@4.21.0 init --help` lists `-b, --base <base>` with the values `base, radix, aria`. `--defaults` resolves to `--preset=base-nova`, and preset codes are forced to `base:"base"`. Without an explicit flag, a scaffolding agent gets Base UI. Sonner is available for **both** bases: `r/styles/base-nova/sonner.json` and `r/styles/radix-nova/sonner.json` both return 200. The old `toast` component exists only for base-nova. So Sonner alone doesn't justify Radix. The UX spec is the reason to pick it.
- **Source:** `npx shadcn@4.21.0 init --help` · https://ui.shadcn.com/r/styles/base-nova/sonner.json · https://ui.shadcn.com/docs/installation/vite
- **Fix:** In the Stack row or AD-9's scaffold note, give the exact command: `pnpm dlx shadcn@4.21.0 init -t vite -b radix` (and the chosen preset/style name). The template also sets `@types/node ^20`, so raise it to `^24` to match Node 24.

### F6 — LOW — `pg_isready` healthcheck can report healthy during first-boot init
- **Claim:** AD-10 says "`api` waits for `db` to be healthy (`pg_isready`)". The Testing row needs a `todos_test` database, which will probably be created by an init script.
- **Found:** On first boot, the entrypoint runs a temporary server that listens only on the Unix socket (`listen_addresses=''`) while the init scripts run, and then restarts. A bare `pg_isready` connects over the socket and reports ready too early. The API then races the restart, and its migrate-on-start (AD-7) can fail.
- **Source:** https://github.com/docker-library/postgres/pull/440 · https://github.com/peter-evans/docker-compose-healthcheck
- **Fix:** Specify `healthcheck: test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]` and `depends_on: db: condition: service_healthy`. State that `todos_test` is created by `/docker-entrypoint-initdb.d/*.sql`, which only runs on an empty volume.

### F7 — LOW — nginx proxy and SPA config are unspecified where a common mistake breaks AD-2 and AD-9
- **Claim:** AD-9 says "reverse-proxies `/api/` to `api:3000`".
- **Found:** With `proxy_pass http://api:3000/;` (a URI with a trailing slash), nginx *replaces* the matched `/api/` prefix, so the API gets `/v1/todos` and every call returns 404. Only `proxy_pass http://api:3000;` (no URI) keeps `/api/v1/...`. The same applies to the Vite dev proxy: it must not `rewrite`. Also, nginx resolves `api` at startup and exits with "host not found in upstream" if it can't. There is no SPA fallback today, which is fine for a single route. But `try_files $uri /index.html` is still the safe default, and `/api/` must not fall through to it.
- **Source:** https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass
- **Fix:** Add to AD-9: "`location /api/ { proxy_pass http://api:3000; }` (no trailing URI, no path rewrite in nginx or the Vite proxy); `location / { try_files $uri /index.html; }`; `web` `depends_on: api`."

### F8 — LOW — Fastify behaviors the AD-5 envelope must cover
- **Found** (fastify@5.12.5 source):
  - Unknown routes go to the 404 handler, not `setErrorHandler`. That handler's default body is `{ message, error, statusCode }`, not the AD-5 envelope.
  - A `DELETE` or `GET` sent with `Content-Type: application/json` and an empty body fails with `FST_ERR_CTP_EMPTY_JSON_BODY` (400).
  - @fastify/type-provider-zod 1.0 requires `zod >=4.2` and `fastify ^5.5`, so the pins are compatible. Response serialization via `serializerCompiler` works with Zod 4 (it uses `z.output`/encode). Its peer dependencies, `@fastify/swagger` and `openapi-types`, are declared *without* `peerDependenciesMeta.optional`, so expect pnpm peer warnings or auto-installs.
  - `pg` returns `timestamptz` as a JS `Date`, while the DTO schema is an ISO string. Drizzle `mode:'string'` returns Postgres text format (`2026-09-24 09:14:03.12+00`), not ISO-8601.
- **Source:** https://github.com/fastify/fastify-type-provider-zod · https://registry.npmjs.org/@fastify/type-provider-zod/latest · https://fastify.dev/docs/latest/Reference/Server/#setnotfoundhandler
- **Fix:** Add to the Errors convention row: "`setNotFoundHandler` also emits the AD-5 `NOT_FOUND` envelope; the web http client sets `Content-Type: application/json` only when sending a body." Add to AD-3: "the repository maps `Date` → `toISOString()` (drizzle `timestamp({ withTimezone: true, mode: 'date' })`); the response schema is `z.iso.datetime()`".

### F9 — INFO — Items verified with no change needed
- `AbortSignal.timeout` has been Baseline since 2024 and aborts with `TimeoutError`, not `AbortError`. The client should map both to `NETWORK`. To combine it with TanStack Query's query `signal`, use `AbortSignal.any` (Baseline March 2024). Sources: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static · https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static
- `uuid@14` v7 uses `crypto.getRandomValues`, not `randomUUID`, so the AD-4 non-secure-context reasoning holds. Source: `uuid@14.0.2/dist/rng.js`
- Node 24 enters *maintenance* LTS on 2026-10-20 and reaches EOL on 2028-04-30, so the pin is fine and the existing "revisit after 26 LTS" deferral covers it. Source: https://github.com/nodejs/Release/blob/main/schedule.json
- `vitest@5.0.1` has the peer dependency `vite ^6.4 || ^7 || ^8` and supports Node `^24`. `@vitejs/plugin-react@6.1.1` requires `vite ^8`. `@tailwindcss/vite@4.3.3` supports `vite ^8`. All are compatible.
- `tsx watch` with the inspector in a container must bind `--inspect=0.0.0.0:9229`, or the published `9229` port can't be reached. It's worth adding to AD-10's dev bullet.
