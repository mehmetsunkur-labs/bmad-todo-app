# Sprint Change Proposal: reconcile the planning docs with the as-built v1

- **Date:** 2026-09-26
- **Author:** Msunkur, with the Developer agent (`bmad-correct-course`, batch mode)
- **Status:** approved by Msunkur on 2026-09-26 (batch review). Routed to the Developer agent for direct application (minor scope).
- **Scope:** minor (documentation only)

## 1. Issue summary

The planning docs no longer describe what shipped. During Epics 2 and 3, the story review loops and owner decisions refined the design. Examples are the AD-9 nginx re-resolution, "document every reachable status", 44×44 targets beating the mockup, and anonymous dev `node_modules`. Each story recorded its change only in its own spec, and nobody updated the architecture spine, DESIGN.md, EXPERIENCE.md, the mockup or `epics.md`.

Three retro action items track this:
- **Epic 3 retro #5 (F8):** stale DESIGN.md, mockup and spine AD-2/AD-5/AD-10.
- **Epic 3 retro #6 (F9):** handoffs that were dropped and never logged.
- **Epic 2 retro #14 (F9.1–F9.7):** Epic 2's reconciliations, still unapplied.

Evidence: `_bmad-output/implementation-artifacts/epic-3-retro-2026-09-25.md` (F8, F9), `epic-2-retro-2026-09-25.md` (F9), and `docs/finish-review.md` (G-1 to G-14). Every proposal below was re-checked against the current code, with `file:line` evidence.

## 2. Impact analysis

- **Epics:** all three epics are `done`. Nothing is added, removed or resequenced, and no future epic is planned. A later v2 would start from these docs, which is why they need to be accurate.
- **Stories:** no story changes. `epics.md` gets wording fixes only (UX-DR8, the Story 2.3 and 2.4 acceptance criteria).
- **PRD:** no conflict. The requirements stand; only the design detail drifted.
- **Architecture:** `ARCHITECTURE-SPINE.md`, AD-2, AD-3, AD-5, AD-6 and AD-10 (9 edits).
- **UX:** `DESIGN.md` (8 edits), `EXPERIENCE.md` (4 edits, one optional), and a note in the mockup's legend.
- **Other:** `epic-2-context.md` (1 edit), plus 6 new `deferred-work.md` entries and a resolution note on the existing Vite dev-proxy entry.
- **Technical:** none. No code, infrastructure, deployment or CI change.

## 3. Recommended approach

**Direct adjustment:** apply the documentation edits below.
- **Effort:** low. **Risk:** low. **Timeline impact:** none.
- Rolling the code back isn't viable: the code is correct and the documents are stale.
- An MVP review isn't needed: the scope is unchanged.

## 4. Detailed change proposals

Each proposal has a target (`file:line`), the current text (OLD, verbatim), the replacement (NEW) and its evidence. `P/` = `_bmad-output/planning-artifacts/`, `IA/` = `_bmad-output/implementation-artifacts/`.

### Architecture: `P/architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md`

#### A-1. AD-2: the served OpenAPI route is missing from the "exactly these" endpoint table (found while verifying item A.8)

- **As built:** `apps/api/src/openapi.ts:109` registers `app.get(OPENAPI_PATH, { schema: { hide: true } }, …)`. `OPENAPI_PATH` is `/api/v1/openapi.json` (`packages/shared/src/paths.ts`). `docs/api/openapi.json:2` is `"openapi": "3.0.3"`.
- **Target:** ARCHITECTURE-SPINE.md:72 (insert after it)

OLD (:72):
```text
  | GET | `/api/v1/health` | — | `200` `{ "status": "ok" }` only when a `SELECT 1` against the DB succeeds; otherwise `503` with the AD-5 envelope |
```
NEW:
```text
  | GET | `/api/v1/health` | — | `200` `{ "status": "ok" }` only when a `SELECT 1` against the DB succeeds; otherwise `503` with the AD-5 envelope |
  | GET | `/api/v1/openapi.json` | — | `200` the OpenAPI 3.0 document generated from the shared schemas (Story 3.2); not listed in the document itself |
```
- **Rationale:** the table says "The endpoints are exactly these". Story 3.2 added a sixth route, and spec-3-2's review cited this "exact-paths row" when it declined to document HEAD (`IA/spec-3-2-…md:188`). Minor; drop it if the table is meant to list the Todo contract only.

#### A-2. AD-2: framework-level statuses and DELETE body parsing (item A.8)

- **As built:**
  - `apps/api/src/app.ts:37` sets `frameworkErrors: handleFrameworkError`. `apps/api/src/errors.ts:178-189` sends a 400 `VALIDATION_ERROR` for errors raised before routing, such as a malformed URL (`FST_ERR_BAD_URL`), on any route.
  - `apps/api/src/routes/todos.ts:83`: DELETE documents `errorResponses(400, 404, 413, 415, 500, 503)`. Fastify parses a DELETE body when one is sent. `app.ts:47` removes the `text/plain` parser, so any non-JSON body gets 415.
  - `apps/api/src/routes/health.ts:19` and `routes/todos.ts:26` document 400 on GET health and GET todos.
  - Spec: `IA/spec-3-2-…md:30`, "Error statuses per route (AD-5, amended 2026-09-25)".
- **Target:** ARCHITECTURE-SPINE.md:74

OLD (:74):
```text
  PATCH sends only the fields the user changed. A missing key means "unchanged", and `null` is a validation error. Changes within v1 are additive only: new response fields and new optional request fields are allowed, but renaming, removing, or retyping a field is not. Clients ignore unknown response fields. The list is always wrapped in an object, never returned as a bare array.
```
NEW:
```text
  PATCH sends only the fields the user changed. A missing key means "unchanged", and `null` is a validation error. Changes within v1 are additive only: new response fields and new optional request fields are allowed, but renaming, removing, or retyping a field is not. Clients ignore unknown response fields. The list is always wrapped in an object, never returned as a bare array.

  Besides the statuses above and the AD-5 errors for its own inputs, every route can return a framework `400` (for example a malformed URL), and every route with a body parser (POST, PATCH and DELETE) can return `413` and `415`. The client sends DELETE with no body, but a DELETE that carries one has it parsed. The OpenAPI document lists every status each route can actually return (Story 3.2, amended 2026-09-25).
```
- **Rationale:** Epic 3 retro F8, Spine bullet 1: AD-2 lacks 3.2's "document every reachable status" amendment.

#### A-3. AD-3: `updated_at` uses `GREATEST` (item B, Epic 2 F9.1)

- **As built:** `apps/api/src/repositories/todo-repository.ts:109`: `updatedAt: sql\`CASE WHEN ${anyChanged} THEN GREATEST(now(), ${todos.updatedAt}) ELSE ${todos.updatedAt} END\``. The reason is in the docstring at `:24-28`. Spec: `IA/spec-2-1-…md:99`.
- **Target:** ARCHITECTURE-SPINE.md:82

OLD (:82):
```text
  - **Time:** the database clock is the only clock. The columns are `timestamptz(3)`. `created_at` defaults to `now()`, and every UPDATE that changes a value sets `updated_at = now()`. The repository maps `Date` to an ISO string. Client-supplied timestamps are rejected by the strict schemas.
```
NEW:
```text
  - **Time:** the database clock is the only clock. The columns are `timestamptz(3)`. `created_at` defaults to `now()`, and every UPDATE that changes a value sets `updated_at = GREATEST(now(), updated_at)`. `now()` is the transaction start, so a racing PATCH that commits last never moves `updated_at` backwards. The repository maps `Date` to an ISO string. Client-supplied timestamps are rejected by the strict schemas.
```
- **Rationale:** Epic 2 retro F9.1.

#### A-4. AD-5: the error table's 400/413/415 rows (item A.8)

- **As built:** see A-2. For 400, `errors.ts:178-189` (`handleFrameworkError`). For 413/415, `errors.ts:162-173` maps Fastify's own 413/415 on any parsed body, DELETE included (`routes/todos.ts:83`).
- **Target:** ARCHITECTURE-SPINE.md:111-113

OLD (:111-113):
```text
  | `VALIDATION_ERROR` | 400 | Zod validation failures (with `details`), malformed JSON, a JSON content type with an empty body |
  | `VALIDATION_ERROR` | 413 | Body over `bodyLimit` (16 KiB) |
  | `VALIDATION_ERROR` | 415 | Unsupported content type |
```
NEW:
```text
  | `VALIDATION_ERROR` | 400 | Zod validation failures (with `details`), malformed JSON, a JSON content type with an empty body, and errors raised before routing, such as a malformed URL, on any route (Fastify `frameworkErrors`) |
  | `VALIDATION_ERROR` | 413 | Body over `bodyLimit` (16 KiB), on any route that parses a body, DELETE included |
  | `VALIDATION_ERROR` | 415 | Unsupported content type, on any route that parses a body, DELETE included |
```
- **Rationale:** Epic 3 retro F8, Spine bullet 1 (AD-5 :109-117).

#### A-5. AD-5: one handler "produces every error", plus the OpenAPI rule (item A.8)

- **As built:** besides `setErrorHandler`, errors come from `setNotFoundHandler` (already in the table) and the `frameworkErrors` hook (`app.ts:37`, `errors.ts:184`). All three send the envelope through the same `sendError`. The OpenAPI builder `errorResponses` is in `apps/api/src/openapi.ts:58-66`, with its descriptions at `:42-48`.
- **Target:** ARCHITECTURE-SPINE.md:119

OLD (:119):
```text
  One `setErrorHandler` in `apps/api/src/errors.ts` produces every error. Routes and services throw `AppError(code, details?)` and never write error bodies themselves. An API test covers each row of the table.
```
NEW:
```text
  One `setErrorHandler` in `apps/api/src/errors.ts` produces every error, and the not-found handler and the `frameworkErrors` hook send the same envelope. Routes and services throw `AppError(code, details?)` and never write error bodies themselves. An API test covers each row of the table. The OpenAPI document lists, per route, every status in this table that the route can actually return.
```
- **Rationale:** Epic 3 retro F8, Spine bullet 1 ("the OpenAPI doc documents every reachable status").

#### A-6. AD-5 client side: gateway non-JSON errors and the nginx body limit (item A.8)

- **As built:**
  - `apps/web/nginx.conf:32-36`: `client_max_body_size 32k;` in `location /api/`, with a comment tying it to twice `BODY_LIMIT_BYTES`.
  - `nginx.conf:42`: `proxy_connect_timeout 5s`.
  - `apps/api/src/openapi.ts:21-24`: "A gateway … may answer with a non-JSON body instead: 502 or 504 when the API is unreachable, and 413 for a body over the gateway's own limit (32 KiB)."
  - Spec: `IA/spec-epic-3-retro-fix-now.md:60`.
- **Target:** ARCHITECTURE-SPINE.md:123

OLD (:123):
```text
  - A response whose body isn't this envelope, such as an nginx HTML 502, is classified as `INTERNAL`.
```
NEW:
```text
  - A response whose body isn't this envelope is classified as `INTERNAL`. The `web` container's nginx sends such responses itself: HTML `502` or `504` when the API is unreachable, and HTML `413` for a body over its `client_max_body_size 32k`. That limit is twice `bodyLimit`, so a body just over 16 KiB still reaches the API and gets the JSON `413`. The OpenAPI description says so.
```
- **Rationale:** Epic 3 retro F7 (doc fix applied in the OpenAPI description and README by the retro fix-now) and F8, Spine bullet 1. The spine is the one place that still says nothing about it.

#### A-7. AD-6: display-only exiting-row copies (item B, Epic 2 F9.2)

- **As built:** `apps/web/src/features/todos/todo-list.tsx:36-42` (`ExitingRow { todo, from, done }`), `:152-154` ("The deleted row stays as an exiting copy until its exit motion ends"), `:175` (`useState<ExitingRows>`). Spec: `IA/spec-2-3-delete-a-todo.md:157` ("never sync state and never written to the cache").
- **Target:** ARCHITECTURE-SPINE.md:131

OLD (:131):
```text
  - **The cache:** the rendered Todo List exists only in the TanStack Query cache under `['todos']`. The only other Todo data the client keeps is the per-Todo sync bookkeeping in `todo-sync.ts` (AD-12). Components hold only UI state, such as input drafts and edit-mode text.
```
NEW:
```text
  - **The cache:** the rendered Todo List exists only in the TanStack Query cache under `['todos']`. The only other Todo data the client keeps is the per-Todo sync bookkeeping in `todo-sync.ts` (AD-12). Components hold only UI state, such as input drafts and edit-mode text, plus display-only copies of deleted rows that `TodoList` keeps only for their exit motion. These copies are never sync state and are never written to the cache.
```
- **Rationale:** Epic 2 retro F9.2 (first half).

#### A-8. AD-6: a call that expects no body resolves `null` (item B, Epic 2 F9.2)

- **As built:** `apps/web/src/api/http.ts:52-54` ("`null` when no body is expected: any 2xx (`204` included) then resolves `null` without parsing") and `:108-110`. `deleteTodo` passes `schema: null` (`:179-180`).
- **Target:** ARCHITECTURE-SPINE.md:140

OLD (:140):
```text
  - **The HTTP client:** `http.ts` is the only code that calls `fetch`. It always requests the relative path `/api/v1/...` and uses `AbortSignal.timeout(REQUEST_TIMEOUT_MS)`. It sets `Content-Type: application/json` only when there is a body, never parses a `204` and resolves it to `null` (a `204` where a body is expected is `INTERNAL`), validates responses against the shared schemas, and classifies failures as AD-5 describes.
```
NEW:
```text
  - **The HTTP client:** `http.ts` is the only code that calls `fetch`. It always requests the relative path `/api/v1/...` and uses `AbortSignal.timeout(REQUEST_TIMEOUT_MS)`. It sets `Content-Type: application/json` only when there is a body, and never parses a `204`. A call that expects no body (DELETE) resolves any `2xx` to `null` without parsing, and a `204` where a body is expected is `INTERNAL`. It validates responses against the shared schemas and classifies failures as AD-5 describes.
```
- **Rationale:** Epic 2 retro F9.2 (second half).

#### A-9. AD-10: image tags, dev `node_modules` refresh, one mode at a time (item A.9)

- **As built:**
  - Tags: `compose.yaml:30,57` (`todos-api:${TODOS_IMAGE_TAG:-prod}`, `todos-web:${TODOS_IMAGE_TAG:-prod}`) and `compose.override.yaml:11,32` (`…:${TODOS_IMAGE_TAG:-dev}`, `build: target: dev`). The comment is at `compose.yaml:6-8`.
  - Harness tags: `scripts/stack-smoke.test.mjs:21,61,775` (`smoke`, `smoke-dev`) and `e2e/scripts/run-e2e.mjs:16,113` (`e2e`). README:170.
  - Anonymous `node_modules` volumes: `compose.override.yaml:25-29,48-52`.
  - Refresh command: README:53-56 (`docker compose rm -fsv api web && docker compose up --build -V`).
  - `--build`: `compose.yaml:4`.
  - One mode at a time: `compose.yaml:9` (`name: todos`) and README:158-170.
- **Target:** ARCHITECTURE-SPINE.md:176, :180, :184 (three edits in the AD-10 rule)

OLD (:176):
```text
    - Only `web` publishes a host port, `${WEB_PORT:-8080}`.
```
NEW:
```text
    - Only `web` publishes a host port, `${WEB_PORT:-8080}`.
    - `api` and `web` build the images `todos-api:${TODOS_IMAGE_TAG:-prod}` and `todos-web:${TODOS_IMAGE_TAG:-prod}`. The override tags its builds `:dev`, so one mode never reuses the other's image. The test harnesses set `TODOS_IMAGE_TAG` (`smoke`, `smoke-dev`, `e2e`) and use their own Compose projects, so they never rebuild the owner's tags. Nobody else sets it.
```

OLD (:180):
```text
    - `web` runs the Vite dev server with HMR and source mounts.
```
NEW:
```text
    - `web` runs the Vite dev server with HMR and source mounts.
    - In `api` and `web`, the containers' `node_modules` are anonymous volumes over the source mount, filled from the image. After a dependency change, `docker compose rm -fsv api web && docker compose up --build -V` renews them. It never touches `db` or `todos-data`.
```

OLD (:184):
```text
  - **Running the production-like stack:** use `docker compose -f compose.yaml up -d`.
```
NEW:
```text
  - **Running the production-like stack:** use `docker compose -f compose.yaml up -d` (with `--build` after pulling or changing code).
  - **One mode at a time:** dev and the production-like stack are the same Compose project, `todos`. They share its containers, `WEB_PORT` and the `todos-data` volume. Starting one mode replaces the other's containers and keeps the data. `todos_test` exists only if the dev stack initialised the volume. Whether the production-like stack should get its own project and volume is an open decision (`deferred-work.md`).
```
- **Rationale:** Epic 3 retro F8, Spine bullet 2 (AD-10 lacks the `:prod`/`:dev` tags and the one-mode rule). F1 and F2 fix-now added the anonymous volumes, the refresh and `TODOS_IMAGE_TAG`. F9 (spec-3-1's deferred item: "3.2 answered it with a README rule, and AD-10 was never amended").
- **Side observation (not proposed):** AD-10 :182 says "dev never publishes on all interfaces". As built, dev `web` inherits `"${WEB_PORT:-8080}:8080"` from `compose.yaml:64`, and `compose.override.yaml:31-52` doesn't override `ports`, so the dev Vite server listens on all interfaces. Either the spine line or the override is wrong, and that needs an Architect call, not a wording fix.

---

### UX: `P/ux-designs/ux-Todo-App-2026-09-24/DESIGN.md`

#### D-1. Frontmatter typography comment: font (item A.2)

- **As built:** `apps/web/src/index.css:4` (`@import "@fontsource-variable/geist";`) and `:11` (`--font-sans: "Geist Variable", sans-serif;`). `apps/web/package.json:14`.
- **Target:** DESIGN.md:22

OLD (:22):
```text
  # Body, label and small text use shadcn's default sans stack.
```
NEW:
```text
  # Body, label and small text use shadcn's default sans stack: as built, Geist Variable
  # (@fontsource-variable/geist). The final font choice is open (deferred-work.md, G-12).
```
- **Rationale:** Epic 3 retro F8. Finish review G-12, logged in `IA/deferred-work.md:9-12` with owner Mehmet Sunkur plus UX. This records the as-built font without deciding G-12.

#### D-2. Typography section: font (item A.2)

- **As built:** same as D-1.
- **Target:** DESIGN.md:143

OLD (:143):
```text
Todos uses shadcn's default sans stack, with four named roles:
```
NEW:
```text
Todos uses shadcn's default sans stack (as built, Geist Variable, shadcn's current preset; the mockup renders the system UI stack, and which one is final is an open decision, G-12 in `deferred-work.md`), with four named roles:
```
- **Rationale:** as D-1.

#### D-3. Colors: Destructive on "hover or focus-visible" (item A.6, companion)

- **As built:** `apps/web/src/features/todos/todo-row.tsx:247` (`hover:text-destructive focus-visible:text-destructive`).
- **Target:** DESIGN.md:128

OLD (:128):
```text
- **Destructive**, also from shadcn, appears in only three places: the Delete button's icon on hover or focus, the character counter at 500 characters, and the toast's error icon.
```
NEW:
```text
- **Destructive**, also from shadcn, appears in only three places: the Delete button's icon on hover or `focus-visible`, the character counter at 500 characters, and the toast's error icon.
```
- **Rationale:** Epic 2 retro F9.6. This is the same rule as :183; changing only :183 would leave the doc disagreeing with itself.

#### D-4. Todo row: Created At on its own grid line (item A.3)

- **As built:** `todo-row.tsx:160` (`grid-cols-[auto_minmax(0,1fr)_auto]`) and `:208-214` (`<CreatedAt … className="col-span-2 col-start-2 row-start-2" />`, "Its own grid line under the Description and the Row actions").
- **Target:** DESIGN.md:180

OLD (:180):
```text
- **Todo row:** left to right, the Completion checkbox, then the Description (`todo-description`) with the Created At time (`meta`, `muted-foreground`) on the line below, then the Row actions. The row is transparent with a bottom divider and has no hover background.
```
NEW:
```text
- **Todo row:** left to right, the Completion checkbox, then the Description (`todo-description`), then the Row actions. The Created At time (`meta`, `muted-foreground`) sits on its own line below them, starting under the Description and spanning the Description and Row actions columns. That gives "Created {full date and time}" room to stay on one line down to 320px. The row is transparent with a bottom divider and has no hover background.
```
- **Rationale:** Epic 3 retro F8. Finish review G-9: at 320px the focus text wrapped and made the row 17px taller. Tab and reading order are unchanged.

#### D-5. Completion checkbox: column geometry (item A.5)

- **As built:**
  - `todo-row.tsx:169`: `-my-2.5 mr-4 -ml-3.5 … size-touch-target`, a 44px hit area pulled 14px left with a 16px right margin.
  - `:160`: `gap-x-1`, 4px. The Description starts at 44 − 14 + 16 + 4 = 50px.
  - `:176`: `after:-inset-[15px]`, a 44×44 extender.
  - `:220`: `-mr-3`, Row actions pulled 12px right.
  - `edit-field.tsx:127`: `-ml-[13px]`.
  - Skeleton matches at `list-states.tsx:28`.
- **Target:** DESIGN.md:181

OLD (:181):
```text
- **Completion checkbox:** shadcn `Checkbox` with a 16px visual size, centered in a `{spacing.touch-target}` hit area that overlaps the row padding. When checked, it is filled with `{colors.primary}` and shows a `{colors.primary-foreground}` check mark.
```
NEW:
```text
- **Completion checkbox:** shadcn `Checkbox` with a 16px visual size, centered in a `{spacing.touch-target}` hit area that overlaps the row padding. The hit area is pulled 14px left, so the box lines up with the Add row input's left edge. It has a 16px right margin, so the open Inline edit field (pulled left by its own padding) never covers it, and the Description starts 50px in. The Row actions are pulled 12px right, so the Delete icon ends near the column's edge. Where the mock places the Description closer (34px), the 44×44 hit area wins. When checked, it is filled with `{colors.primary}` and shows a `{colors.primary-foreground}` check mark.
```
- **Rationale:** Epic 3 retro F8. Finish review G-5 (the pulls) and G-14 (the 16px margin that keeps the 44×44 target while editing). G-5's status says the spine's 44×44 target wins over the mockup.

#### D-6. Row actions: "hover or focus-visible" (item A.6)

- **As built:** `todo-row.tsx:234` (`hover:text-foreground focus-visible:text-foreground`) and `:247` (`hover:text-destructive focus-visible:text-destructive`).
- **Target:** DESIGN.md:183

OLD (:183):
```text
- **Row actions (Edit button, Delete button):** ghost `Button`s with a `{spacing.touch-target}` hit area, showing lucide `Pencil` and `Trash2` icons at 16px in `muted-foreground`. On hover or focus, the Edit button turns `foreground` and the Delete button turns `destructive`.
```
NEW:
```text
- **Row actions (Edit button, Delete button):** ghost `Button`s with a `{spacing.touch-target}` hit area, showing lucide `Pencil` and `Trash2` icons at 16px in `muted-foreground`. On hover or `focus-visible`, the Edit button turns `foreground` and the Delete button turns `destructive`.
```
- **Rationale:** Epic 2 retro F9.6, still unapplied per Epic 3 retro F8. Spec-2-3:132 and :176 and spec-2-4:33 chose `focus-visible`.

#### D-7. Inline edit field: the counter line is always reserved (item A.1)

- **As built:** `edit-field.tsx:129` always renders `<CharacterCounter …/>` under the field. `character-counter.tsx:5,15` is "an always-reserved 16px line" (`h-counter-line`), with the text shown from `COUNTER_THRESHOLD` (`:17`).
- **Target:** DESIGN.md:184

OLD (:184):
```text
- **Inline edit field:** an auto-growing `Textarea` that replaces the Description text in place, in `todo-description` style, with its text starting at the same left edge as the Description. While editing, the Created At time and the Row actions stay visible. A character counter (same spec as in the Add row) appears under the field from 450 characters.
```
NEW:
```text
- **Inline edit field:** an auto-growing `Textarea` that replaces the Description text in place, in `todo-description` style, with its text starting at the same left edge as the Description. While editing, the Created At time and the Row actions stay visible. A character counter (same spec as in the Add row) sits under the field. Its line is always reserved while the field is open, and it is visible from 450 characters. With the field's own padding, this makes the row about 22px taller while editing. Whether to keep that shift is an open decision (G-13 in `deferred-work.md`).
```
- **Rationale:** Epic 3 retro F8. Finish review G-13, logged in `IA/deferred-work.md:13-16`. This records the as-built behavior and doesn't decide G-13.

#### D-8. Empty state: 14px body text (item A.4)

- **As built:** `apps/web/src/features/todos/list-states.tsx:60` (`<p className="text-sm text-muted-foreground">{body}</p>`). Load error uses the same block.
- **Target:** DESIGN.md:186

OLD (:186):
```text
- **Empty state:** a centered block in the list area. It has an `empty-title` headline and one line of body text in `muted-foreground`. No illustration `[ASSUMPTION: no illustration, to stay calm and minimal]`.
```
NEW:
```text
- **Empty state:** a centered block in the list area. It has an `empty-title` headline and one line of 14px body text (Tailwind `text-sm`) in `muted-foreground`. No illustration `[ASSUMPTION: no illustration, to stay calm and minimal]`.
```
- **Rationale:** Epic 3 retro F8. Finish review G-7: DESIGN set no size, so the mockup's 14px applied. Load error (:187) inherits it via "the same layout as the Empty state".

---

### UX: `P/ux-designs/ux-Todo-App-2026-09-24/EXPERIENCE.md`

#### E-1. Inline edit field: commit-on-switch, no save on window blur, Enter returns focus to Edit (item B, Epic 2 F9.3)

- **As built:**
  - Enter: `todo-row.tsx:143-146` (`if (how === "enter") editButtonRef.current?.focus()`). A blur save leaves focus where it went (`:58-59`).
  - Window blur: `edit-field.tsx:122-126` (`if (!document.hasFocus()) return`).
  - Switch: `todo-list.tsx:328-345` ("Commit the open edit as its blur would (it may not have focus)", `handleSaveEdit(open, draft.current)` before opening the next). Opening Edit on the row that is already open focuses its field (`:331-333`).
  - Spec: `IA/spec-2-4-…md:59,145,165`.
- **Target:** EXPERIENCE.md:82

OLD (:82):
```text
| Inline edit field | Opens from the Edit button (any device) or by double-clicking the Description (hover-capable pointer devices only). It opens pre-filled with the Description, all text selected, and grows to fit its content. **Enter** or blur saves. **Escape** cancels and restores the original text. New lines can't be entered: Enter always saves, and pasted line breaks become spaces. The Add row's 500-character cap and 450/500 character counter apply (FR-6 via FR-5). If the text is empty after trimming, or unchanged, the edit is canceled and nothing is saved or deleted. Only one Todo can be edited at a time; opening another saves the first (blur). |
```
NEW:
```text
| Inline edit field | Opens from the Edit button (any device) or by double-clicking the Description (hover-capable pointer devices only). It opens pre-filled with the Description, all text selected, and grows to fit its content. **Enter** or blur saves; after Enter, focus returns to that row's Edit button, and after a blur it stays where it went. Switching away from the browser window (for example alt-tab) is not a blur save: the field stays open. **Escape** cancels and restores the original text. New lines can't be entered: Enter always saves, and pasted line breaks become spaces. The Add row's 500-character cap and 450/500 character counter apply (FR-6 via FR-5). If the text is empty after trimming, or unchanged, the edit is canceled and nothing is saved or deleted. Only one Todo can be edited at a time; opening another first commits the open one (saved if changed, as its blur would), even if its field doesn't have focus. |
```
- **Rationale:** Epic 2 retro F9.3. The spec deliberately doesn't rely on blur event order (Epic 2 retro item 8, "Specs must not assume focus/blur event order").

#### E-2. Failed delete: restore focus only while the delete's focus move holds, or from free focus (item B, Epic 2 F9.5)

- **As built:** `apps/web/src/features/todos/delete-failure.ts:46-54` (`const focusStillMoved = !!moved && document.activeElement === moved; if (focusIsFree() || focusStillMoved) controller?.focusRow(id)`). `free-focus.ts:10-16` counts nothing, `<body>` or the `data-focus-free` list region as free. Spec: `IA/spec-2-3-delete-a-todo.md:159,183`.
- **Target:** EXPERIENCE.md:108

OLD (:108):
```text
| Failed delete | The row reappears in its original position. If focus had moved on because of the delete, it goes back to the restored row's Completion checkbox. A toast appears. |
```
NEW:
```text
| Failed delete | The row reappears in its original position. If focus is still where the delete moved it, or is on `<body>` or blank list space, it goes back to the restored row's Completion checkbox. If the user has since moved focus elsewhere (for example, into the Add row), it stays there. A toast appears. |
```
- **Rationale:** Epic 2 retro F9.5. "Blank list space" reflects the fix-now's free-focus rule (`IA/spec-epic-2-retro-fix-now.md:56`). Drop that clause to keep F9.5's `<body>`-only wording.

#### E-3. Failed edit, no other edit open: free focus includes the list region (found while verifying E-2; optional)

- **As built:** `apps/web/src/features/todos/edit-failure.ts:52-54,66` (`const focus = focusIsFree() || list.containsFocus(vars.id)`). `free-focus.ts:10-16`. Spec: `IA/spec-epic-2-retro-fix-now.md:56` ("Region counts as free focus … just as if focus were on `<body>`").
- **Target:** EXPERIENCE.md:109

OLD (:109):
```text
| Failed edit, no other edit open | The row reopens the Inline edit field with the attempted text. It takes focus only if focus is on `<body>` or on that row. A toast appears. |
```
NEW:
```text
| Failed edit, no other edit open | The row reopens the Inline edit field with the attempted text. It takes focus only if focus is on `<body>`, on blank list space, or on that row. A toast appears. |
```
- **Rationale:** not in either retro's list. It's the same as-built free-focus rule as E-2. Epic 2 retro item 2 ("Treat the list region as 'free' focus") changed the behavior but not this line.

#### E-4. Failed edit, another Todo is being edited: covers "this row reopened", and Retry announces (item B, Epic 2 F9.4)

- **As built:** `edit-failure.ts:55-58` ("Another edit open (or this row's own edit reopened), or a `404` … 'Retry', which resends the same PATCH and announces 'Todo updated'"). The branch condition is `list.openEditId() === null` at `:65` (any open edit, this row's included), and `announce("Todo updated")` is at `:79-80`. Spec: `IA/spec-2-4-…md:174`.
- **Target:** EXPERIENCE.md:110

OLD (:110):
```text
| Failed edit, another Todo is being edited | The row shows its confirmed Description. A persistent toast quotes the attempted text and offers "Retry". |
```
NEW:
```text
| Failed edit, another Todo is being edited | Also applies when the user has already reopened this row's own edit field, so the text being typed is never overwritten. The row shows its confirmed Description. A persistent toast quotes the attempted text and offers "Retry", which resends the same change and announces "Todo updated". |
```
- **Rationale:** Epic 2 retro F9.4.

---

### Mockup: `P/ux-designs/ux-Todo-App-2026-09-24/mockups/todo-list.html`

#### M-1. Add a visible "superseded" note to the legend (recommended), not a geometry rewrite (item A.7)

- **As built vs mock:**
  - Mock `.cb-hit` is `margin:-10px 0 -10px -14px` (`todo-list.html:88`) with `gap:4px` (`:87`), so the Description starts at 34px. As built it starts at 50px (`todo-row.tsx:160,169`).
  - The mock puts Created At inside `.body` (`:151` and so on). As built it's on its own grid line (`todo-row.tsx:211-214`).
  - The mock font is the system stack (`:20`). As built it's Geist (`index.css:11`).
  - The edit field is already bordered in the mock (`:103`, `.input.edit-input`, which matches G-6), and `.actions` already pulls 12px right (`:96`). So only the checkbox margin, the Created At line and the font differ.
- **Recommendation: add a note.**
  - The mock is "Illustration only" and "Spines win on conflict" (`:130`). The Human visual review (finish-review.md:156, 2026-09-26) passed against this mock as it stands.
  - Moving Created At to its own line means restructuring every row's markup across six panels. Changing only the CSS margin would still leave the mock disagreeing on Created At.
  - A one-line pointer to DESIGN.md is minimal, honest, and can't drift further.
- **Target:** todo-list.html:130-132 (the legend)

OLD (:130-132):
```html
  <strong>Todos: key-screen mock of the Todo List view.</strong> Illustration only. <strong>Spines win on conflict</strong>
  (DESIGN.md for look, EXPERIENCE.md for behavior and copy). Inherited tokens use the shadcn neutral defaults; the only brand color is Quiet Teal
  (#2F6F6A light, #5FB3AA dark), used for the checked checkbox, the Add button and the focus ring. Static, no JS.
```
NEW:
```html
  <strong>Todos: key-screen mock of the Todo List view.</strong> Illustration only. <strong>Spines win on conflict</strong>
  (DESIGN.md for look, EXPERIENCE.md for behavior and copy). Inherited tokens use the shadcn neutral defaults; the only brand color is Quiet Teal
  (#2F6F6A light, #5FB3AA dark), used for the checked checkbox, the Add button and the focus ring. Static, no JS.
  <br><strong>Superseded by DESIGN.md and the as-built app (finish review, 2026-09-25):</strong> the Description starts 50px in, not 34px
  (the checkbox's 44px hit area has a 16px right margin, G-5/G-14); Created At has its own line spanning the text and action columns (G-9);
  the app's font is Geist, not the system stack (G-12, open).
```
- **Alternative (not recommended), CSS only:** at :88 change `margin:-10px 0 -10px -14px` to `margin:-10px 16px -10px -14px`, and at :115 keep the skeleton as is. This fixes the 34px vs 50px difference but leaves the Created At placement and the font stale, so the note would still be needed.
- **Rationale:** Epic 3 retro F8 (mockup bullet). Finish review G-5, G-9, G-12 and G-14.

---

### Epics: `P/epics.md`

#### EP-1. UX-DR8: "hover or focus-visible" (item B, Epic 2 F9.6)

- **As built:** `todo-row.tsx:234,247`.
- **Target:** epics.md:212

OLD (:212):
```text
  - On hover or focus, Edit turns `foreground` and Delete turns `destructive`.
```
NEW:
```text
  - On hover or `focus-visible`, Edit turns `foreground` and Delete turns `destructive`.
```
- **Rationale:** Epic 2 retro F9.6.

#### EP-2. Story 2.3 AC: Delete colour on "hover or focus-visible" (item B, Epic 2 F9.6)

- **As built:** `todo-row.tsx:247`. Spec: `IA/spec-2-3-delete-a-todo.md:132,176`.
- **Target:** epics.md:631

OLD (:631):
```text
**Then** there is a Delete button: a ghost button with a lucide `Trash2` icon (16 px) in a 44 px hit area, colored `muted-foreground` and turning `destructive` on hover or focus.
```
NEW:
```text
**Then** there is a Delete button: a ghost button with a lucide `Trash2` icon (16 px) in a 44 px hit area, colored `muted-foreground` and turning `destructive` on hover or `focus-visible`.
```
- **Rationale:** Epic 2 retro F9.6.

#### EP-3. Story 2.4 AC: Edit colour on "hover or focus-visible" (item B, Epic 2 F9.6)

- **As built:** `todo-row.tsx:234`. Spec: `IA/spec-2-4-…md:33`.
- **Target:** epics.md:673

OLD (:673):
```text
**Then** there is an Edit button before Delete: a ghost button with a lucide `Pencil` icon that turns `foreground` on hover or focus, with the accessible name "Edit todo: {Description}".
```
NEW:
```text
**Then** there is an Edit button before Delete: a ghost button with a lucide `Pencil` icon that turns `foreground` on hover or `focus-visible`, with the accessible name "Edit todo: {Description}".
```
- **Rationale:** Epic 2 retro F9.6.
- **Not changed:** epics.md:214 and :632, the Row actions **visibility** rule ("until the row is hovered or has focus inside it"). As built it's `group-focus-within/row` (`todo-row.tsx:222`), which is correct as written.

---

### Epic context: `IA/epic-2-context.md`

#### EC-1. The per-story Playwright check became a manual real-browser check, superseded by Story 3.3 (item B, Epic 2 F9.7)

- **As built:**
  - Stories 2.2–2.4 each ran "Chromium via playwright-core, dev stack at :18080" by hand (`IA/spec-2-2-…md:153,200`, `IA/spec-2-3-…md:210`, `IA/spec-2-4-…md:229`).
  - Story 3.3's suite covers Epic 2's flows: `e2e/tests/core-flows.spec.ts:47` (Edit: Enter), `:72` (Escape), `:94` (blur), `:111` (Toggle) and `:142` (Delete focus), plus `rollback.spec.ts` and `keyboard.spec.ts`.
- **Target:** epic-2-context.md:24. The retro cites :23; the line is :24 in the current file.

OLD (:24):
```text
- **Testing:** API tests cover every PATCH/DELETE case. Web tests include `todo-sync` race cases: double toggle, toggle while a create is pending and the create fails, and delete during a pending edit. Every UI story also gets a Playwright check against the dev stack before merge.
```
NEW:
```text
- **Testing:** API tests cover every PATCH/DELETE case. Web tests include `todo-sync` race cases: double toggle, toggle while a create is pending and the create fails, and delete during a pending edit. Every UI story also gets a Playwright check against the dev stack before merge. (As built: with no e2e harness until Epic 3, Stories 2.2–2.4 ran this as a manual real-browser check, Chromium via playwright-core against the dev stack. Story 3.3's `pnpm test:e2e` suite now covers these flows.)
```
- **Rationale:** Epic 2 retro F9.7. The Story 3.3 note records that it's now superseded.
- **Optional companion (not in either retro):** epic-2-context.md:28 has the same `updated_at = now()` wording as AD-3 (A-3): "`updated_at = now()` only when a value actually changes". Apply the GREATEST wording there too if the context file is to stay consistent. It's historical, so leaving it is also reasonable.

---

### deferred-work entries: `IA/deferred-work.md`

Format as in the file: `- source_spec:` / `summary:` / `evidence:`, plus `owner:` (as the G-12 and G-13 entries have) and `resolution:` for resolved items. Append after the last entry (currently :16).

Owners: Epic 3 retro item 6 assigns logging to the PM, but names no owner for the work itself. I've added `owner:` only where the source asks for a decision. Those owners are proposed, not taken from a source.

#### DW-1. nginx gzip, security headers, root-file caching
```text
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone.md`
  summary: The production nginx (`apps/web/nginx.conf`) serves the SPA without gzip, without security headers (for example `X-Content-Type-Options`, `Referrer-Policy`, a CSP), and without a `Cache-Control` on root files other than `index.html` (such as `/favicon.svg`). Only `index.html` (`no-cache`) and `/assets/` (`immutable`) set caching. Decide which to add and pin them in `pnpm test:stack`.
  evidence: Story 3.1 review, two passes (`spec-3-1-…md` triage rows at :160 and :199): "no gzip, no security headers, and no `Cache-Control` on root files — carried: this belongs to Story 3.4's performance and hardening pass". Story 3.4's spec never mentions them, and `nginx.conf` has none of them (Epic 3 retro F9). Measured performance already passes without gzip (`docs/finish-review.md`, interactive 1,088 ms against 2,000 ms), so this is hardening, not a target miss.
```

#### DW-2. Shared dev/prod Compose project and volume
```text
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone.md`
  summary: Dev and the production-like stack share the `todos` Compose project, its containers, `WEB_PORT` and the `todos-data` volume. Starting one mode replaces the other's containers, and a volume created by the production-like stack has no `todos_test`, so `pnpm test` fails. Story 3.2 answered this with the README "One mode at a time" rule. The architecture decision (keep one project, or give the production-like stack its own project and volume) is still open.
  evidence: `spec-3-1-…md` frontmatter `deferred:` (severity medium; "Needs an architecture decision"), raised by blind and edge-case review in both Story 3.1 passes. `compose.yaml:9` (`name: todos`), `docker/db-init/01-todos-test.sql` (runs only on an empty dev volume), README:158-170. AD-10 was never amended (Epic 3 retro F9; spine proposal A-9 records the current rule).
  owner: Architect (Winston), with Mehmet Sunkur (product owner)
```

#### DW-3. Undocumented HEAD routes
```text
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-documented-api-and-a-readme-that-gets-a-new-developer-running-in-15-minutes.md`
  summary: Fastify's automatic `HEAD` mirrors of the GET routes (`/api/v1/todos`, `/api/v1/health`, `/api/v1/openapi.json`) are reachable but in neither the OpenAPI document nor AD-2. Decide whether to document them, disable them (`exposeHeadRoutes: false`, a behaviour change), or record them in AD-2 as an accepted framework mirror.
  evidence: Story 3.2 review, rejected twice (`spec-3-2-…md:188` and `:205`: "`HEAD` is Fastify's automatic mirror of GET, not an API operation. Documenting it would contradict the contract's exact-paths row, and disabling it would change behaviour"), and listed in its residual risks (`:309`). `apps/api/src/app.ts:33-41` doesn't set `exposeHeadRoutes`, so Fastify's default (on) applies. It exists only in the 3.2 residuals (Epic 3 retro F9).
```

#### DW-4. Exit animation `oncancel`
```text
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-delete-a-todo.md`
  summary: `animateRowExit` never calls `onDone` if the browser cancels the fade or collapse animation, so the exiting row would stay inert and visible, and the Empty state would never appear. Check whether any engine cancels `element.animate()` on an attached element (for example with the tab hidden, or on `display: none`). If one does, call `onDone` from `oncancel`, unless the cancel came from `animateRowExit`'s own cancel.
  evidence: `spec-2-3-…md` frontmatter `deferred:` (severity medium, unverified) and triage :147. `apps/web/src/features/todos/row-exit.ts:33` and `:58` set only `onfinish`, while `row-entrance.ts:48-49` sets both `onfinish` and `oncancel`. Epic 2 retro F4 and item 4 said to move it here, and Epic 3 retro F9 found it still unlogged.
```

#### DW-5. Vite dev server doesn't pick up `packages/shared` edits
```text
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-complete-and-un-complete-a-todo.md`
  summary: In the dev stack, the running `web` container's Vite didn't pick up edits to `packages/shared` and served a stale module until `docker compose restart web`. Probably no file watcher reaches the shared package through the bind mount. Reproduce it on the current dev stack (Epic 3 changed its `node_modules` volumes), then fix the watch (for example `server.watch` or polling for the workspace package) or document the restart in the README.
  evidence: `spec-2-2-…md:210` (residuals). Epic 2 retro P5 and item 4. Epic 3 retro F9 ("the Vite shared-watch gap … never logged"). Not re-verified after `compose.override.yaml` moved to anonymous `node_modules` volumes (Epic 3 retro fix-now).
```

#### DW-6. Wire-contract fixture is POST-only
```text
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-update-and-delete-todos-through-the-api.md`
  summary: Extend `packages/shared/fixtures/wire-contract.ts` to PATCH and DELETE (success, `404`, validation and the `204`-with-no-body case), so the API contract test and the web `http.contract.test.ts` pair those server bodies with the client parser as they already do for POST.
  evidence: `spec-2-1-…md:88` (triage: "extend it there", Stories 2.2/2.3) and `:142` (residuals). `packages/shared/fixtures/wire-contract.ts:17` is still `method: "POST"`. Epic 2 retro F4 and item 4. Epic 3 retro action-item table, `epic-2-retro-item-12` ("The PATCH/DELETE wire-contract fixture … aren't in `deferred-work.md`").
```

#### DW-note. Existing entry `deferred-work.md:1-4` (Vite dev-proxy half of the Story 1.1 smoke): note only, looks resolved
- **As built:**
  - `scripts/stack-smoke.test.mjs:753` ("dev stack boots and serves the API through Vite") has `:829-832` (`GET /api/v1/health` through Vite's proxy, `assert.deepEqual(…, { status: "ok" })`) and `:837-841` (`/api/v1/openapi.json`). README:79 describes this.
  - The API registers only full `/api/v1/...` paths (AD-2), so a stripped prefix would get 404, not `{"status":"ok"}`. That makes "path unchanged" covered implicitly, but no API-log route assertion exists for the dev half, unlike the nginx half at `:480-505`.
  - This was added by the Epic 3 retro fix-now (item 1, "Add a dev-stack boot check").
- **Proposal:** no new entry. Replace the last sentence of that entry's `resolution:` (:4), "The Vite dev-proxy half remains unautomated.", with:
```text
The Vite dev-proxy half is resolved by `_bmad-output/implementation-artifacts/spec-epic-3-retro-fix-now.md`: `pnpm test:stack` boots the dev stack in `todos-smoke-dev` and requests `/api/v1/health` (expects `{"status":"ok"}`) and `/api/v1/openapi.json` through Vite's proxy (`scripts/stack-smoke.test.mjs`); a stripped prefix would 404. Unlike the nginx half, it doesn't check the API log's `route`.
```
- **Rationale:** Epic 3 retro F9 lists this as still open, but that predates its own fix-now. Confirm with the owner before closing the entry.

---

### Dropped or adjusted

- **Dropped: EXPERIENCE.md:127 "hover or focus" → "hover or focus-visible"** (in Epic 3 retro F8, last DESIGN bullet). The claim is false for that line. EXPERIENCE.md:127 is the Row actions **visibility** rule ("hidden … until the row is hovered or contains focus"). As built, that's `group-focus-within/row:opacity-100` (`todo-row.tsx:222`), meaning any focus inside the row, so the current text is correct. Epic 2 F9.6 targets only the Edit/Delete **colour** rule (epics.md 2.3/2.4, UX-DR8 and DESIGN.md Row actions), and EXPERIENCE.md never states that rule. Changing :127 would make the doc wrong.
- **Adjusted: epic-2-context "line 23"** is line 24 in the current file.
- **Added from verification (not in the item list):** A-1 (the OpenAPI route in AD-2), D-3 (DESIGN.md:128, the same focus-visible rule as :183), E-3 (the failed-edit free-focus clause), and the AD-10 :182 all-interfaces observation (flagged for a decision, not proposed).
- **Out of scope here, but in the same retro F8:** `docs/onboarding-walkthrough.md:38/41` and `docs/finish-review.md:6` (not planning docs).

## 5. Implementation handoff

- **Scope:** minor. The Developer agent applies the approved proposals directly as one docs change, on a `docs/` branch with one commit, merged to `main`.
- **Owner decisions still open.** Not decided here; the docs record the as-built state:
  - G-12: the font.
  - G-13: the edit counter reservation.
  - AD-10:182: whether the dev web server should publish on all interfaces. The doc says it doesn't, but it does, and LAN testing currently relies on that. Owner: Architect with Msunkur.
- **Success criteria:**
  - Every approved OLD text is replaced.
  - A grep finds no remaining contradiction for these items.
  - The 6 `deferred-work.md` entries exist, with owners.
  - `prettier --check` passes on the edited Markdown.
  - Sprint status: Epic 3 retro items #5 and #6 and Epic 2 retro item #14 are marked `done`.
