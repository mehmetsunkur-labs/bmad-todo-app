# Rubric Walker Review: ARCHITECTURE-SPINE.md (Todos v1)

- **Reviewer:** rubric walker (good-spine checklist, `references/reviewer-gate.md`)
- **Target:** `ARCHITECTURE-SPINE.md` (status: draft, altitude: feature, greenfield)
- **Sources checked:** PRD, addendum, EXPERIENCE.md, DESIGN.md (skimmed), `.memlog.md`
- **Date:** 2026-09-24

## Verdict

**Pass with fixes.** This is a strong, well-sized spine for an internal tool. It has a named paradigm, a shared Zod contract, a closed error set, client-generated ids, a single client store, and an explicit compose topology. Two items can still produce broken behavior on the build side: the AD-6 mutation-queue mechanics, and the PostgreSQL 18 volume layout, which can silently break durability. A handful of medium seams (framework error shapes, proxy prefix, API docs location, how the shared package is built, client-side ordering) should be settled before epics start.

**Findings:** critical 0 · high 3 · medium 7 · low 6

## Checklist

| # | Checklist item | Rating | Note |
|---|---|---|---|
| 1 | Fixes the real divergence points for the level below and misses none | adequate | The contract, surface, DTO, ids, errors, client state, layering, config, and logging are all fixed. Misses: framework-generated error shapes, how the proxy prefix is handled, how the shared package is built and consumed, client-side ordering, and where the API docs live (F-4 to F-8). |
| 2 | Every AD's Rule is enforceable and prevents its stated divergence | adequate (AD-6 thin) | AD-1 to AD-5 and AD-7 to AD-11 are concrete and testable. AD-6 names a mechanism ("cancels any still-queued mutations for that scope") that TanStack Query does not provide. Its success path can also clobber the optimistic state of queued mutations (F-1, F-2). |
| 3 | Nothing under Deferred could let two units diverge | strong | Every Deferred item is out of scope or a one-time, single-repo choice. The lint choice is fine, but TS 7 constrains it (F-9). |
| 4 | Named tech is verified-current | adequate | The memlog records web verification on 2026-09-24. Two gaps: the PG18 image changed its data directory and volume mount point, and the spine doesn't carry that (F-3). The TS 7.0 fallback assumption is only in the memlog (F-9). `pg` is pinned as `8.x` (L-6). |
| 5 | Ratifies rather than contradicts a brownfield codebase | n/a | Greenfield. |
| 6 | Covers the driving spec's capabilities | adequate | FR-1 to FR-12 are mapped. FR-11's "documented in the repository" has no home (F-6). NFR-4 and NFR-12 are absent from `binds` and the map, even as pointers to the UX spines (L-4). The FR-10 queue semantics are covered only in part (F-1). |
| 7 | Inherited parent spine not weakened | n/a | No parent. |
| 8 | Every owned dimension decided, deferred, or open, including the operational envelope | adequate | Deployment, environments, topology, config, and "no CI/TLS/backups" are all explicit. Still silent: restart policy and the upgrade procedure NFR-7 requires in the README (L-1), how the API is built for the production image (F-7), and how the test database gets provisioned (L-2). |

Spine-shape checks from SKILL.md: the paradigm is named and leads (**strong**). The Rules state decisions, not rationale, apart from one justified guard clause in AD-4 (**strong**). The seed is minimal, with the stack, one topology diagram, and a short tree (**strong**).

## Findings

### High

**F-1 · high · AD-6 Rule, step 4.** "Cancels any still-queued mutations for that scope" can't be enforced as written. TanStack Query v5 `scope.id` only serializes mutations, and a failed mutation doesn't stop the next one in its scope. v5 also has no public API to cancel queued mutations, so each builder will invent their own drop mechanism, or skip it, which breaks FR-10 ("no later change is applied on top of a failed one").
*Fix (append to AD-6):* "Each Todo has a rollback epoch in `apps/web/src/api/todo-sync.ts`. A mutation captures the epoch in `onMutate`. Its `mutationFn` first compares the captured epoch with the current one. If the epoch has moved on, it throws `DroppedError` without sending a request. `onError` for a `DroppedError` does nothing: no rollback and no toast. A real failure increments the epoch, then restores the last confirmed state."

**F-2 · high · AD-6 Rule, step 3.** "On success, writes the server's returned `Todo` into the cache" clobbers optimistic changes from mutations still queued for that Todo. For example, with a rapid double toggle, the first success shows the first state again before the second resolves. Or a toggle success overwrites a pending edit's text. The result is visible flicker (NFR-12) and dishonest intermediate state.
*Fix (replace step 3):* "On success, always store the returned `Todo` as the last confirmed state. Write it into `['todos']` only if no later mutation for that scope is pending. Otherwise leave the cache showing the newest optimistic value." Also keep the last confirmed state in the same `todo-sync.ts` module (`Map<id, Todo | null>`, where `null` means not yet created), so every hook reads and writes the same record.

**F-3 · high · AD-10 / Structural Seed (volume `todos-data`).** The `postgres:18` images moved `PGDATA` to `/var/lib/postgresql/18/docker` and expect the volume at `/var/lib/postgresql`. A builder who follows the long-standing `/var/lib/postgresql/data` mount can get a container that refuses to start, or data that never lands in the named volume. That threatens FR-9 and SM-2 (zero data loss), which is the one thing the product must never get wrong.
*Fix (add to AD-10):* "`todos-data` mounts at `/var/lib/postgresql` (the PG18 image layout). Don't mount it at `/var/lib/postgresql/data`, and don't override `PGDATA`." Also add an SM-2-style e2e or smoke check: `compose down && compose up` keeps the Todos.

### Medium

**F-4 · medium · AD-5.** "Every non-2xx response has the envelope" is broken by default for responses Fastify generates outside the service `AppError` path: unknown routes (the `notFoundHandler`), malformed JSON (`FST_ERR_CTP_*`), 413 body-too-large, 415 unsupported media type, and Zod serializer failures. The closed enum also has no code for 413, 415, or health 503.
*Fix:* "One `setErrorHandler` and one `setNotFoundHandler` in `server.ts` emit the envelope. Framework or validation errors with a 4xx status map to `VALIDATION_ERROR` and keep their status (400, 413, 415). Unmatched routes map to `NOT_FOUND`/404. Everything else maps to `INTERNAL`/500. `/health` returns `503` with `INTERNAL` while the DB is unreachable."

**F-5 · medium · AD-9.** Nothing says the `/api` prefix must survive the proxy hop. `proxy_pass http://api:3000/;` (trailing slash) or a Vite `rewrite` strips it, and every route then 404s in one environment but not the other.
*Fix:* "nginx `location /api/ { proxy_pass http://api:3000; }` with no URI part, so the path is forwarded unchanged. The Vite proxy targets `http://api:3000` (inside compose) with no `rewrite`. The API registers routes only under `/api/v1`. nginx serves `index.html` as the SPA fallback for every non-`/api` path."

**F-6 · medium · Capability map, FR-11.** FR-11 and SM-5 require the API to be documented in the repository. The spine names no location or method, so one builder may hand-write Markdown that drifts from `packages/shared` while another generates OpenAPI.
*Fix (add to AD-1 or AD-2):* "The API reference is `docs/api.md`. It lists every AD-2 operation, its schema name in `packages/shared`, and the AD-5 codes. A contract test asserts that every route in the API is listed there." Alternatively: "An OpenAPI document is generated from the shared Zod schemas and served at `/api/v1/openapi.json`." Pick one.

**F-7 · medium · Seed / AD-1 / Dockerfiles.** How `packages/shared` is consumed (as TS source through `exports`, or built to `dist`) and how `apps/api` is built for its production image (`tsc` emit, a bundler, or `tsx` at runtime) are undecided. The `api` Dockerfile, the web build, and Vitest all depend on this, and separate units will pick incompatible answers.
*Fix (add to Consistency Conventions → Build):* "`packages/shared` is consumed as source. Its `package.json` `exports` points to `src/index.ts`. Vite and Vitest compile it directly. `apps/api` builds to a single ESM bundle with esbuild (or tsdown) in the Dockerfile's build stage, and the runtime stage runs `node dist/server.js`. `tsc --noEmit` (tsgo) is used only for type-checking."

**F-8 · medium · AD-3 / AD-6 (client ordering).** The server orders by `createdAt DESC, id DESC`, but the spine never says how the client cache keeps that order. The optimistic `createdAt` is taken from the client clock. If a builder re-sorts when the server's `createdAt` replaces it, the row can jump (NFR-12). A delete rollback must also put the row back in its original position (EXPERIENCE).
*Fix (add to AD-6):* "The client never re-sorts `['todos']`. An optimistic create inserts at index 0. A confirmed Todo replaces its entry in place. A delete records its index in `onMutate`, and rollback re-inserts at that index. The server's order applies only on a full fetch."

**F-9 · medium · Stack (TypeScript 7.0) / Deferred (lint).** The memlog says TS 7.0 falls back to the latest 6.x if typescript-eslint or other tooling is incompatible. The spine drops that assumption, and the deferred lint choice is actually constrained by it (typescript-eslint depends on the TS JS API). One builder might add TS 6 as a second compiler for ESLint while another switches to oxlint.
*Fix:* In the Stack row, write "TypeScript 7.0 (`[ASSUMPTION]` falls back to latest 6.x repo-wide if tooling is incompatible; never two TS versions in one workspace)". In the Deferred lint item, add: "must work with the pinned TS version."

**F-10 · medium · AD-4 (retry identity).** The EXPERIENCE "Retry" toast action resubmits a failed create or edit, but the spine doesn't say whether the retry reuses the original `id`. Idempotent replay (200 or 409) only works if it does. A fresh id after a lost response creates a duplicate.
*Fix (append to AD-4):* "Retry of a failed create resubmits `POST` with the same `id` and the Description originally submitted. The client never mints a new id for a retry."

### Low

- **L-1 · low · Operational envelope (AD-10 / Deferred).** Restart policy and the upgrade procedure are unstated. NFR-7 requires the README to explain how to upgrade without losing data. *Fix:* in AD-10, add "`api`, `web`, and `db` use `restart: unless-stopped`. Upgrading means `git pull && docker compose up -d --build`, and migrations apply on API start (AD-7). Never use `down -v`."
- **L-2 · low · Consistency Conventions → Testing.** The `todos_test` database has no named creator, since `POSTGRES_DB` creates only one database. *Fix:* "`db/init/01-test-db.sql` (mounted into `/docker-entrypoint-initdb.d` in `compose.dev.yaml`) creates `todos_test`. The API test setup runs migrations against it before the suites."
- **L-3 · low · AD-1 / AD-2 (unknown fields).** "Clients ignore unknown response fields" and "timestamps ignored if a client sends them" both depend on Zod's strip behavior. *Fix:* add to AD-1: "Shared schemas use `z.object` (strip). `z.strictObject` and `.passthrough()` are forbidden."
- **L-4 · low · Frontmatter `binds` / Capability map.** NFR-4 is missing from `binds`. NFR-1, NFR-2, NFR-3, NFR-4, NFR-5, NFR-6, NFR-11, and NFR-12 have no map row. *Fix:* add NFR-4 to `binds`, and add map rows that point NFR-4 and NFR-12 to EXPERIENCE.md/DESIGN.md, NFR-3 to AD-4/AD-6/AD-7, and NFR-6 to Testing.
- **L-5 · low · AD-10 (`.env` contents).** The compose-level variables (`WEB_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) aren't listed, and neither is how `DATABASE_URL` is assembled from them. *Fix:* "`.env.example` lists exactly `WEB_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `LOG_LEVEL`. `compose.yaml` builds `DATABASE_URL` for `api` from them."
- **L-6 · low · Stack (`pg` 8.x).** It's the only row not pinned to a minor version, and the linter treats that as unpinned. *Fix:* pin the minor version verified on the web, for example `8.16`.

## Not findings (checked and fine)

- `uuid` v7 over `crypto.randomUUID`: correct. `getRandomValues` works in insecure contexts; `randomUUID` does not.
- No `invalidateQueries`, and focus/reconnect refetch off: consistent with the PRD's "no real-time sync; other tabs see changes on reload".
- DELETE 404 treated as success, and PATCH 404 removing the Todo: consistent with FR-11 and FR-10.
- Deferred items can't cause divergence between units.
- The Node 24 → 26 LTS timing and the Drizzle 0.45 (not the 1.0 RC) pin agree with the memlog's verification.
