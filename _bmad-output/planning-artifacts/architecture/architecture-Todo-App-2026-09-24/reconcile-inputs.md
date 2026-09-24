# Reconcile — Architecture Spine vs Inputs

- **Spine:** `ARCHITECTURE-SPINE.md` (draft, 2026-09-24), with `.memlog.md` for rationale
- **Inputs:** `prds/prd-Todo-App-2026-09-24/prd.md`, `prds/prd-Todo-App-2026-09-24/addendum.md`, `ux-designs/ux-Todo-App-2026-09-24/EXPERIENCE.md`. `DESIGN.md` was checked only for architectural impact.
- **Date:** 2026-09-24
- **Status key:** **landed** means an AD, a convention, or an explicit deferral governs the item. **weak** means it's governed, but a gap or ambiguity lets two units diverge, or the stated mechanism doesn't work as written. **missing** means nothing in the spine governs it. **contradicted** means a spine rule conflicts with the input.

## 1. Extract

### 1.1 PRD: functional requirements

| # | Input item | Spine location | Status | Note |
|---|---|---|---|---|
| P1 | FR-1: show the list on open, with every Todo, newest first | AD-2 (GET list), AD-3 (`createdAt DESC, id DESC`), AD-6 | landed | |
| P2 | FR-1: Created At shown as relative time, with absolute time on hover or focus | AD-3 (ISO-8601 UTC with ms) | landed | Formatting belongs to the UI. |
| P3 | FR-2: Completed Todos distinguished visually and exposed to assistive technology | Capability map → DESIGN/EXPERIENCE | landed | Owned by UX. Nothing architectural. |
| P4 | FR-3: Loading (300 ms delay), Empty, and Error with Retry. Never show an empty list on failure | AD-6 (list fetched only on load and by "Try again", 10 s abort) | weak | The spine doesn't set `retry` for the list query. TanStack Query's default is 3 retries with exponential backoff, so a dead API reaches Load error after about 30 s or more, not 10 s (see G2). |
| P5 | FR-4: optimistic create within 100 ms, input clears, focus kept | AD-4 (client UUIDv7), AD-6 | landed | |
| P6 | FR-4: the Todo API assigns Created At and Updated At | AD-3 (server-owned, client values ignored) | landed | |
| P7 | FR-4 (implied): the optimistic row renders and orders correctly before the server confirms | AD-3 (DTO requires `createdAt`/`updatedAt`), AD-6 | weak | The optimistic `Todo` must satisfy a DTO with required timestamps the client may not set, and nothing says what placeholder to use. Nothing says whether the client re-sorts after `setQueryData`. If it sorts by `createdAt` with a client placeholder, clock skew moves the row. If it doesn't, the order can differ from the order after reload. That can also happen with no skew: creates run in different scopes and may commit out of order. See G6. |
| P8 | FR-5: client blocks empty input, 500 cap via `maxlength`, counter from 450 | AD-1 (`DESCRIPTION_MAX`, `COUNTER_THRESHOLD`), AD-3 (UTF-16 units = `maxlength`) | landed | |
| P9 | FR-5: the API independently rejects invalid Descriptions | AD-3 (trim, then 1–500), AD-5 `VALIDATION_ERROR` | landed | |
| P10 | FR-6: inline edit. Updated At changes, Created At and position don't | AD-3 (`updatedAt` on value change, order by `createdAt`) | landed | |
| P11 | FR-6: an empty or unchanged edit cancels and doesn't delete | AD-3 (no-op PATCH returns unchanged). The cancel happens client-side | landed | |
| P12 | FR-7: toggle within 100 ms, position kept, persists | AD-2 PATCH, AD-3 ordering, AD-6 | landed | |
| P13 | FR-8: delete instantly with no confirmation, persists | AD-2 DELETE, AD-4 (404 = success), AD-6 | landed | |
| P14 | FR-9: Todos survive refresh, reopen, another device, API restart, and stack restart | AD-7 (PostgreSQL, migrations), AD-10 (`todos-data` volume), AD-6 (no browser store) | landed | A host reboot is covered separately in P38 (restart policy). |
| P15 | FR-9: the browser isn't the store | AD-6 (the only client state is the in-memory query cache) | landed | It would be stronger to also forbid a TanStack persister explicitly. |
| P16 | FR-10: roll back on a network error, a 10 s timeout, or a server error | AD-5 (client-side `NETWORK` kind), AD-6 (`AbortSignal.timeout(10_000)`) | weak | TanStack Query's default `networkMode: 'online'` **pauses** mutations while `navigator.onLine === false`. They don't fail, so the 10 s timeout, the rollback, and the toast never happen, and the optimistic change stays on screen indefinitely. That breaks FR-10 and SM-C2. The spine doesn't set `networkMode: 'always'` (see G2). |
| P17 | FR-10: a failed create restores the text. A failed edit stays in edit mode with the attempted text | AD-6 (mutation variables are available in `onError`) and EXPERIENCE | landed | |
| P18 | FR-10: a non-blocking message, and the other Todos stay usable | Stack (Sonner). AD-6 per-Todo scope | landed | |
| P19 | FR-10: API validation errors are shown as readable text, never raw codes | AD-5 (code + action → copy, `message` never rendered) | weak | EXPERIENCE needs a *specific* "too long" message for one validation error. AD-5 has one undifferentiated `VALIDATION_ERROR`, and the web is barred from reading `message`, so it can't tell "too long" from "empty" or "bad id" (see G3). |
| P20 | FR-10: pending changes to one Todo apply in order. On failure, restore the last confirmed state and apply no later change on top | AD-6 steps 1–4 | weak | (a) TanStack Query v5 has no API to cancel a queued (scope-waiting) mutation. Its `onMutate` has already run, and it will still fire once the scope frees up. "Cancels any still-queued mutations" needs a concrete mechanism. (b) The spine doesn't say where the "last confirmed state" is recorded, and a separate map of confirmed Todos contradicts AD-6's own "no other store holds Todo data". (c) If the dropped mutations call `onError`, they each restore state and show their own toast (see G1). |
| P21 | FR-11: consistent response shapes, and errors with a machine code and a human message | AD-1, AD-2, AD-5 | landed | |
| P22 | FR-11: operations on a nonexistent Todo return not-found, never create or fail silently | AD-4 (PATCH/DELETE → 404) | landed | An idempotent POST replay is creation by a client-supplied id, which is consistent with this. |
| P23 | FR-11: invalid input returns a validation error and writes nothing | AD-1 (Zod at the edge), AD-5, AD-7 | weak | Framework-level rejections are left undefined. Malformed JSON (400), a wrong content type (415), a body over the limit (413), an unknown route (404), and a response that fails serialization all bypass Zod. By default Fastify returns its own `{statusCode,error,message}` shape, and the closed `ErrorCode` enum has no mapping for 413 or 415. That contradicts "every non-2xx response has the envelope" (see G3). |
| P24 | FR-11: each operation takes full effect or none | AD-7 (one statement or transaction) | landed | |
| P25 | FR-11: **the Todo API is documented in the repository** (endpoints, fields, error codes), realizing UJ-4 and SM-5 | none | **missing** | The spine doesn't say where the docs live or how they're kept in sync with `packages/shared`. They'll drift from the Zod contract (see G5). |
| P26 | FR-12: responsive from 320 to 1920 px, 44 px targets, long strings wrap | Capability map → DESIGN/EXPERIENCE | landed | Owned by UX. |

### 1.2 PRD: non-functional requirements and scope

| # | Input item | Spine location | Status | Note |
|---|---|---|---|---|
| P27 | NFR-1: UI reflects actions within 100 ms | AD-6 (optimistic `onMutate`) | landed | |
| P28 | NFR-1: interactive within 2 s with 1,000 Todos | AD-2 (unpaginated list), Deferred (no pagination or virtualization) | landed | At 1,000 rows, each `setQueryData` replaces the array, so rows should be memoized by `id` so that one toggle doesn't re-render all 1,000. This is a web-internal matter, not a cross-unit one. |
| P29 | NFR-2: p95 ≤ 300 ms, measured at the server | AD-11 (`responseTime` per request) | landed | |
| P30 | NFR-3: no acknowledged change is lost, and a restart corrupts nothing | AD-7 (PostgreSQL, single statement or transaction, ack after commit) | landed | |
| P31 | NFR-3: concurrent edits from two tabs resolve last-write-wins | none explicit. It's implied because there are no version or ETag checks | weak | Nothing states that PATCH is unconditional and per-field. A builder could add `updatedAt` precondition checks, or a PATCH that writes every column. Say that PATCH writes only the fields present, with no concurrency check, and that this is LWW. |
| P32 | NFR-4: WCAG 2.1 AA | Not bound. Owned by EXPERIENCE/DESIGN | landed | Correctly left out of the spine. |
| P33 | NFR-5: the latest two versions of the major browsers, plus iOS Safari and Android Chrome | AD-4 (UUIDv7 via `uuid`, which works in a non-secure context), AD-9 | landed | |
| P34 | NFR-6: README gets a new developer running in 15 min. Tests cover every FR at the API level plus the core UI flows | Conventions: Testing, Scripts. Seed: README | weak | API tests use a `todos_test` database on the compose `db`, but the spine doesn't say who creates it. The `postgres` image creates only `POSTGRES_DB`, and `/docker-entrypoint-initdb.d` scripts run only on an **empty** volume, so a developer with an existing `todos-data` volume gets no test database. |
| P35 | NFR-7: one documented command starts the whole stack for development and debugging | AD-10 (`compose.yaml` + `compose.dev.yaml`) | weak | `docker compose up` starts the production-like stack. Development with HMR and the inspector needs `-f compose.yaml -f compose.dev.yaml`. The addendum's single command (`docker compose up`) therefore gives you the non-debug stack. Same issue as A2. |
| P36 | NFR-7: configuration comes from the environment, not code edits | AD-10 (`DATABASE_URL`, `PORT`, `LOG_LEVEL`, `WEB_PORT`, `.env.example`) | landed | |
| P37 | NFR-7: data in a named volume that survives restarts and rebuilds, and the README says where it lives and how to upgrade without losing data | AD-10 (`todos-data`), AD-7 (migrations at startup), Seed: README | weak | (a) Compose prefixes volumes with the project name, which defaults to the checkout directory's name. A fresh clone into another folder, or a rename, silently gets a new, empty volume, which looks like data loss after an upgrade. `compose.yaml` needs a top-level `name:`. (b) There's no rule that v1 migrations are additive and non-destructive. AD-8 mentions this only for `owner_id`. |
| P38 | NFR-11: a failed or malformed request never stops the API from serving later requests | AD-5 (unhandled → `INTERNAL`), AD-7 | weak | Nothing covers (a) a compose `restart:` policy, so a crashed API stays down and a host reboot leaves the one-host deployment dead, (b) a `pg.Pool` `'error'` listener, since without one an idle-client error while the DB restarts crashes Node, or (c) SIGTERM handling or `init: true`, since Node as PID 1 ignores SIGTERM and every `compose down` waits 10 s and then kills the process. |
| P39 | NFR-11: exactly three parts, with no caches, queues, or third-party backends | AD-9 (nginx lives inside the `web` container), AD-10 (three services) | landed | DESIGN uses the system font stack and no CDN fonts, so there's no hidden external dependency. |
| P40 | NFR-8: owner, auth, and new fields can be added later without breaking changes or data-losing migrations | AD-2 (additive only, wrapped list), AD-8 (`RequestContext`, nullable `owner_id`) | landed | |
| P41 | NFR-9: log every request (time, operation, outcome, latency), and log unhandled errors with context. No bodies, only the Description's length | AD-11 | landed | |
| P42 | NFR-10: Descriptions are plain text, and HTML is shown literally | AD-11 (React text children only, no `dangerouslySetInnerHTML`) | landed | |
| P43 | NFR-12: title "Todos", favicon, no console errors in normal use, no layout jumps | Capability map → UX | landed | Nothing architectural. The favicon is a static asset in `apps/web`. |
| P44 | §6.2: no access control, an accepted risk. No TLS, backups, or CI/CD | Deferred | landed | |

### 1.3 Addendum

| # | Input item | Spine location | Status | Note |
|---|---|---|---|---|
| A1 | Docker: web, API, and store each in a container | AD-10, Structural Seed | landed | |
| A2 | Compose: **one command, `docker compose up`**, for local development and debugging | AD-10 | weak | As written, `docker compose up` gives the production-like stack, and debugging needs a two-file invocation (see G7). |
| A3 | A named volume survives `down`/`up` and rebuilds, and `down -v` deletes it | AD-10 (`todos-data`) | weak | The volume's real name depends on the Compose project name (see P37). |
| A4 | Hot reload and source mounts for web and API, plus an exposed API debugger port | AD-10 (`compose.dev.yaml`: Vite HMR, `tsx watch`, inspector on 9229) | weak | The spine doesn't say (a) that the inspector binds `0.0.0.0:9229` (Node's default of `127.0.0.1` is unreachable from the host through Docker) or that 9229 is published, (b) that the in-container Vite proxy target is `http://api:3000`, not `localhost`, or (c) which host port the dev web server uses, given the base rule that only `web` publishes `${WEB_PORT}`. The compose author and the README author can easily disagree on all three. |
| A5 | Manual deploy by running the same compose setup on one host, reachable from a phone | AD-9 (relative `/api`), AD-10 (`WEB_PORT`), AD-4 (works over plain HTTP) | landed | A restart policy is missing (see P38). |
| A6 | README warns that `docker compose down -v` deletes the data | Structural Seed (README: "`down -v` warning") | landed | It appears only as a comment in the tree. That's enough, since only the README uses it. |
| A7 | Out of scope: **a reverse proxy**, TLS, scaling, monitoring, secrets beyond env files | AD-9: "`web` (nginx) … reverse-proxies `/api/` to `api:3000`" | **contradicted** | On the surface, the spine introduces exactly what the addendum lists as out of scope. The intent is probably different: the addendum means an edge or TLS proxy, while AD-9's nginx is the frontend container's static server. But neither the spine nor the memlog reconciles the two, and a reviewer could reject AD-9 on that basis. |
| A8 | Secrets through env files only | AD-10 (`.env.example` committed, `.env` never) | landed | |

### 1.4 EXPERIENCE.md: behaviors with architectural impact

| # | Input item | Spine location | Status | Note |
|---|---|---|---|---|
| E1 | Optimistic updates: "instant" means within 100 ms | AD-6 (`onMutate`) | landed | |
| E2 | Per-Todo ordering: a pending change looks confirmed, later actions queue in order, and the ones after a failure are dropped | AD-6 (`scope: { id }`, "cancels still-queued") | weak | There's no cancel mechanism in TanStack v5 (see P20 and G1). |
| E3 | Rollback to the **last state the Todo API confirmed** | AD-6 step 3 ("records it as last confirmed state") | weak | The location and initial value aren't specified (list load for existing Todos, "absent" for a pending create), and this conflicts with the single-store rule (see G1). |
| E4 | 10 s timeout for mutations, and Load error if the initial fetch takes more than 10 s | AD-6 (`AbortSignal.timeout(10_000)`) | weak | Query retries (P4) and paused offline mutations (P16) both defeat the 10 s bound. |
| E5 | Map every API error to Voice and Tone copy, never show raw text | AD-5 | landed | |
| E6 | "That todo is too long…" for the too-long API validation error | AD-5 | weak | There's no discriminator in the envelope (see G3). |
| E7 | Failed-create **Retry resubmits** the failed change | AD-4 (idempotent POST by `id`) | weak | The spine doesn't require Retry to **reuse the original `id`**. If a timed-out create actually committed and the Retry mints a new id, the Todo is duplicated. With the original id it's a safe `200` replay. Related and unstated: a create that timed out but committed is rolled back in the UI yet appears on the next reload. That's acceptable, but should be recorded as known behavior. |
| E8 | Failed-edit Retry (another Todo is being edited) resubmits the PATCH | AD-6 (same hook, same scope) | landed | |
| E9 | PATCH after a delete (from another tab or device): the Todo is gone | AD-4 (PATCH 404 → remove from cache, show toggle or edit failure copy) | weak | For an **edit**, EXPERIENCE says a failed edit reopens the field with the attempted text so text is never lost. AD-4 removes the row, which discards the attempted text, and no copy says "this todo no longer exists". The focus rule ("focused element disappeared") applies but isn't referenced. Also, a toggle queued behind a *failed create* would reach the server as a PATCH, get a 404, and show a second toast, unless G1's drop mechanism exists. |
| E10 | DELETE of an already-deleted Todo | AD-4 (404 on DELETE = success) | landed | |
| E11 | API validation error is handled as a failure for that action | AD-5 | landed | |
| E12 | 1,000 Todos, rendered without virtualization or pagination | Deferred ("sizing bound 1,000 Todos") | landed | |
| E13 | Plain-text rendering, HTML and Markdown literal, no linkification | AD-11 | landed | |
| E14 | Relative times refresh every minute **without re-rendering the whole list** | none | missing | This is web-only, so it's low divergence risk. The spine should still name the mechanism: one shared minute ticker (e.g. `useSyncExternalStore`) that only `CreatedAt` subscribes to, never state held in the list component. |
| E15 | Pasted line breaks become spaces, and Descriptions are single-line | none on the server | weak | The client normalizes line breaks, but the API (AD-3) accepts `\n`, `\r`, and control characters from any other client (UJ-4 says future clients). Either the server normalizes (whitespace runs → space) or rejects them, and the rule belongs in the shared schema. |
| E16 | The list is fetched only on open and by "Try again" (no background refetch that flickers) | AD-6 (focus and reconnect refetch off, no invalidation) | landed | |
| E17 | One toast per failed action, and queued actions dropped after a failure | none | missing | Nothing says dropped mutations stay silent. A naive `onError` on each of them produces N toasts and N rollbacks (see G1). |
| E18 | Non-envelope error bodies: nginx returns an HTML 502/504 when `api` is down or restarting | AD-1 ("parse every response with the same schema"), AD-5 | weak | It's undefined what the client does when an error body fails `ErrorEnvelopeSchema` (an nginx HTML page), or when a 2xx body fails its schema. Map both to a fixed client kind (`NETWORK`, or `INTERNAL`) so the failure copy is used and the Zod error isn't thrown into a render. |
| E19 | Created At shown as "just now" for a new Todo | AD-3 (server timestamp) | weak | Folded into P7. Client and server clocks can differ, so relative time must clamp future times to "just now". |

### 1.5 DESIGN.md: architectural impact only

| # | Input item | Spine location | Status | Note |
|---|---|---|---|---|
| D1 | Sonner toasts with an optional "Retry" action, lucide icons | Stack (shadcn Radix variant with Sonner) | landed | |
| D2 | System font stack, no web fonts or CDN | no need | landed | No third-party runtime dependency, which is consistent with NFR-11. |
| D3 | Light and dark mode via `prefers-color-scheme`, static favicon | no need | landed | Build-time CSS only. |

### 1.6 Counts

| Status | Count |
|---|---|
| landed | 47 |
| weak | 23 |
| missing | 3 |
| contradicted | 1 |
| **Total** | **74** |

## 2. Gaps and fixes

Ordered by risk that separately built units diverge or that a requirement fails silently.

**G1. The per-Todo queue can't be built as AD-6 describes it** (P20, E2, E3, E9, E17).
TanStack v5 can't cancel a queued mutation, the storage for "last confirmed state" is unspecified, and dropped mutations would each roll back and toast.
**Fix (AD-6):** Replace steps 3–4 with the following. "`apps/web/src/api/todo-sync.ts` keeps a per-id record `{ confirmed: Todo | null, failedAt: number }`. This is sync metadata, not a second store: it is never rendered. `confirmed` is seeded from the list response and from each successful write, and is `null` for a pending create. Each `mutationFn` first checks whether its enqueue time is earlier than `failedAt`. If it is, it throws `DroppedError` without sending a request. `onError` of a `DroppedError` does nothing: no rollback and no toast. Only the first failure restores `confirmed` (removing the row if `null`) and shows one toast." Add a test: toggle, then toggle again, then fail the first. Expect one request, one toast, and the confirmed state shown.

**G2. Offline pauses mutations and retries delay the Load error, so the 10 s rule and rollback are defeated** (P4, P16, E4).
**Fix (AD-6):** Add: "The `QueryClient` defaults are `networkMode: 'always'` for queries and mutations, `retry: 0` for queries and mutations, and no persister. The only retry paths are the user's 'Try again' and 'Retry'."

**G3. The envelope can't produce the "too long" copy, and framework-level errors are outside it** (P19, P23, E6, E18).
**Fix (AD-5):** Add an optional `error.details: { field: string; reason: 'too_long' | 'empty' | 'invalid' }[]` (additive, a closed enum in `packages/shared`). The web shows the too-long copy iff some detail has `reason === 'too_long'`. Map Fastify's built-in errors in the one error handler: bad JSON, 413, and 415 → `VALIDATION_ERROR` (keeping the HTTP status). `setNotFoundHandler` → `NOT_FOUND`. The client treats any body that fails `ErrorEnvelopeSchema` (such as nginx HTML on 502/504), and any 2xx that fails its schema, as `NETWORK` or `INTERNAL` and never lets it throw during render.

**G4. Failed-create Retry isn't pinned to the same id, and PATCH 404 during an edit loses the text** (E7, E9).
**Fix (AD-4):** Add: "Retry of a failed create resubmits `POST` with the **original `id`** and Description. It never mints a new id. A `PATCH` 404 during an edit removes the row, and the toast quotes the attempted text (persistent, no Retry)." Send the wording of a "no longer exists" message back to UX as an open copy item, and record "a timed-out create may reappear on reload" as known v1 behavior.

**G5. API documentation isn't governed** (P25, FR-11, SM-5, UJ-4).
**Fix (new convention or an AD-2 addition):** "The API reference is generated from the `packages/shared` Zod schemas (e.g. `@fastify/swagger` + `@fastify/swagger-ui` via the zod type provider's JSON-schema transform, served at `/api/v1/docs` and exported to `docs/api.md` or `openapi.json` by a script). It is never hand-maintained." If you choose a hand-written doc instead, name the file and require it to be updated in the same change as the schemas.

**G6. Optimistic row timestamps and client list order aren't specified** (P7, E19).
**Fix (AD-3/AD-6):** Add: "The optimistic Todo uses the client's `new Date().toISOString()` for both timestamps, and they are replaced by the server values on confirm. The client prepends creates and replaces rows in place by `id`. It never re-sorts the cached array. Server order applies on the next load. Relative time clamps future timestamps to 'just now'."

**G7. The compose topology doesn't deliver the addendum's single command or a stable volume, and hides runtime robustness** (P35, P37, P38, A2, A3, A4).
**Fix (AD-10):**
- Set `name: todos` at the top of `compose.yaml`.
- Rename `compose.dev.yaml` to `compose.override.yaml`, so plain `docker compose up` is the dev and debug stack, as the addendum wants. The one-host deploy runs `docker compose -f compose.yaml up -d --build`. Alternatively, keep the names and make the README state exactly two commands.
- Give every service `restart: unless-stopped` and set `init: true` on `api`.
- In dev, run the inspector as `--inspect=0.0.0.0:9229`, published on `9229`. The Vite proxy target is `http://api:3000`, and Vite is published on `${WEB_PORT}`.
- Add to AD-7: the API registers a `pool.on('error')` logger, and closes Fastify and the pool on SIGTERM. v1 migrations are additive only: no `DROP` or `RENAME` of columns holding data.
- Add to the Testing convention: the test setup creates `todos_test` if it's missing (`CREATE DATABASE` from the test global setup), rather than relying on init scripts.

**G8. AD-9's nginx proxy contradicts the addendum's "reverse proxy out of scope"** (A7).
**Fix (AD-9 rationale line and memlog):** Add: "This nginx is the `web` container's static file server with a same-origin `/api` pass-through. It is not a separate edge or TLS reverse proxy, which stays out of scope per the addendum. There are still exactly three services (NFR-11)."

**G9. Smaller items:**
- **Server-side normalization of line breaks and control characters (E15).** Add to AD-3: "Before measuring length, the shared `DescriptionSchema` replaces runs of whitespace, including `\r\n` and `\t`, with a single space and strips control characters."
- **LWW stated explicitly (P31).** Add to AD-3: "PATCH writes only the fields present, with no version precondition. Concurrent writers resolve last-write-wins."
- **Minute ticker (E14).** Add to the Consistency Conventions: "Relative times come from one shared minute ticker that only the `CreatedAt` component subscribes to."
