# Sprint Change Proposal — Epic 2 readiness and Epic 1 spec reconciliation

- **Date:** 2026-09-25
- **Author:** Msunkur (with Claude, correct-course workflow)
- **Mode:** Batch
- **Status:** Approved by Msunkur and applied 2026-09-25 (branch `docs/correct-course-epic-2-readiness`)
- **Trigger:** Epic 1 retrospective (`_bmad-output/implementation-artifacts/epic-1-retro-2026-09-25.md`), action items 3 and 8. Sprint-status ids:
  - `epic-1-retro-item-3-story-2-1-2-2-specs-failure-path-can-set`
  - `epic-1-retro-item-8-reconcile-specs-ul-only-when-populated-r`

## 1. Issue Summary

The Epic 1 retrospective found two kinds of problem that no single story could see. Both need resolving before Epic 2 is built.

**The write layer is only half generic (retro F3, F4).** Epic 2 reuses `todo-sync.ts` for edit, toggle and delete, but the as-built helper can't meet contract that Epic 2's ACs already assume:

- **Failure path:** Story 2.2 needs a PATCH `404` to set `confirmed = null` and remove the row. `onError` always re-renders from the existing `confirmed` (`apps/web/src/api/todo-sync.ts:219-221`), and a kind's `onFailure` has no access to sync state.
- **204 responses:** a `204` resolves as `undefined as T` (`apps/web/src/api/http.ts:89`), but AD-12's delete success writes `null`.
- **List refetch:** a list refetch writes the raw server list and ignores pending ops. `seedFromList` sets ids missing from a stale list to `null` (`apps/web/src/api/hooks/use-todos-query.ts:20-24`, `todo-sync.ts:47-56`). Today this is safe only because "Try again" is reachable just from Load error. Nothing states or tests that invariant.
- **Create replay:** its behaviour once edit and delete exist is unspecified. A late create Retry after an edit elsewhere returns `409`, because it compares against the current Description. A late create Retry after a delete elsewhere re-inserts the row (`apps/api/src/services/todo-service.ts:64-77`).

**The planning docs drifted from the as-built and from decisions already made (retro F9).**

- **List element:** `<ul aria-label="Todos">` is specified for every state, but Empty and Load error render no list (`apps/web/src/features/todos/todo-list.tsx:58-67`).
- **Retry quote rule:** the docs specify "{first 40 characters}…" always. Story 1.4's human decision (`spec-1-4…md:57`) quotes text of 40 characters or fewer as-is.
- **shadcn init command:** the documented command hangs on a preset prompt and needs `-p nova` (session `0b6a1b42`, subagent a331d, L51-67).
- **Dev ports:** the docs say `db` publishes `5432`. In practice dev ports are parameterized (`WEB_PORT`, `DB_PORT`), because the defaults were taken on the dev host.
- **Dev exposure:** the dev database (example password `todos`) and the Node inspector are published on every host interface (`compose.override.yaml:6,16,20`).

**How it was found:** the retro's aggregate views, the three-lens `bmad-review` diff pass over `224a150^..9754b0f`, and the session logs. Each point above has a file and line reference.

## 2. Impact Analysis

**Epic impact:**

| Epic | Impact |
|---|---|
| Epic 1 (done) | No rework. Its docs are reconciled to the as-built. |
| Epic 2 (backlog) | Stories 2.1–2.4 get amended ACs. No story is added, removed or reordered. |
| Epic 3 (backlog) | No change. Story 3.1's production-like stack already publishes only `web`. |

No epic becomes obsolete, no new epic is needed, and priorities don't change.

**Story impact:**
- **2.1:** pin today's create-replay semantics with tests (decision 3d).
- **2.2:** the first non-create write kind. It takes on the helper generalization (failure-path confirmed state, refetch reapplies pending ops, typed `kind`).
- **2.3:** `http.ts` resolves `204` to `null`.
- **2.4:** the Retry quote rule for edits.

**Artifact conflicts:**
- **PRD:** none. The FRs and NFRs are unchanged.
- **Architecture spine:** AD-4 (replay semantics), AD-6 (refetch and `204`), AD-10 (dev port binding), AD-12 (who may write `confirmed`), and the Stack "Starter" row.
- **UX:** `EXPERIENCE.md` Retry copy at lines 52 and 55.
- **`epics.md`:** the Requirements Inventory (lines 77, 146-153, 259) and Stories 1.1, 1.2, 1.4, 2.1–2.4.

**Technical impact:**
- One small dev-only config change: bind the published dev ports to `127.0.0.1` in `compose.override.yaml`.
- Everything else is spec-level. The code for items 3a to 3c is built in Stories 2.2 and 2.3 by the normal dev loop.

## 3. Recommended Approach

**Direct adjustment.** Amend the existing Epic 2 stories and reconcile the docs in place. There is no rollback and no MVP change.

- **Why:** every issue fits inside stories that haven't started. Putting the helper changes into the first story that needs them (2.2 for the failure path, 2.3 for `204`) keeps each change next to its first consumer and its tests. Reconciling the docs now means `compile-epic-context` for Epic 2 starts from correct inputs.
- **Decision 3d, made by Msunkur:** keep the server's create-replay semantics and document them.
  - A late create Retry for a Todo edited elsewhere gets `409`, and the client shows the add failure.
  - A late create Retry for a Todo deleted elsewhere re-creates it, because Retry means "make it exist".
  - Both need two tabs, and neither needs a schema change.
- **Decision 3c:** chosen as the defensive option. A successful list fetch re-applies pending ops, and never sets an id to `null` while that id has pending ops. That is cheap, and it removes a latent trap from the invariant instead of just documenting it.
- **Effort:** small. About 15 text edits across four documents and one config line.
- **Risk:** low. The only behavioural code change now is the dev port binding.

## 4. Detailed Change Proposals

### 4.1 Stories and Requirements Inventory (`_bmad-output/planning-artifacts/epics.md`)

**E1: Requirements Inventory, starter (line 77)**
```
OLD: - Starter: scaffold `apps/web` with `pnpm dlx shadcn@4.21.0 init -t vite -b radix` (Radix variant, then `shadcn add sonner`). …
NEW: - Starter: scaffold `apps/web` with `pnpm dlx shadcn@4.21.0 init -t vite -b radix -p nova` (Radix variant; `-p nova` answers the preset prompt so the command runs unattended; then `shadcn add sonner`). …
```
Rationale: without a preset flag the documented command waits for input and hangs.

**E2: Requirements Inventory, dev compose (lines 152-153)**
```
OLD:   - `--inspect=0.0.0.0:9229`
       - `db` published on port 5432
NEW:   - `--inspect=0.0.0.0:9229` inside the container, published on the host only as `127.0.0.1:9229`
       - `db` published only on `127.0.0.1:${DB_PORT:-5432}`; host ports are overridable via `.env` (`WEB_PORT`, `DB_PORT`)
```
Rationale: this matches the parameterized ports already in use, and stops publishing the example-password database and the debugger to the network.

**E3: Requirements Inventory, landmarks (line 259)**
```
OLD:   - Landmarks: `<header>`, and a `<main>` containing a `<form>` and `<ul aria-label="Todos">`.
NEW:   - Landmarks: `<header>`, and a `<main>` containing a `<form>` and, in the Loading and Populated states, `<ul aria-label="Todos">`. Empty and Load error show their message in `<main>` with no empty list element.
```

**E4: Story 1.1 ACs (lines 319-320, 326)**
```
OLD: - `api`: runs under `tsx watch`, with the inspector on `0.0.0.0:9229`.
     - `db`: `postgres:18-alpine`, … and port 5432 published.
     … (scaffolded with `pnpm dlx shadcn@4.21.0 init -t vite -b radix`) …
NEW: - `api`: runs under `tsx watch`, with the inspector listening on `0.0.0.0:9229` in the container and published as `127.0.0.1:9229`.
     - `db`: `postgres:18-alpine`, … published as `127.0.0.1:${DB_PORT:-5432}`.
     … (scaffolded with `pnpm dlx shadcn@4.21.0 init -t vite -b radix -p nova`) …
```

**E5: Story 1.2 AC (line 402)**
```
OLD: **And** the list is a `<ul aria-label="Todos">` inside `<main>`.
NEW: **And** in the Loading and Populated states the list is a `<ul aria-label="Todos">` inside `<main>`; the Empty and Load error states render their message instead of a list.
```
Rationale: an empty `<ul>` in the Empty state would make screen readers announce "list, 0 items" as well as the empty message. The as-built is the better behaviour.

**E6: Story 1.4 AC (line 493), matching the human decision recorded in spec-1-4**
```
OLD: **And** a persistent toast says "Couldn't add “{first 40 characters}…”." with a **Retry** action, …
NEW: **And** a persistent toast says "Couldn't add “{quote}”." with a **Retry** action, … where {quote} is the Description as-is when it has 40 characters or fewer, otherwise its first 40 characters followed by "…".
```

**E7: Story 2.1, new ACs (create replay once edit and delete exist, decision 3d)**
```
NEW:
**Given** a Todo created with id X and then edited to a new Description
**When** a late `POST /api/v1/todos` for id X with the original Description arrives
**Then** the response is `409 CONFLICT` and nothing is written (the client shows the add failure).

**Given** a Todo with id X that was deleted
**When** a late `POST /api/v1/todos` for id X arrives
**Then** it is created again (`201`): a create Retry means "make this Todo exist".
**And** both cases have API tests.
```

**E8: Story 2.2, new ACs (generalize the `todo-sync` write helper; items 3a and 3c)**
```
NEW:
**Given** a write kind whose failure maps to a known server state (a PATCH `404` means the Todo no longer exists)
**When** that failure arrives
**Then** the `todo-sync` helper itself sets `confirmed(id)` from the kind's mapping (`null` for 404), clears `pending(id)`, re-renders that id, and raises the kind's one failure toast. Feature code never writes sync state.

**Given** a list fetch succeeds while some Todos have pending ops
**When** `confirmed` is seeded
**Then** the rendered list is each listed Todo with its pending ops re-applied, plus pending creates not yet listed.
**And** an id with pending ops is never set to `null` by seeding.
**And** both cases have `todo-sync` tests.

**Given** `createTodoMutation(kind)`
**When** it is called
**Then** `kind` is the typed union `'create' | 'edit' | 'toggle' | 'delete'`, not a free string.
```

**E9: Story 2.3, new AC (item 3b)**
```
NEW:
**Given** the DELETE response is `204`
**When** `http.ts` handles it
**Then** it resolves to `null` (typed), and a `204` on a call that expects a body is classified `INTERNAL`.
**And** delete success writes `confirmed(id) = null` from that value.
```

**E10: Story 2.4 AC (line 682), the same quote rule as E6**
```
OLD: **And** a persistent toast says "Couldn't save your edit to “{first 40 characters}…”." with **Retry**, …
NEW: **And** a persistent toast says "Couldn't save your edit to “{quote}”." with **Retry**, … using the same {quote} rule as Story 1.4.
```

### 4.2 Architecture spine (`architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md`)

**A1: AD-4 POST rule, appended**
```
NEW: - **Late create retries:** the comparison is against the *stored* Description. A create Retry for a Todo since edited elsewhere gets `409`, and the client shows the add failure. A create Retry for a Todo since deleted re-creates it, because Retry means "make this Todo exist". Both are accepted multi-tab edge cases (decision 2026-09-25, sprint-change-proposal-2026-09-25).
```

**A2: AD-6 "Fetching the list" and "The HTTP client"**
```
OLD: … A successful list fetch seeds the confirmed store in `todo-sync.ts`.
NEW: … A successful list fetch seeds the confirmed store in `todo-sync.ts`, and the rendered list is the seeded state with pending ops re-applied. Seeding never sets an id with pending ops to `null`.
OLD: … never parses a `204`, …
NEW: … never parses a `204` and resolves it to `null` (a `204` where a body is expected is `INTERNAL`), …
```

**A3: AD-10 compose.override.yaml**
```
OLD:   - `api` runs under `tsx watch`, with `--inspect=0.0.0.0:9229` published.
       - `db` publishes `5432`, and an init script …
NEW:   - `api` runs under `tsx watch` with `--inspect=0.0.0.0:9229`, published on the host only as `127.0.0.1:9229`.
       - `db` publishes `127.0.0.1:${DB_PORT:-5432}`, and an init script …
       - Host ports are overridable in `.env` (`WEB_PORT`, `DB_PORT`); dev never publishes on all interfaces.
```

**A4: AD-12 `confirmed` write rule and table**
```
OLD: It is written **only** when a list fetch succeeds and in mutation success handlers.
NEW: It is written **only** by `todo-sync.ts`: when a list fetch succeeds, in mutation success handlers, and in the failure path when the write kind maps an error to a known server state (a PATCH `404` → `null`).
OLD: | `onError` with any other error | It increments `generation(id)`, clears `pending(id)`, re-renders from `confirmed(id)`, …
NEW: | `onError` with any other error | It increments `generation(id)`, clears `pending(id)`, applies the kind's failure mapping to `confirmed(id)` if it has one, re-renders from `confirmed(id)`, …
```

**A5: Stack, Starter row (line 231)**
```
OLD: | Starter | Scaffold `apps/web` with `pnpm dlx shadcn@4.21.0 init -t vite -b radix`, …
NEW: | Starter | Scaffold `apps/web` with `pnpm dlx shadcn@4.21.0 init -t vite -b radix -p nova` (the preset flag keeps it non-interactive), …
```

### 4.3 UX (`ux-designs/ux-Todo-App-2026-09-24/EXPERIENCE.md`)

**U1: lines 52 and 55**
```
OLD: "Couldn't add “{first 40 characters of the Description}…”."   /   "Couldn't save your edit to “{first 40 characters}…”."
NEW: "Couldn't add “{quote}”."   /   "Couldn't save your edit to “{quote}”." — {quote} is the Description as-is at 40 characters or fewer, otherwise its first 40 characters and "…".
```

### 4.4 Code (dev-only config)

**C1: `compose.override.yaml`**
```
OLD:  - "${DB_PORT:-5432}:5432"        …        - "9229:9229"
NEW:  - "127.0.0.1:${DB_PORT:-5432}:5432"  …   - "127.0.0.1:9229:9229"
```
Host-side tools (`pnpm test`, `db:migrate`, the debugger) connect through `localhost`, so they keep working.

## 5. Implementation Handoff

**Scope: Minor.** These are direct edits to planning docs, plus one dev-config line. No backlog reorganization is needed.

**Developer agent, now:**
- Apply E1–E10, A1–A5 and U1 as written.
- Apply C1, then check `docker compose up -d` and `pnpm test`, and confirm that `ss -ltn` shows 5432 and 9229 bound only to 127.0.0.1.

**Epic 2 build (`bmad-build`):**
- E7–E10 are implemented by Stories 2.1–2.4 in the normal dev loop.
- `compile-epic-context` for Epic 2 will pick up the reconciled docs.

**Sprint status:** once the edits land, mark retro items 3 and 8 `done` through `sprint_status.py --set-action-status`.

**Success criteria:**
- `grep` finds no "first 40 characters}…" without the ≤40 rule.
- No `init -t vite -b radix` without `-p nova`.
- No "publishes `5432`" in the planning docs.
- The Story 2.1–2.4 ACs contain E7–E10.
- Dev ports are bound to loopback, and the suites stay green.
