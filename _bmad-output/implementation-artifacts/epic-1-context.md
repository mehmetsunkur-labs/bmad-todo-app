# Epic 1 Context: Open the app, see my list, and add todos that stick

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build Todos v1 end to end, from an empty repo to a working vertical slice. Opening the app shows the user's Todo List right away, in exactly one clear List State, and the user can add Todos. Each new Todo appears instantly, survives a reload, and is never silently lost when a save fails. The epic also lays the foundations every later story relies on: the pnpm monorepo, the shared Zod contract, the layered Fastify API over PostgreSQL, the dev Compose stack, the error envelope, logging, the client HTTP/cache/sync layer, and the branded page frame. Getting these right here is what keeps Epic 2 (edit, toggle, delete) and Epic 3 (production-like stack, docs, E2E) from needing rework.

## Stories

- Story 1.1: Running skeleton: the Todos page and a healthy API in the dev stack
- Story 1.2: See my Todo List in every List State
- Story 1.3: Create Todos through the API, safely and idempotently
- Story 1.4: Add a Todo instantly from the Add row, and never lose what I typed

## Requirements & Constraints

- **List on open:** no login, splash, or onboarding. All Todos show newest first, each with its Description and Created At time. Exactly one List State at a time: Loading (indicator only after 300 ms), Empty (invites the first add), Populated, or Error (message plus Try again, never shown as an empty list).
- **Add:** the new Todo appears at the top within 100 ms (optimistic). The input clears and keeps focus. The Todo persists across reload, and the server assigns timestamps.
- **Validation:** an empty or whitespace-only Description does nothing (no request, no toast). Input is capped at 500 characters, with a counter near the limit. The API independently rejects invalid input and writes nothing.
- **Failure handling (create):** on a network error, 10 s timeout, 5xx, or non-envelope response, the Todo rolls back, typed text is never lost, and exactly one non-blocking message appears.
- **Durability:** data lives only in PostgreSQL, never in browser storage, and survives API and stack restarts.
- **Responsive:** 320 to 1920 px with no horizontal scroll, touch targets of at least 44×44 px, and long or unbroken text wraps.
- **Performance:** the list is interactive within 2 s with up to 1,000 Todos. API p95 is 300 ms or less.
- **Safety:** Descriptions are plain text everywhere. HTML shows literally and URLs are not linkified.
- **System shape:** exactly three parts (web, API, PostgreSQL). A malformed request never stops the API from serving later ones.
- **Finish:** "Todos" in the header and tab title, a favicon, no console errors, no layout jumps.
- **Extensibility:** owners, auth, and new fields must be addable later without breaking endpoints or losing data.

## Technical Decisions

- **Workspace:** pnpm monorepo with `apps/web` (scaffold via `pnpm dlx shadcn@4.21.0 init -t vite -b radix`, then `shadcn add sonner`), `apps/api`, `packages/shared` (`@todos/shared`, `workspace:*`, TS source, imports only `zod`), and `e2e/`. The only import directions are web → shared and api → shared. Root scripts: `dev`, `build`, `test`, `test:e2e`, `lint`, `format`, `typecheck`, `db:generate`, `db:migrate`, `api:docs`. Use the pinned versions in the architecture Stack table (Node 24, TS 6.0, React 19.3, Vite 8.3, Tailwind 4.3, TanStack Query 5.103, Fastify 5.12, Zod 4.6, drizzle-orm 0.45 / drizzle-kit 0.31, pg 8.23, postgres:18-alpine, Vitest 5.0).
- **Shared contract:** every request, response, and error schema is a strict Zod schema in shared, along with `DESCRIPTION_MAX=500`, `COUNTER_THRESHOLD=450`, `REQUEST_TIMEOUT_MS=10000`, `compareTodos` (createdAt desc, then id desc), and the path constants. No hand-written duplicates.
- **Endpoints for this epic:** `GET /api/v1/todos` returns `{ todos: [...] }`. `POST /api/v1/todos` with `{ id, description }` returns 201 with the Todo. `GET /api/v1/health` returns 200 `{status:"ok"}` when `SELECT 1` succeeds, else 503 `UNAVAILABLE`. Routes are registered with the full `/api/v1` prefix. Changes are additive only.
- **Todo DTO:** `{ id, description, completed, createdAt, updatedAt }`. `id` is any UUID. Timestamps are ISO-8601 UTC with milliseconds, stored as `timestamptz(3)` and set by the DB clock. The service replaces line breaks with spaces and trims. The result must be 1–500 UTF-16 units.
- **Idempotent create:** the client generates UUIDv7 with the `uuid` package, never `crypto.randomUUID`. The insert uses `ON CONFLICT (id) DO NOTHING`. A replay with the same normalized Description returns 200. A different Description returns 409 `CONFLICT`. Retry resends the original id and payload.
- **Errors:** the envelope is `{ error: { code, message, details?: [{ field, reason }] } }`. Codes: `VALIDATION_ERROR` (400/413/415), `NOT_FOUND`, `CONFLICT`, `UNAVAILABLE`, `INTERNAL`. Reasons: `empty`, `too_long`, `invalid`, `unknown_field`. One `setErrorHandler` plus one `setNotFoundHandler` in `apps/api/src/errors.ts` cover malformed JSON, empty JSON body, `bodyLimit` 16 KiB, and 415. Code throws `AppError`. Each mapping has an API test. The client never renders `message`. A non-envelope body counts as `INTERNAL`, and a fetch failure or timeout counts as `NETWORK`.
- **API layering:** routes → services → repositories. Only repositories import Drizzle. One `todos` table (`apps/api/src/db/schema.ts`), with drizzle-kit migrations committed in `apps/api/drizzle/` and applied at startup before listening. One API replica. `ctx: RequestContext` (`{ requestId }`, from `context.ts`) is the first parameter of every service and repository function. The pg pool has an error listener. On SIGTERM, call `fastify.close()` then `pool.end()`.
- **Config:** the API reads only `DATABASE_URL`, `PORT` (default 3000), and `LOG_LEVEL` (default info), Zod-validated, and exits on invalid values. Commit `.env.example`, never `.env`.
- **Logging:** pino JSON on stdout, exactly one line per request with `reqId`, `method`, `route`, `statusCode`, and `responseTime`. Never log bodies. The only Todo fields allowed are `id` and `descriptionLength`.
- **Client state:** Todos live only in the TanStack Query cache under `['todos']`. Pinned defaults: `staleTime`/`gcTime` Infinity, `retry: false`, `networkMode: 'always'`, no refetch on focus, reconnect, or mount. "Try again" calls `resetQueries`. Never call `invalidateQueries`. `http.ts` is the only `fetch` caller. It uses relative paths and `AbortSignal.timeout(10s)`, sets content-type only when there's a body, doesn't parse 204, and validates responses against the schemas.
- **Sync protocol (`todo-sync.ts`):** three maps keyed by id: `confirmed`, `pending`, and `generation`. A successful list fetch seeds `confirmed`. Every write uses `createTodoMutation(kind)` with `scope: { id }`: `onMutate` applies the optimistic op, a changed generation throws `DroppedError` with no network call, and a real failure increments the generation, clears pending, re-renders from confirmed, and shows exactly one toast. Cache writes touch only one id, placed by `compareTodos`. An optimistic create uses client time as a provisional `createdAt`.
- **Delivery:** same origin only, CORS off. The Vite dev proxy forwards `/api` without rewriting the path. Dev stack: `docker compose up` loads `compose.override.yaml`. Project `name: todos`, services `web` (Vite HMR), `api` (`tsx watch`, `--inspect=0.0.0.0:9229`), and `db` (postgres:18-alpine, port 5432 published, init script creates `todos_test`). Named volume `todos-data` mounts at `/var/lib/postgresql`, and `PGDATA` is never overridden. `db` healthcheck is `pg_isready -h 127.0.0.1`, and `api` depends on db being healthy. Services use `restart: unless-stopped`, and `api`/`web` use `init: true`.
- **Conventions:** camelCase in JSON and TS, snake_case in the DB, kebab-case files, PascalCase components, `XxxSchema` / `Xxx` types.
- **Testing:** API tests use Vitest with `fastify.inject` against a real `todos_test` DB. Web tests use Vitest with Testing Library.

## UX & Interaction Patterns

- **Tokens:** a brand layer over the shadcn neutral theme. `primary`/`ring` are #2F6F6A (dark mode #5FB3AA on #0A0A0A), following `prefers-color-scheme` with no toggle. Type roles: `app-title` 24/600, `todo-description` 16/1.5, `meta` 12, `empty-title` 18/500. Spacing: content-max 576, gutters 16/24 (switching at 640), page top 24/64, header-gap 24, list-gap 16, counter-line 16, row-padding-y 12, touch-target 44. Flat design with no shadows or cards.
- **Frame:** one centered column, then `<header>` with a left-aligned `<h1>Todos</h1>`, then `<main>` containing the `<form>` and `<ul aria-label="Todos">`. The favicon is a white check on a rounded teal square. The focus ring is 2 px in the ring color with a 2 px offset.
- **Add row:** a full-width input (placeholder "Add a todo…", visually hidden label "New todo", 44 px) and a primary "Add" button. Enter or Add submits, and text is trimmed. Auto-focus only on `(hover: hover) and (pointer: fine)`. Disabled in the Loading and Load error states.
- **Counter:** "{n} / 500" from 450, destructive at 500, right-aligned in an always-reserved 16 px line. Announced politely when it first appears and at 500.
- **Row:** the full layout is the Completion checkbox, then the Description with Created At below it, then the Row actions (checkbox and actions arrive in Epic 2). Controls are top-aligned. Transparent with a bottom divider, no hover background, and the row itself isn't clickable. `overflow-wrap: anywhere`, never truncated.
- **Created At:** `<time datetime>` with relative text ("just now", "5m ago", "2h ago", "yesterday", "Sep 12"). A tooltip shows the full date and time. While the row has focus it reads "Created {full}". It refreshes every minute without re-rendering the whole list.
- **List States:** Loading shows nothing for 300 ms, then 4 `aria-hidden` skeleton rows with `aria-busy` on the list. Empty shows "Nothing here yet." / "Add your first todo above." Load error shows "Couldn't load your todos." / "Check your connection and try again." with a secondary "Try again" button and `role="alert"`.
- **Toasts (Sonner):** default style with a destructive CircleX icon and `role="status"`. Bottom-center below 640 px, bottom-right from 640 px. Plain toasts dismiss after 8 s, paused on hover or focus. Toasts with Retry persist. At most 3 visible, and Escape dismisses the newest.
- **Create failure:** if the input is empty, restore the text and show "Couldn't add that todo. Your text is back in the box." Move focus to the input only if focus was on `<body>` or the Add row. If the input is busy, leave it alone and show a persistent toast "Couldn't add “{first 40 chars}…”." with Retry. For `too_long`, show "That todo is too long. The limit is 500 characters." A pending Todo looks identical to a confirmed one.
- **Announcements and motion:** a polite live region says "Todo added". A new row appears at full opacity and its height expands over 150 ms (instant with reduced motion). Stays usable at 200% zoom and 320 px.

## Cross-Story Dependencies

- 1.1 is the foundation for everything: workspace, shared package, dev Compose, `errors.ts`, logging, config, and the page frame with tokens.
- 1.2 adds the first migration (`todos` table), the list route/service/repository, `http.ts`, `query-client.ts`, the seeding of `todo-sync` confirmed state, and the row component. 1.4 builds on all of these.
- 1.3 (POST API) must land before 1.4 (optimistic Add UI). 1.4 introduces `createTodoMutation` and the toast setup, which Epic 2 reuses for edit, toggle, and delete.
- Epic 2 adds the Completion checkbox and Row actions to the row built in 1.2. Epic 3 adds the nginx image, production `compose.yaml`, OpenAPI snapshot, README, and E2E durability checks on top of this epic's foundations.
