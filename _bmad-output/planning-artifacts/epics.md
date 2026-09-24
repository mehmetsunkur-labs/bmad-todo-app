---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/EXPERIENCE.md
  - _bmad-output/specs/spec-todo-app/SPEC.md
---

# Todos (Todo-App) - Epic Breakdown

## Overview

This document breaks Todos v1 into epics and stories. It draws on the PRD, the UX design contract (`DESIGN.md` and `EXPERIENCE.md`), the architecture spine, and the spec (CAP-1 to CAP-10). Terms follow the PRD Glossary (Todo, Description, Completion Status, Todo List, Optimistic Update, and List States).

## Requirements Inventory

### Functional Requirements

FR1: On opening the app URL, the user sees the Todo List immediately, with no login, splash screen, or onboarding. All Todos show, newest first (by Created At). Each Todo shows its Description, its Completion Status, and its Created At time.
FR2: Completed Todos differ visually from Active Todos in at least two properties, never color alone. Completion Status is exposed to assistive technology.
FR3: The Todo List view shows exactly one List State: Loading, Empty, Populated, or Error.
  - Loading: an indicator appears only if data takes more than 300 ms.
  - Empty: an invitation to add the first Todo, with a usable input.
  - Error: a message plus a Retry action. It never shows an empty list as if there were no data.
FR4: The user adds a Todo by entering a Description.
  - The new Active Todo appears at the top within 100 ms (Optimistic Update). The input clears and keeps focus.
  - The Todo API assigns Created At and Updated At.
  - The Todo is still there after a reload.
FR5: Descriptions are validated when creating a Todo.
  - An empty or whitespace-only Description can't be submitted. Nothing happens and no error toast appears.
  - Input longer than 500 characters is prevented, with a visible counter near the limit.
  - The Todo API independently rejects invalid Descriptions.
FR6: The user edits a Todo's Description inline, whether the Todo is Active or Completed.
  - Enter or blur saves, and Escape cancels.
  - The FR5 validation applies. Saving empty text cancels the edit and does not delete the Todo.
  - A save updates Updated At. Created At and the Todo's position don't change.
FR7: The user toggles Completion Status in both directions with one click or tap. The visual change appears within 100 ms (Optimistic Update). The Todo keeps its position, and the change persists after a reload.
FR8: The user deletes any Todo with a Delete control. The control is visible on touch devices, reachable by keyboard, and may be revealed by hover on desktop. Deletion is immediate, with no confirmation or undo, and the Todo is removed within 100 ms. It doesn't come back after a reload.
FR9: All changes are stored durably by the Todo API in a persistent store. They survive a refresh, a browser restart, a second device, an API restart, and a restart of the container stack. Browser storage is not the store.
FR10: When a change fails (network error, 10 s timeout, or server error):
  - The affected Todo returns to its last confirmed state.
  - A failed create restores the typed text, and a failed edit keeps the attempted text in edit mode.
  - A non-blocking message appears. Validation errors show human-readable text.
  - Several pending changes to the same Todo apply in order. After a failure, the Todo returns to its last confirmed state and later changes are not applied.
FR11: The Todo API provides create, read (list), update (Description and/or Completion Status), and delete, with consistent response and error shapes (a machine-readable code plus a human-readable message).
  - An unknown Todo returns "not found".
  - Invalid input returns a validation error, and nothing is written.
  - There are no partial writes.
  - The API is documented in the repository.
FR12: The layout works from 320 px to 1920 px wide with no horizontal scrolling. Touch targets are at least 44×44 px. Long Descriptions, including unbroken URLs, wrap without breaking the layout.

### NonFunctional Requirements

NFR1: User actions show in the UI within 100 ms. The initial list is interactive within 2 s on office broadband with up to 1,000 Todos.
NFR2: Under normal single-user load, Todo API p95 latency is 300 ms or less, measured at the server.
NFR3: No acknowledged change is ever lost. A restart never loses or corrupts Todos. Concurrent edits from several tabs resolve as last-write-wins, with no crashes or corrupted records.
NFR4: WCAG 2.1 AA: full keyboard operation, visible focus, accessible labels, and text contrast of at least 4.5:1.
NFR5: Supported browsers are the latest two versions of Chrome, Edge, Firefox, and desktop Safari, plus iOS Safari and Android Chrome.
NFR6: A new developer can run the app locally within 15 minutes using the README. Automated tests cover every FR's consequences at the API level, plus the core UI flows (add, edit, toggle, delete, and failure rollback).
NFR7: The whole application (frontend, Todo API, and store) is containerized and starts with one documented command through Compose for development and debugging. Configuration comes from environment settings. Data is kept in a named volume that survives restarts and rebuilds. The README explains how to run the stack on one host so other devices can reach it, and how to upgrade without losing data.
NFR8: Todo ownership, authentication, and new Todo fields can be added later without rewriting endpoints, breaking clients, or losing data.
NFR9: The Todo API logs every request with its timestamp, operation, outcome, and latency, and logs unhandled errors with enough context to diagnose them. Full request bodies are never logged.
NFR10: Descriptions are stored and rendered as plain text. HTML or script content shows literally and is never executed.
NFR11: The system has exactly three parts: the frontend, the Todo API, and the persistent store. There are no extra services. A failed or malformed request never stops the API from serving later requests.
NFR12: The product feels finished:
  - The name "Todos" appears in the page header and the browser tab title, and the app has a favicon.
  - All List States share one consistent visual design.
  - There is no placeholder text, no console errors, and no layout jumps.

### Additional Requirements

From `ARCHITECTURE-SPINE.md`. The AD IDs are binding.

**Starter and workspace (Epic 1, Story 1):**
- Starter: scaffold `apps/web` with `pnpm dlx shadcn@4.21.0 init -t vite -b radix` (Radix variant, then `shadcn add sonner`). It brings ESLint with typescript-eslint and Prettier.
- Create a pnpm workspace monorepo with `apps/web`, `apps/api`, `packages/shared` (consumed as TypeScript source, `workspace:*`), and `e2e/`.
- The root scripts are `dev`, `build`, `test`, `test:e2e`, `lint`, `format`, `typecheck`, `db:generate`, `db:migrate`, and `api:docs`.

**Stack pins:** Node 24 LTS, pnpm 12.6, TypeScript 6.0, React 19.3, Vite 8.3, Tailwind 4.3, TanStack Query 5.103, Fastify 5.12 with @fastify/type-provider-zod 1.0 and @fastify/swagger 9.9, Zod 4.6, drizzle-orm 0.45 and drizzle-kit 0.31, pg 8.23, tsx 4.23, uuid 14, postgres:18-alpine, nginx:1.30-alpine, Vitest 5.0, and Playwright 1.63.

**Import rules:** the only allowed dependency directions are web → shared and api → shared. `apps/web` and `apps/api` never import each other, and `packages/shared` imports only `zod`.

**Shared contract (AD-1):**
- Every request, response, and error schema is a strict Zod schema in `packages/shared`.
- Shared also holds the constants `DESCRIPTION_MAX=500`, `COUNTER_THRESHOLD=450`, and `REQUEST_TIMEOUT_MS=10000`, the comparator `compareTodos` (createdAt descending, then id descending), and the path constants.
- Hand-written duplicates of any of these are forbidden.

**REST surface (AD-2):**
- The endpoints are `GET/POST /api/v1/todos`, `PATCH/DELETE /api/v1/todos/:id`, and `GET /api/v1/health` (200 when `SELECT 1` succeeds, otherwise 503).
- The list response is `{ todos: [...] }`.
- PATCH sends only changed fields. An absent field means unchanged, and `null` is invalid.
- Changes within v1 are additive only.

**Todo DTO (AD-3):**
- A Todo is `{ id, description, completed, createdAt, updatedAt }`.
- `id` is any UUID.
- Timestamps are ISO-8601 UTC with milliseconds, stored as `timestamptz(3)` and set by the database clock.
- The server replaces line breaks with spaces, then trims. The result must be 1–500 UTF-16 code units long.
- Concurrent writes are last-write-wins. A PATCH that changes nothing returns the stored Todo.

**IDs and idempotency (AD-4):**
- The client generates UUIDv7 ids with the `uuid` package, never `crypto.randomUUID`.
- POST uses `ON CONFLICT DO NOTHING`. A repeat with the same Description returns 200, and a different Description returns 409.
- A 404 on DELETE counts as success on the client.
- A 404 on PATCH means the Todo was deleted elsewhere: set confirmed to `null`, remove the row, and show a toast.
- Retry reuses the original id and payload.

**Errors (AD-5):**
- The error envelope is `{ error: { code, message, details?: [{ field, reason }] } }`.
- The codes are `VALIDATION_ERROR` (400/413/415), `NOT_FOUND` (404), `CONFLICT` (409), `UNAVAILABLE` (503), and `INTERNAL` (500).
- One `setErrorHandler` plus one `setNotFoundHandler` in `apps/api/src/errors.ts` map malformed JSON, empty JSON bodies, `bodyLimit` 16 KiB, and 415 to that envelope.
- There is an API test for each mapping.
- The client never renders `message`. A body that isn't this envelope counts as `INTERNAL`, and a fetch failure or timeout counts as `NETWORK`.

**Client state (AD-6):**
- Todos live only in the TanStack Query cache under `['todos']`.
- The QueryClient defaults are pinned: `staleTime` and `gcTime` Infinity, `retry: false`, `networkMode: 'always'`, and no refetch on focus, reconnect, or mount.
- "Try again" calls `resetQueries`.
- There is no `invalidateQueries`.
- `http.ts` is the only `fetch` caller. It uses relative paths and `AbortSignal.timeout(10s)`, adds a content-type only when there's a body, doesn't parse 204 responses, and validates responses against the schemas.

**Sync protocol (AD-12):**
- `todo-sync.ts` holds three maps: `confirmed`, `pending`, and `generation`.
- A single `createTodoMutation(kind)` helper sets `scope: { id }` and applies optimistic updates in `onMutate`.
- If the generation has changed, the helper throws `DroppedError` with no network call.
- Every cache write touches only one id, and the row is positioned by `compareTodos`.
- A real failure increments the generation, clears pending, re-renders from the confirmed state, and shows exactly one toast.

**API layering and persistence (AD-7, AD-8):**
- Requests flow routes → services → repositories, and only repositories import Drizzle.
- There is one `todos` table. Migrations are committed under `apps/api/drizzle/` and applied at startup, before the server listens.
- Exactly one API replica runs.
- The pg pool has an error listener. On SIGTERM, the API calls `fastify.close()` and then `pool.end()`.
- `ctx: RequestContext` (`{ requestId }`) is the first parameter of every service and repository function.

**Same-origin delivery (AD-9):**
- The browser uses only relative `/api/v1` paths, and CORS is off.
- nginx serves the SPA with `try_files $uri /index.html` and proxies `location /api/` with `proxy_pass http://api:3000;`, keeping the prefix.
- The Vite dev proxy doesn't rewrite paths.

**Config and Compose (AD-10):**
- The API reads only `DATABASE_URL`, `PORT`, and `LOG_LEVEL`, validated with Zod. It fails fast on bad values.
- `compose.yaml` sets `name: todos`, defines `web`, `api`, and `db`, and mounts the named volume `todos-data` at `/var/lib/postgresql`. `PGDATA` is never overridden.
- Only `web` publishes a port, `${WEB_PORT:-8080}`.
- Services use `restart: unless-stopped` and `init: true`.
- Health checks: `db` runs `pg_isready -h 127.0.0.1`, `api` waits for `db` to be healthy, and `api` has a health check on `/api/v1/health`.
- `compose.override.yaml` (loaded by plain `docker compose up`) switches to development mode:
  - Vite with HMR
  - `tsx watch`
  - `--inspect=0.0.0.0:9229`
  - `db` published on port 5432
  - an init script that creates `todos_test`
- `.env.example` is committed and `.env` is not.
- A test checks that data survives `docker compose down` followed by `up`.

**Logging (AD-11):**
- Pino writes JSON to stdout, one line per request through a `logController` or `onResponse`, with `reqId`, `method`, `route`, `statusCode`, and `responseTime`.
- Bodies are never logged. The only Todo fields allowed in logs are `id` and `descriptionLength`.
- The web never uses `dangerouslySetInnerHTML`.

**API docs:** `@fastify/swagger` generates OpenAPI from the shared schemas and serves it at `/api/v1/openapi.json`. `pnpm api:docs` writes a committed snapshot to `docs/api/openapi.json`, and the README links to it.

**Testing:**
- API: Vitest with `fastify.inject` against a real `todos_test` database.
- Web: Vitest with Testing Library, including `todo-sync` race cases.
- End to end: Playwright against the Compose stack, covering add, edit, toggle, delete, rollback, and persistence across `down`/`up`.

**README:** covers running the app, deploying it on one host, where the data lives, the warning that `docker compose down -v` deletes all data, and a link to the API docs.

### UX Design Requirements

UX-DR1: Implement the design tokens as a brand layer over the shadcn neutral theme.
  - Colors: `primary` #2F6F6A with `primary-foreground` #FFFFFF, and `ring` #2F6F6A. Dark mode: #5FB3AA with #0A0A0A.
  - Dark values apply under `prefers-color-scheme: dark`. There is no in-app toggle.
  - Typography roles: `app-title` (24px/600), `todo-description` (16px/1.5), `meta` (12px), and `empty-title` (18px/500).
  - Spacing tokens: `content-max` 576px, gutters 16px (mobile) and 24px (desktop), page top 24px (mobile) and 64px (desktop), `header-gap` 24px, `list-gap` 16px, `counter-line` 16px, `row-padding-y` 12px, and `touch-target` 44px.
  - Radii are inherited from shadcn.
UX-DR2: Set up the page frame.
  - One centered column, capped at 576px, with gutters that switch at 640px.
  - A `<header>` whose `<h1>` "Todos" is left-aligned.
  - The browser tab title is "Todos".
  - The favicon is a white check mark on a rounded teal square, legible on both light and dark tabs.
  - The design is flat: no shadows or cards.
UX-DR3: The Add row.
  - A full-width input (placeholder "Add a todo…", with the visually hidden label "New todo") and a primary "Add" button, both 44px tall.
  - Enter or Add submits. Text is trimmed. Empty input does nothing. `maxlength` is 500.
  - After a submit, the input clears and keeps focus.
  - The input is auto-focused only when the device has `(hover: hover) and (pointer: fine)`.
  - It is disabled in the Loading and Load error states.
UX-DR4: The character counter.
  - It shows "{n} / 500" from 450 characters and turns destructive at 500.
  - Its line (16px) is always reserved, so the layout never jumps.
  - It sits right-aligned under its field.
  - It is announced politely when it first appears and when it reaches 500.
  - It is also used by the Inline edit field.
UX-DR5: The Todo row.
  - From left to right: the Completion checkbox, the Description with the Created At time below it, then the Row actions.
  - The controls are top-aligned to the first line of the Description.
  - The row is transparent, with a bottom divider and no hover background. The row itself isn't clickable.
  - Descriptions wrap in full (`overflow-wrap: anywhere`) and are never truncated.
  - Descriptions render as plain React text, and URLs aren't turned into links.
UX-DR6: The Completion checkbox.
  - A shadcn/Radix checkbox, 16px, inside a 44px hit area.
  - When checked, it is filled with the primary color.
  - Its accessible name is the Description, and it stays the same when toggled. The checked state carries the status.
  - Space toggles it.
UX-DR7: Completed Todo row styling: a checked box, line-through text, and `muted-foreground` text. The row keeps its position, and Completed Todos are never auto-sorted.
UX-DR8: The Row actions.
  - Edit (lucide Pencil) and Delete (lucide Trash2) are ghost buttons, 16px icons in 44px hit areas, in `muted-foreground`.
  - On hover or focus, Edit turns `foreground` and Delete turns `destructive`.
  - Accessible names: "Edit todo: {Description}" and "Delete todo: {Description}".
  - On `(hover: hover) and (pointer: fine)` devices, they are hidden (opacity 0, still in the tab order) until the row is hovered or has focus inside it. Otherwise they are always visible.
UX-DR9: The Inline edit field.
  - An auto-growing Textarea that opens from Edit, or from double-clicking the Description on hover and fine-pointer devices only.
  - It opens pre-filled with all the text selected.
  - Enter or blur saves. Escape cancels and returns focus to Edit.
  - New lines can't be entered, and pasted line breaks become spaces.
  - The same 500-character cap and counter apply.
  - Empty or unchanged text cancels the edit.
  - Only one edit can be open at a time; opening another commits the first.
  - While editing, the Created At time and the Row actions stay visible.
UX-DR10: The Created At time.
  - A `<time datetime>` element showing relative time: "just now", "5m ago", "2h ago", "yesterday", then a short date such as "Sep 12".
  - Hover shows a Tooltip with the full date and time.
  - While anything in the row has focus, it shows "Created {full date and time}".
  - It refreshes every minute without re-rendering the whole list.
UX-DR11: List States UI.
  - **Loading:** nothing for the first 300 ms, then 4 skeleton rows shaped like Todo rows (`aria-hidden`). The list has `aria-busy`, and the Add row is disabled.
  - **Empty:** "Nothing here yet." / "Add your first todo above.", with the Add row enabled.
  - **Load error:** "Couldn't load your todos." / "Check your connection and try again.", with a secondary "Try again" button and `role="alert"`. The Add row stays visible but disabled. "Try again" goes back to Loading.
UX-DR12: Toasts.
  - Sonner in its default (neutral) style with a destructive CircleX icon, using `role="status"`.
  - Placement is bottom-center below 640px and bottom-right from 640px up.
  - Plain failure toasts auto-dismiss after 8 s, and the timer pauses on hover or focus.
  - Toasts with a "Retry" action persist until the user acts on them.
  - At most 3 are visible, and Escape dismisses the newest one when no edit is open.
UX-DR13: Microcopy. Use the exact strings from the EXPERIENCE.md Voice and Tone table for:
  - failed add (text restored to the input, or input busy with Retry and a quoted 40-character excerpt);
  - failed toggle;
  - failed edit (reopened, or another edit open with Retry);
  - failed delete;
  - Description too long ("That todo is too long. The limit is 500 characters.").

  The API `message` is never shown.
UX-DR14: Row-level failure behavior.
  - **Failed create:** restore the text to the input if it's empty, or else show a persistent Retry toast. Focus moves only if it's on the body or the Add row.
  - **Failed toggle or delete:** return to the confirmed state and position. After a delete fails, focus goes back to the restored row's checkbox if the delete had moved it.
  - **Failed edit:** reopen edit mode with the attempted text if no other edit is open, or else show a persistent Retry toast.
  - A pending Todo looks exactly like a confirmed one.
UX-DR15: Keyboard and focus.
  - Tab order: input, Add, then for each row the checkbox, Edit, and Delete.
  - Escape priority: cancel the open edit first, then dismiss a toast.
  - Focus after a delete moves to the next row's checkbox, then the previous row's, then the input.
  - Focus is never lost to `<body>`, and background rollbacks don't move it except in the UX-DR14 cases.
  - The focus ring is 2px in the ring color, with a 2px offset.
UX-DR16: Screen reader support.
  - Landmarks: `<header>`, and a `<main>` containing a `<form>` and `<ul aria-label="Todos">`.
  - A polite live region announces "Todo added", "Marked as done", "Marked as not done", "Todo deleted", and "Todo updated".
  - The page stays usable at 200% zoom and 320px width.
UX-DR17: Motion.
  - Adding: the row appears at full opacity instantly, and its height expands over 150 ms.
  - Deleting: the row fades within 100 ms, then collapses over 150 ms.
  - The checkbox uses shadcn's default transition.
  - With `prefers-reduced-motion`, all transitions are instant.
  - There are no celebration animations, confirmation dialogs, or modals.

### FR Coverage Map

FR1: Epic 1 - Todo List shows on open, newest first
FR2: Epic 2 - Completed Todos are visually distinct and exposed to assistive tech
FR3: Epic 1 - Loading, Empty, Populated, and Error List States
FR4: Epic 1 - Add a Todo with an Optimistic Update, persisted
FR5: Epic 1 - Description validation (client and API)
FR6: Epic 2 - Inline edit of the Description
FR7: Epic 2 - Toggle Completion Status
FR8: Epic 2 - Delete a Todo immediately
FR9: Epic 1 - Durable server-side persistence (restart durability verified end-to-end in Epic 3)
FR10: Epic 1 (create failures) + Epic 2 (edit, toggle, delete, and queued-change failures) - roll back and notify
FR11: Epic 1 (list, create, health, error envelope) + Epic 2 (PATCH, DELETE) + Epic 3 (committed API documentation)
FR12: Epic 1 - Responsive layout from 320 px to 1920 px

## Epic List

### Epic 1: Open the app, see my list, and add todos that stick
Opening Todos shows the user's list in every List State, and the user can add Todos. Each one appears instantly, survives a reload, and is never silently lost when a save fails. This epic is built end to end: monorepo starter, shared contract, list and create API, PostgreSQL, the dev Compose stack, and the page frame.
**FRs covered:** FR1, FR3, FR4, FR5, FR9, FR10 (create), FR11 (list, create, health, errors), FR12
**Also delivers:** AD-1 to AD-12 foundations (starter, `todo-sync`, `http.ts`, QueryClient defaults, error envelope, migrations, dev Compose); UX-DR1–5, UX-DR10 (Created At, needed by FR1), UX-DR11–13, UX-DR15–16 as they apply to adding; UX-DR17 (add motion); NFR7 (dev stack), NFR9, NFR10, NFR11

### Epic 2: Manage my todos: edit, complete, and delete
The user can fix a Description inline, mark Todos as done and back again, and remove them. Every change is instant, applies in order per Todo, and rolls back cleanly with exactly one message when it fails.
**FRs covered:** FR2, FR6, FR7, FR8, FR10 (edit, toggle, delete, and queued changes), FR11 (PATCH, DELETE)
**Also delivers:** UX-DR6–9, UX-DR14, UX-DR15 (focus after delete), UX-DR17 (delete motion); `todo-sync` race-case tests; NFR3 (last-write-wins)

### Epic 3: Run it on the network and hand it over
The owner runs the production-like stack on one host and reaches it from a phone. A new developer is productive within 15 minutes from the README and the API docs. A Playwright suite proves durability and rollback.
**FRs covered:** FR9 (verified across `down`/`up`), FR11 (documented API)
**Also delivers:** nginx web image with the `/api` proxy (AD-9), `compose.yaml` for the production-like stack (AD-10), OpenAPI snapshot, README, end-to-end suite (NFR6), final accessibility and finish pass (NFR4, NFR12), NFR1/NFR2 checks

## Epic 1: Open the app, see my list, and add todos that stick

Opening Todos shows the user's list in every List State, and the user can add Todos. Each new Todo appears instantly, survives a reload, and is never silently lost when a save fails.

### Story 1.1: Running skeleton — the Todos page and a healthy API in the dev stack

As a developer building Todos,
I want the monorepo, the dev Compose stack, and an empty branded page running with a working health check,
So that every later story starts from one command, with the contract, styling, and API conventions already in place.

_Implements: NFR7 (dev stack), NFR9, NFR11, NFR12 (title, favicon), FR11 (health, error envelope), UX-DR1, UX-DR2, UX-DR15 (focus ring), AD-1, AD-5, AD-7, AD-9, AD-10, AD-11_

**Acceptance Criteria:**

**Given** a fresh clone with `.env` created from `.env.example`
**When** I run `docker compose up`
**Then** these three services start:
- `web`: the Vite dev server with HMR.
- `api`: runs under `tsx watch`, with the inspector on `0.0.0.0:9229`.
- `db`: `postgres:18-alpine`, with the named volume `todos-data` mounted at `/var/lib/postgresql` and port 5432 published.

**And** the Compose project is named `todos`, `api` waits for `db` to pass `pg_isready -h 127.0.0.1`, and the dev init script creates the `todos_test` database.

**Given** the workspace
**When** I look at the repository
**Then** it is a pnpm workspace with `apps/web` (scaffolded with `pnpm dlx shadcn@4.21.0 init -t vite -b radix`), `apps/api`, `packages/shared` (depends only on `zod` and is consumed as `workspace:*`), and `e2e/`.
**And** the root scripts `dev`, `build`, `test`, `lint`, `format`, `typecheck`, `db:generate`, and `db:migrate` all run successfully, with the stack versions matching the Stack table in the architecture spine.

**Given** the API is running
**When** I call `GET /api/v1/health`
**Then** it returns `200 {"status":"ok"}` when `SELECT 1` succeeds, and `503` with the error envelope and code `UNAVAILABLE` when the database is unreachable.
**And** an unknown route returns `404` with `{"error":{"code":"NOT_FOUND","message":…}}`, produced by the single error handler and not-found handler in `errors.ts`.
**And** each request is logged as exactly one JSON line with `reqId`, `method`, `route`, `statusCode`, and `responseTime`, and no request or response bodies.
**And** the API exits at startup if `DATABASE_URL`, `PORT`, or `LOG_LEVEL` fails its Zod validation.
**And** on SIGTERM, the API closes Fastify and then the pg pool.

**Given** I open the app in a browser
**When** the page loads
**Then** I see one centered column (576 px maximum; 16 px gutters below 640 px and 24 px from 640 px up) containing a `<header>` with a left-aligned `<h1>` reading "Todos", then an empty `<main>`.
**And** the browser tab title is "Todos", and the favicon is a white check mark on a rounded teal square.
**And** the UX-DR1 brand tokens are defined: the teal `primary` and `ring` colors, in light and dark versions that follow `prefers-color-scheme`, plus the four type roles and the spacing tokens.
**And** browser calls to `/api/v1/*` go through the Vite proxy with the path unchanged, and CORS is not enabled.
**And** every focusable element shows a 2 px focus ring in the `ring` color with a 2 px offset.
**And** the browser console shows no errors.

### Story 1.2: See my Todo List in every List State

As Dana,
I want to see my Todos the moment I open the app, with a clear loading, empty, or error state,
So that I always know what's on my list and never mistake a failed load for an empty list.

_Implements: FR1, FR3, FR9, FR11 (list), FR12, NFR8 (ctx), NFR10, UX-DR5, UX-DR10, UX-DR11, UX-DR16, AD-2, AD-3, AD-6, AD-7, AD-8_

**Acceptance Criteria:**

**Given** the `todos` table does not exist yet
**When** the API starts
**Then** it applies the first drizzle-kit migration (committed in `apps/api/drizzle/`) before the server starts listening.
**And** that migration creates `todos` with:
- `id`: uuid, primary key
- `description`: text
- `completed`: boolean, default false
- `created_at` and `updated_at`: `timestamptz(3)`, default `now()`

**Given** Todos exist in the database
**When** a client calls `GET /api/v1/todos`
**Then** it returns `200 {"todos":[…]}`, sorted by `compareTodos` (`createdAt` descending, then `id` descending), with timestamps as ISO-8601 UTC strings with millisecond precision.
**And** the Todo and list schemas live only in `packages/shared`, and both the route and the web client use them.
**And** the route calls a service, which calls a repository. The repository is the only code that imports Drizzle, and each call passes `ctx: RequestContext` as its first argument.

**Given** I open the app and the list takes longer than 300 ms
**When** it is loading
**Then** 4 skeleton rows shaped like Todo rows appear, marked `aria-hidden`, and the list has `aria-busy="true"`.
**And** if the data arrives within 300 ms, no skeleton ever shows.

**Given** there are no Todos
**When** the list loads
**Then** I see "Nothing here yet." and "Add your first todo above." in the Empty state styling.

**Given** the API is unreachable, returns an error, or doesn't respond within 10 s
**When** the list fails to load
**Then** I see "Couldn't load your todos." and "Check your connection and try again.", with a secondary "Try again" button and `role="alert"`. It never shows as an empty list.
**And** "Try again" calls `resetQueries(['todos'])` and returns to the Loading state.

**Given** Todos exist
**When** the list loads
**Then** each row shows its Description as plain text and its Created At time in the `meta` style.
**And** rows are transparent with a 1 px bottom divider, have no hover background, and are not clickable as a whole. Only their controls respond.
**And** the Description follows these rules:
- HTML is shown literally, not rendered.
- URLs are not turned into links.
- Long text, including unbroken strings, wraps, so there is no horizontal scrolling at any width from 320 px to 1920 px.

**And** the Created At time follows these rules:
- It is relative: "just now", "5m ago", "2h ago", "yesterday", then a short date such as "Sep 12".
- It refreshes every minute.
- On hover, a tooltip shows the full date and time.
- While the row has focus, it reads "Created {full date and time}".

**And** `http.ts` is the only code that calls `fetch`. It uses relative paths and `AbortSignal.timeout(10s)`, and validates every response against its schema.
**And** the QueryClient uses the pinned AD-6 defaults.
**And** the list is a `<ul aria-label="Todos">` inside `<main>`.

### Story 1.3: Create Todos through the API, safely and idempotently

As a developer building the Todos client,
I want a create endpoint that validates, normalizes, and tolerates retries,
So that the UI can add Todos optimistically and retry without creating duplicates or bad data.

_Implements: FR4 (API), FR5 (API), FR11 (create, errors), NFR9, NFR11, AD-3, AD-4, AD-5_

**Acceptance Criteria:**

**Given** a valid body `{ id: <uuid>, description }`
**When** I send `POST /api/v1/todos`
**Then** the API replaces any line breaks in the Description with spaces, trims it, stores the Todo with timestamps set by the database, and returns `201` with the Todo.

**Given** a Todo with that `id` already exists
**When** I POST the same `id` again
**Then** the API returns `200` with the stored Todo if the normalized Description matches, and `409 CONFLICT` if it differs.
**And** the insert uses `ON CONFLICT (id) DO NOTHING`, so concurrent duplicate requests can never create two rows.

**Given** an invalid body
**When** I POST it
**Then** the API returns `400 VALIDATION_ERROR` with `details` giving the reason, and writes nothing:

| Problem | `reason` |
|---|---|
| Empty or whitespace-only Description | `"empty"` |
| Over 500 UTF-16 units after normalization | `"too_long"` |
| Invalid `id` | `"invalid"` |
| Extra keys such as `createdAt` | `"unknown_field"` |

**And** all of these responses use the single error envelope:

| Request | Response |
|---|---|
| Malformed JSON | `400 VALIDATION_ERROR` |
| JSON content type with an empty body | `400 VALIDATION_ERROR` |
| Body over 16 KiB | `413 VALIDATION_ERROR` |
| Unsupported content type | `415 VALIDATION_ERROR` |

**Given** any request
**When** it is logged
**Then** the log line contains no Description text. At most, the `id` and `descriptionLength` appear.

**Given** the API test suite
**When** `pnpm test` runs against `todos_test`
**Then** every case above has a test, and so does every AD-5 error mapping introduced so far.

### Story 1.4: Add a Todo instantly from the Add row — and never lose what I typed

As Dana,
I want to type a todo, press Enter, and see it at the top right away,
So that capturing a task takes no effort, and a failed save never costs me my text.

_Implements: FR4, FR5, FR10 (create), UX-DR3, UX-DR4, UX-DR12, UX-DR13, UX-DR14 (create), UX-DR16, UX-DR17 (add), AD-4, AD-6, AD-12_

**Acceptance Criteria:**

**Given** the Todo List has loaded (Empty or Populated)
**When** I look above the list
**Then** I see the Add row: a full-width input (placeholder "Add a todo…", visually hidden label "New todo", 16 px text, 44 px tall) and a primary "Add" button. Both are disabled while Loading and in the Load error state.
**And** the input is auto-focused only on devices matching `(hover: hover) and (pointer: fine)`.

**Given** I type a Description and press Enter or click Add
**When** it is submitted
**Then** a new Todo appears at the top within 100 ms, with an id generated in the browser (a UUIDv7 from the `uuid` package).
**And** the input clears and keeps focus, and a polite live region announces "Todo added".
**And** the row appears at full opacity immediately while its height expands over 150 ms. With `prefers-reduced-motion`, this happens instantly.
**And** after a reload, the Todo is still there, with its server-assigned timestamps.

**Given** the input is empty or contains only whitespace
**When** I press Enter
**Then** nothing happens: no request is sent, no toast appears, and focus stays in the input.

**Given** I have typed 450 or more characters
**When** I keep typing
**Then** a "{n} / 500" counter appears right-aligned under the input.
**And** it sits in a 16 px line that is always reserved, so the list never moves.
**And** it turns destructive at 500, and input stops at 500 (`maxlength`).
**And** screen readers announce it politely when it first appears and again when it reaches 500.

**Given** the create fails (network error, 10 s timeout, 5xx, or a response that isn't the error envelope)
**When** the input is still empty
**Then** the row is removed and the text is restored to the input.
**And** focus moves to the input only if it was on `<body>` or the Add row.
**And** one toast says "Couldn't add that todo. Your text is back in the box."

**Given** the create fails
**When** I have already typed something new
**Then** my new text is left untouched.
**And** a persistent toast says "Couldn't add “{first 40 characters}…”." with a **Retry** action, which resends the original `id` and Description.

**Given** the API returns `VALIDATION_ERROR` with `reason: "too_long"`
**When** the create fails
**Then** the toast says "That todo is too long. The limit is 500 characters." The API's `message` is never shown.

**Given** the create path is implemented
**When** I review the code
**Then** it uses `todo-sync.ts` (the `confirmed`, `pending`, and `generation` maps) and the shared `createTodoMutation('create')` helper with `scope: { id }`.
**And** cache writes touch only that `id`, placed by `compareTodos`, and nothing calls `invalidateQueries`.
**And** toasts use shadcn Sonner with these settings:
- Default style, with a destructive `CircleX` icon and `role="status"`.
- Position: bottom-center below 640 px, bottom-right from 640 px up.
- Plain toasts auto-dismiss after 8 s, and the timer pauses on hover or focus.
- Toasts with Retry stay until the user acts on them.
- At most 3 are visible, and Escape dismisses the newest.

**And** Vitest and Testing Library tests cover:
- a successful add;
- an empty input;
- the counter threshold;
- failure with an empty input;
- failure with a busy input, where Retry reuses the same `id`;
- the "too long" copy.

## Epic 2: Manage my todos: edit, complete, and delete

The user can fix a Description inline, mark a Todo as done and back again, and remove Todos. Every change shows instantly, changes to the same Todo apply in order, and a failed change rolls back cleanly with exactly one message.

### Story 2.1: Update and delete Todos through the API

As a developer building the Todos client,
I want PATCH and DELETE endpoints with precise, predictable semantics,
So that toggle, edit, and delete in the UI can rely on a consistent contract.

_Implements: FR6, FR7, FR8 (API), FR11 (PATCH, DELETE), NFR3, AD-2, AD-3, AD-4_

**Acceptance Criteria:**

**Given** an existing Todo
**When** I send `PATCH /api/v1/todos/:id` with `{ completed }`, `{ description }`, or both
**Then** only the fields sent are changed, and the response is `200` with the updated Todo.
**And** a new Description is normalized as in Story 1.3 and validated to be 1–500 characters.
**And** `updated_at = now()` is set only when a value actually changes. A PATCH that changes nothing returns the stored Todo unchanged, and `createdAt` never changes.

**Given** a PATCH body that is `{}`, contains `null` values, or includes unknown keys
**When** I send it
**Then** the response is `400 VALIDATION_ERROR` with `details`, and nothing is written.

**Given** an id that doesn't exist
**When** I PATCH or DELETE it
**Then** the response is `404 NOT_FOUND` in the error envelope.

**Given** an existing Todo
**When** I send `DELETE /api/v1/todos/:id`
**Then** the response is `204` with no body, and the Todo no longer appears in `GET /api/v1/todos`.

**Given** two PATCH requests to the same Todo from different tabs
**When** both succeed
**Then** the later write wins, and the row is never corrupted (NFR3).

**Given** the API test suite
**When** it runs
**Then** every case above is tested, and each write is a single statement.

### Story 2.2: Complete and un-complete a Todo

As Dana,
I want to tick a Todo off, or untick it, with one click or tap,
So that I can see at a glance what's done and what's left.

_Implements: FR2, FR7, FR10 (toggle, queued), UX-DR6, UX-DR7, UX-DR14, AD-12_

**Acceptance Criteria:**

**Given** a Todo row
**When** I look at it
**Then** it starts with a shadcn/Radix Completion checkbox: 16 px, inside a 44 px hit area, aligned with the top of the Description's first line.
**And** the checkbox's accessible name is the Description, and the name stays the same when it is toggled.

**Given** an Active Todo
**When** I click, tap, or press Space on its checkbox
**Then** within 100 ms the checkbox is checked and filled with the primary color, and the Description gets a line-through and `muted-foreground` color.
**And** the Todo keeps its position, and the live region announces "Marked as done". Toggling back announces "Marked as not done".
**And** the state persists after a reload.

**Given** I toggle the same Todo twice quickly
**When** both requests go through
**Then** they are sent in order (`scope: { id }`), and the checkbox never flickers back to an intermediate state.

**Given** a toggle fails
**When** the failure arrives
**Then** the checkbox returns to the last state the server confirmed, and one toast says "Couldn't update that todo. Please try again."
**And** any queued toggles for that Todo are dropped without a network call (`DroppedError`), with no extra toast.
**And** focus doesn't move.

**Given** the server returns `404` for the PATCH
**When** the failure arrives
**Then** the Todo is removed from the list, its confirmed state becomes `null`, and the toggle-failure toast shows.

**Given** a Todo whose create is still pending
**When** I toggle it and the create then fails
**Then** the queued toggle is dropped, only the create failure is reported, and the row is removed. This case has a `todo-sync` race test.

### Story 2.3: Delete a Todo

As Dana,
I want to remove a Todo with one click,
So that I can keep my list tidy.

_Implements: FR8, FR10 (delete), UX-DR8, UX-DR15 (focus after delete), UX-DR17 (delete), AD-4, AD-12_

**Acceptance Criteria:**

**Given** a Todo row
**When** I look at its right-hand side
**Then** there is a Delete button: a ghost button with a lucide `Trash2` icon (16 px) in a 44 px hit area, colored `muted-foreground` and turning `destructive` on hover or focus.
**And** its accessible name is "Delete todo: {Description}".
**And** on devices matching `(hover: hover) and (pointer: fine)`, the row actions are hidden (opacity 0, still in the tab order) until the row is hovered or something in it has focus. On other devices they are always visible.

**Given** I click Delete
**When** the delete is applied
**Then** the row fades within 100 ms, then its height collapses over 150 ms (both instant with `prefers-reduced-motion`).
**And** there is no confirmation, and the live region announces "Todo deleted".
**And** focus moves to the next row's checkbox. If there is no next row, it moves to the previous row's checkbox, and if the list is now empty, to the Add input.
**And** after a reload, the Todo stays gone.

**Given** the server returns `404` for the DELETE
**When** the response arrives
**Then** it is treated as success.

**Given** a delete fails
**When** the failure arrives
**Then** the row reappears in its original position (by `compareTodos`), and one toast says "Couldn't delete that todo. Please try again."
**And** if the delete had moved focus, focus returns to the restored row's checkbox.
**And** operations queued for that Todo are dropped silently.

**Given** the last Todo is deleted
**When** the list becomes empty
**Then** the Empty state appears without a layout jump.

### Story 2.4: Edit a Todo's Description inline

As Dana,
I want to fix a typo in place,
So that my list stays accurate without deleting and re-adding Todos.

_Implements: FR6, FR10 (edit), UX-DR8, UX-DR9, UX-DR14, UX-DR15, AD-12_

**Acceptance Criteria:**

**Given** a Todo row
**When** I look at the row actions
**Then** there is an Edit button before Delete: a ghost button with a lucide `Pencil` icon that turns `foreground` on hover or focus, with the accessible name "Edit todo: {Description}".
**And** the tab order within a row is checkbox, then Edit, then Delete.

**Given** I click Edit, or double-click the Description on a `(hover: hover) and (pointer: fine)` device
**When** edit mode opens
**Then** an auto-growing Textarea replaces the Description in place, pre-filled and with all its text selected.
**And** the Created At time and the row actions stay visible.
**And** the "{n} / 500" counter works the same way as in the Add row.
**And** on touch devices, double-clicking doesn't open edit mode.

**Given** edit mode is open
**When** I press Enter or the field loses focus
**Then** the change is saved within 100 ms (Optimistic Update), the row keeps its position, and the live region announces "Todo updated".
**And** Enter never inserts a new line, and pasted line breaks become spaces.

**Given** edit mode is open
**When** I press Escape
**Then** the edit is canceled, the original Description is restored, and focus returns to that row's Edit button.
**And** Escape cancels the edit before it dismisses any toast.

**Given** I submit empty or unchanged text
**When** I save
**Then** the edit is canceled with no request, and the Todo is not deleted.

**Given** one Todo is in edit mode
**When** I open edit mode on another Todo
**Then** the first edit is committed, just as when its field loses focus.

**Given** an edit fails and no other edit is open
**When** the failure arrives
**Then** the row reopens edit mode with the text I tried to save, and one toast says "Couldn't save your edit. Please try again."
**And** the field takes focus only if focus was on `<body>` or on that row.

**Given** an edit fails while another Todo is being edited
**When** the failure arrives
**Then** the row shows the Description the server last confirmed.
**And** a persistent toast says "Couldn't save your edit to “{first 40 characters}…”." with **Retry**, which resends the original PATCH.

**Given** the server returns `404`, or `VALIDATION_ERROR` with reason `too_long`
**When** the failure arrives
**Then** a `404` removes the Todo and shows the "another edit is open" toast with the quoted text.
**And** `too_long` shows "That todo is too long. The limit is 500 characters."

**Given** a delete is issued while an edit on the same Todo is pending
**When** the requests run
**Then** they run in order, a failure drops the operations queued after it, and exactly one toast appears. This case has a `todo-sync` race test.

## Epic 3: Run it on the network and hand it over

The owner runs the production-like stack on one host and reaches it from a phone. A new developer is productive within 15 minutes using the README and the API docs. An end-to-end suite and a final quality pass prove durability, rollback, accessibility, and finish.

### Story 3.1: Run the production-like stack on one host and use it from my phone

As the product owner deploying Todos,
I want one command that runs the built app behind nginx on a single host,
So that I can use Todos from my laptop and my phone over the network.

_Implements: FR9 (verified), NFR7 (production-like stack), NFR11, AD-9, AD-10_

**Acceptance Criteria:**

**Given** the repository on a host with Docker
**When** I run `docker compose -f compose.yaml up -d`
**Then** three services start:
- `web`: the Vite production build, served by `nginx:1.30-alpine`
- `api`: a production build on Node 24 that applies pending migrations before it starts listening
- `db`: `postgres:18-alpine`, with the volume `todos-data` mounted at `/var/lib/postgresql` and `PGDATA` not overridden

**And** only `web` publishes a host port (`${WEB_PORT:-8080}`); `db` and `api` publish none.
**And** every service has `restart: unless-stopped`, and `api` and `web` have `init: true`.
**And** `api` has a healthcheck on `/api/v1/health` and depends on `db` being healthy.

**Given** the nginx configuration
**When** I request a path that is not a file, such as `/some/route`
**Then** nginx serves `index.html` (`try_files $uri /index.html`).
**And** `/api/v1/*` is proxied to `api:3000` with the path unchanged (`proxy_pass http://api:3000;`), and no CORS headers are added.

**Given** the stack is running
**When** I open `http://<host-ip>:8080` from a phone on the same network
**Then** Todos loads, and I can add, toggle, edit, and delete Todos over plain HTTP. Ids are generated with the `uuid` package, so no secure context is needed.

**Given** Todos exist
**When** I run `docker compose -f compose.yaml down` and then `up -d`
**Then** every Todo is still there (FR9).

**Given** the dev override file
**When** I run plain `docker compose up`
**Then** I still get the dev stack from Story 1.1. The two modes don't conflict.

### Story 3.2: Documented API and a README that gets a new developer running in 15 minutes

As Sam, a developer joining the project,
I want generated API docs and a README that explains how to run, deploy, and understand Todos,
So that I can become productive without asking the original authors.

_Implements: FR11 (documented), NFR6, NFR7 (README), UJ-4, SM-5_

**Acceptance Criteria:**

**Given** the API is running
**When** I request `GET /api/v1/openapi.json`
**Then** I get an OpenAPI document generated by `@fastify/swagger` from the shared Zod schemas. It covers every endpoint, including request and response schemas and every AD-5 error code.

**Given** the repository
**When** I run `pnpm api:docs`
**Then** it writes `docs/api/openapi.json`.
**And** a test fails if the committed snapshot differs from what the current schemas generate.

**Given** the README
**When** I read it
**Then** it covers:
- prerequisites
- running the dev stack with `docker compose up`
- running the tests and the linter
- running the production-like stack on one host with `docker compose -f compose.yaml up -d`, and reaching it from other devices
- every setting in `.env.example`
- where the data lives (the `todos-data` volume)
- upgrading without losing data
- a prominent warning that `docker compose down -v` permanently deletes all Todos
- a link to `docs/api/openapi.json`
- a one-paragraph map of the repository: web → shared ← api, and the `todo-sync` protocol

**Given** a developer who did not build the app
**When** they follow only the README
**Then** they have the app running and can explain its data flow within 15 minutes (SM-5), checked once as a documented walkthrough.

### Story 3.3: End-to-end suite proving the core flows, rollback, and durability

As the product owner,
I want an automated end-to-end suite that runs against the real Compose stack,
So that every release proves the core actions work, failures roll back, and data survives restarts.

_Implements: FR1–FR10 (end-to-end), NFR3, NFR5, NFR6, UX-DR15, SM-2_

**Acceptance Criteria:**

**Given** Playwright 1.63 in `e2e/` and `pnpm test:e2e`
**When** the suite runs against the Compose stack
**Then** it covers, at desktop width (Chromium, Firefox, WebKit) and at a 360 px mobile viewport:
- add
- edit with Enter, Escape, and blur
- toggle in both directions
- delete, including where focus lands afterward
- the Empty state
- the Load error state, then Try again

**Given** API failures injected by Playwright route interception
**When** I add, toggle, edit, or delete
**Then** each Todo rolls back to its last confirmed state, and exactly one toast appears with the Voice and Tone copy.
**And** a failed add restores the typed text, and Retry resends the same `id`.

**Given** Todos created through the UI
**When** the suite restarts the stack (`docker compose down`, then `up`) and reloads the page
**Then** every Todo is still present, with the same timestamps.

**Given** a keyboard-only test
**When** it completes add, toggle, edit, and delete using only Tab, Enter, Space, and Escape
**Then** it succeeds, and focus is never lost to `<body>`.

**Given** the suite
**When** it runs
**Then** it fails if any test triggers a browser console error.

### Story 3.4: Finished-product, accessibility, and performance check

As the product owner,
I want to verify that Todos meets its accessibility, polish, and speed targets,
So that it feels like a finished product rather than a demo.

_Implements: NFR1, NFR2, NFR4, NFR12, FR12, UX-DR16 (zoom), SM-1 readiness_

**Acceptance Criteria:**

**Given** an automated accessibility scan with `@axe-core/playwright` (version verified at implementation)
**When** it runs on the Empty, Populated (including Completed Todos), Load error, and inline-edit states, in light and dark mode
**Then** it reports zero WCAG 2.1 AA violations.

**Given** the app at 320 px width and at 200% browser zoom
**When** I use every action
**Then** nothing scrolls horizontally, and every touch target is at least 44×44 px.

**Given** 1,000 seeded Todos
**When** I load the app on an office connection
**Then** the list is interactive within 2 s, and each action appears within 100 ms (NFR1).
**And** a simple scripted run of 200 mixed API requests against the local stack reports a p95 of 300 ms or less (NFR2).

**Given** a finish review against NFR12 and DESIGN.md
**When** I check every List State
**Then** the tab title and favicon are present and there is no placeholder text.
**And** adding, completing, or removing a Todo causes no layout jump.
**And** the visuals match `mockups/todo-list.html`. Where the mockup and the spine disagree, the spine wins.
**And** each gap found is either fixed in this story or logged as a follow-up with an owner.
