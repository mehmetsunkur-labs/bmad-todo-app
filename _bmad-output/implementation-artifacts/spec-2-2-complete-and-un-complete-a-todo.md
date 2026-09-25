---
title: 'Story 2.2: Complete and un-complete a Todo'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '322f1f7c0e21b964c5e407f6c2510a15cc8c4f50'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Rows show only the Description and Created At, so the user can't mark a Todo done. The `todo-sync` write helper only works for create: a failure can't map to a known server state (a PATCH `404`), a list fetch drops pending ops, and `kind` is a free string.

**Approach:** Add a Completion checkbox to each row, backed by a toggle hook on `createTodoMutation("toggle")` that sends `PATCH { completed }`. Generalize `todo-sync` in three ways: a per-kind failure mapping that the helper applies to `confirmed`, seeding that keeps pending ops, and a typed `kind` union.

## Boundaries & Constraints

**Always:**
- Toggle sends an absolute `completed` (never a flip) in the mutation scope `{ id }`. The row changes in the same tick as the click.
- Only `todo-sync.ts` writes `confirmed`, `pending` and `generation`. Every cache write replaces or removes one id, placed by `compareTodos`.
- A completed Todo shows three cues: checked box filled with `primary`, line-through, and `muted-foreground` Description.
- The checkbox is shadcn/Radix, 16 px inside a 44 px hit area, aligned with the top of the Description's first line.
- The checkbox's accessible name is the Description text, and it doesn't change on toggle.
- Toggling announces "Marked as done" or "Marked as not done" through `announce`.
- A failure gives exactly one toast: "Couldn't update that todo. Please try again." The API `message` is never shown.

**Never:** No Row actions, delete or edit UI (Stories 2.3/2.4). No `204` → `null` change in `http.ts` (Story 2.3). No re-sorting completed Todos. No confirmation, undo or animations beyond the color and line-through change. No `invalidateQueries`, no whole-list restore, no automatic retry. No API or shared-schema changes beyond a `todoPath(id)` helper.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Complete | Active row, click/tap/Space on checkbox | Checked, filled and struck through in the same tick. `PATCH /api/v1/todos/{id}` with body `{"completed":true}`. Announces "Marked as done". Row keeps its index | — |
| Un-complete | Completed row, toggle | Unchecked, normal text, `{"completed":false}`, "Marked as not done" | — |
| Double toggle | two toggles before the first response | Two PATCHes, second sent only after the first settles, bodies `true` then `false`. The checkbox shows `false` from the second click on and never flips back while the first response lands | — |
| Toggle fails | PATCH → network error, 10 s timeout, 5xx or non-envelope | Row returns to its confirmed state, one toast, focus stays on the checkbox | helper rollback |
| Queued after failure | toggle A fails while toggle B for the same id is queued | B makes no fetch (`DroppedError`), no second toast, and the row shows the confirmed state | `DroppedError` |
| PATCH 404 | PATCH → `404 NOT_FOUND` | `confirmed(id) = null`, the row is removed, one toggle toast | kind failure mapping |
| Toggle on pending create | create pending, toggle, then create fails | Toggle dropped with no PATCH. Only the create failure UI shows, and the row is removed | `DroppedError` |
| Seed with pending | list fetch succeeds while ids have pending ops | Rendered list = each listed Todo with its pending ops re-applied, plus pending creates not listed. An id with pending ops is never set to `null` by seeding | — |

</intent-contract>

## Code Map

- `apps/web/src/api/todo-sync.ts`:
  - `PendingOp.kind: string` (L16) and `createTodoMutation(kind: string, …)` (L173): both become the typed union.
  - `seedFromList` (L47): nulls missing ids even with pending ops, which must stop.
  - `onError` (L214): renders from `confirmed` with no mapping, which is where the kind's failure mapping goes.
  - `createOp` (L80) is the op pattern to follow.
  - `renderedTodo` (L99) and `renderTodo` (L110) are reused.
- `apps/web/src/api/hooks/use-todos-query.ts`: `queryFn` (L20) seeds, then returns the raw sorted list. It must return the rendered list.
- `apps/web/src/api/hooks/use-create-todo.ts`: hook pattern to mirror (`useMemo` mutation, `useCallback` trigger, feature-owned `onFailure`).
- `apps/web/src/api/http.ts`: `request` already supports `PATCH`; `createTodo` (L136) is the pattern for `updateTodo`. `HttpError.kind`/`status` gives the 404 test.
- `packages/shared/src/paths.ts`: `TODO_PATH` (Story 2.1). Add `todoPath(id)` beside it. `UpdateTodoRequest` is in `packages/shared/src/todos.ts`.
- `apps/web/src/features/todos/todo-row.tsx`: memoized row, currently a single column. Add the checkbox column.
- `apps/web/src/features/todos/todo-list.tsx`: renders `TodoRow`s. It owns the toggle hook and passes a stable callback down.
- `apps/web/src/features/todos/create-failure.ts`: failure-copy module pattern.
- `apps/web/src/lib/toast.tsx`: `showErrorToast` (plain, 8 s). `apps/web/src/lib/announce.ts`: `announce`.
- `apps/web/src/components/ui/button.tsx`: shadcn style reference (`radix-ui` import, `cn`, focus-visible outline).
- Tests:
  - `apps/web/src/api/todo-sync.test.ts`: helper tests with a `deferred` helper.
  - `apps/web/src/features/todos/todo-list.test.tsx`: component tests.
  - `apps/web/src/test/fetch.ts` (`deferredFetch`, `hangingFetch`, `advance`) and `apps/web/src/test/render.tsx` (`renderWithProviders`, `jsonResponse`, `makeTodo`).

## Tasks & Acceptance

**Execution:**
- `packages/shared/src/paths.ts`: add `todoPath(id: string)`, which returns `${TODOS_PATH}/${encodeURIComponent(id)}`.
- `apps/web/src/api/http.ts`: add `updateTodo(id, body: UpdateTodoRequest): Promise<Todo>`, a `PATCH` to `todoPath(id)` parsed with `TodoSchema`.
- `apps/web/src/api/todo-sync.ts`:
  - Export `TodoWriteKind = 'create' | 'edit' | 'toggle' | 'delete'`, and use it for `PendingOp.kind` and `createTodoMutation`'s `kind`.
  - Add `toggleOp(completed)`, which applies `{ ...previous, completed }` and gives `null` when `previous` is `null`.
  - Add optional `TodoMutationConfig.failureState(error, vars): Todo | null | undefined`. On a real failure, the helper bumps the generation. If the mapping returns something other than `undefined`, it sets `confirmed(id)` to that value. It then clears pending, re-renders and calls `onFailure` once.
  - Export `notFoundMeansDeleted(error)`, which returns `null` for an `HttpError` of kind `NOT_FOUND` and `undefined` otherwise.
  - `seedFromList` never sets an id with pending ops to `null`.
  - Add `renderedList(sync, listed)`: each listed id's rendered Todo (dropping `null`s), plus every pending id not listed whose rendered state isn't `null`, sorted by `compareTodos`.
- `apps/web/src/api/hooks/use-todos-query.ts`: the `queryFn` returns `renderedList(sync, todos)` after seeding.
- `apps/web/src/api/hooks/use-toggle-todo.ts` (new): `useToggleTodo(onFailure)` on `createTodoMutation("toggle", { op: toggleOp, request: updateTodo(id, { completed }), failureState: notFoundMeansDeleted, onFailure })`. It returns a stable `(vars: { id, completed }) => void`.
- `apps/web/src/components/ui/checkbox.tsx` (new): shadcn Checkbox on `radix-ui` `Checkbox` with a lucide `Check` indicator. It uses a 16 px box, `data-[state=checked]:bg-primary` with the `primary-foreground` check, and a focus-visible ring like `button.tsx`.
- `apps/web/src/features/todos/toggle-failure.ts` (new): `TOGGLE_FAILED_COPY` and `showToggleFailure()`, a plain `showErrorToast`.
- `apps/web/src/features/todos/todo-row.tsx`:
  - The layout becomes a row: the checkbox in a 44 px hit area on the left, then the Description and Created At column. Items align to the start so the box lines up with the first line.
  - The checkbox is `aria-labelledby` the Description element.
  - A completed Todo shows `line-through text-muted-foreground` on the Description.
  - `onCheckedChange` calls `onToggle({ id, completed: checked === true })` and announces the matching text.
  - Update the doc comment.
- `apps/web/src/features/todos/todo-list.tsx`: `useToggleTodo(showToggleFailure)`, passing `onToggle` to each `TodoRow`.
- `apps/web/src/api/todo-sync.test.ts`:
  - The mapping sets `confirmed` to `null` on `NOT_FOUND` and leaves it unchanged for other errors.
  - Seeding with pending ops covers both rules.
  - `renderedList` includes pending creates.
  - A `@ts-expect-error` shows a free-string `kind` is rejected.
  - The race tests: double toggle ordering with no flicker, toggle on a pending create that then fails, and a queued toggle dropped after a failed toggle.
- `apps/web/src/features/todos/todo-list.test.tsx` (or a new `todo-row.test.tsx` beside it): component tests covering every I/O matrix row, plus the checkbox's accessible name before and after a toggle, the three completed cues, Space toggling, focus staying put on failure, and a reload (fresh query) showing the persisted `completed`.

**Acceptance Criteria:**
- Given a populated list, when it renders, then every row starts with a checkbox whose accessible name equals that Todo's Description, with `aria-checked` matching `completed`.
- Given a completed Todo, when the list reloads, then it renders checked and struck through, in the same position as an active Todo with the same `createdAt` would have.
- Given any toggle failure, when it is handled, then feature code never writes `confirmed`/`pending`/`generation`: only the helper does.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 6, false 16, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) A stale list response landing after a PATCH succeeded overwrites `confirmed` and reverts the toggle — can't happen: the pinned defaults (`apps/web/src/api/query-client.ts`) fetch the list only on page load and "Try again". "Try again" exists only in the Load error state, where no rows are rendered, and the Add row is disabled unless the query succeeded (`add-row.tsx:54`). So no write can be in flight while a list fetch is outstanding.
  - `[false]` `[reject]` (blind) An unlisted id kept by seeding comes back after a non-404 failure — the same trigger (a list fetch while a write is pending) can't happen, as above.
  - `[low]` `[reject]` (blind) Focus falls to `<body>` when a PATCH 404 removes the focused row — real, but it needs the Todo to have been deleted in another tab. The fix needs next/previous-row focus logic, which Story 2.3 builds for delete, so it is more than a direct correction. It is noted under Residual risks for 2.3.
  - `[false]` `[reject]` (blind) The 404 toast says "Please try again" for a Todo that is gone — the Story 2.2 AC requires "the toggle-failure toast shows" on 404, and that is its exact copy.
  - `[false]` `[reject]` (blind) Screen-reader users hear "Marked as done" and never learn about the rollback — the failure toast is `role="status"` (`apps/web/src/lib/toast.tsx`), so the failure is announced politely, and the checkbox's restored `aria-checked` is exposed.
  - `[false]` `[reject]` (blind) `useToggleTodo` needs a stable `onFailure`, and `mutate`'s promise is voided — the only caller passes the module-level `showToggleFailure`, matching `useCreateTodo`. `TodoMutation.mutate` catches internally and never rejects (`todo-sync.ts`).
  - `[false]` `[reject]` (blind) The Space test never presses Space, and no test covers Enter — jsdom doesn't synthesize the click. A real Chromium check against the dev stack showed Space toggling (33 ms) and Enter doing nothing (see Verification).
  - `[low]` `[patch]` (blind) `expectCompleted`'s `className` check for `data-[state=checked]:bg-primary` could never fail — removed. `data-state`/`aria-checked` were already asserted, and the primary fill was measured in a real browser.
  - `[false]` `[reject]` (blind) The success path of a toggle on a pending create is untested — the behaviour is the helper's ordinary queued run in scope `{ id }`, and it is correct. A missing extra test is not a defect against the ACs.
  - `[false]` `[reject]` (blind) `renderedList` with a listed id whose create is still pending might reorder the row — `createOp.apply` returns `previous ??` its own Todo, so the server's listed Todo (and its `createdAt`) wins.
  - `[low]` `[patch]` (blind) `updateTodo`'s JSDoc lists only `NOT_FOUND` — the doc now says it rejects with an `HttpError` classified as for every request, `NOT_FOUND` for an unknown id.
  - `[false]` `[reject]` (blind) The `TodoWriteKind` test is weak or noisy — the `@ts-expect-error` is the assertion and typecheck enforces it. The runtime scaffolding is harmless, and no harm was named.
  - `[false]` `[reject]` (edge) A stale list response overwrites `confirmed` — the same as the first blind finding: no reachable trigger.
  - `[false]` `[reject]` (edge) Refetch omits an id with a pending toggle, then a non-404 failure resurrects it — the same as the second blind finding: no reachable trigger.
  - `[false]` `[reject]` (edge) A PATCH 404 with a non-envelope body rolls back instead of removing — a non-envelope 404 means something other than the API answered, so the Todo's existence is unknown. Rolling back (not deleting) is the safe reading, and AD-5 classifies it `INTERNAL`.
  - `[low]` `[reject]` (edge) Focus is lost after a 404 removal — the same as the third blind finding.
  - `[false]` `[reject]` (edge) There is no corrective announcement after a rollback — the same as the fifth blind finding.
  - `[low]` `[patch]` (verification-gap) No test covers `renderedList` keeping a confirmed Todo with pending ops that the list no longer contains — added a `todo-sync renderedList` case: seed `[a, b]`, pending `toggleOp(true)` on `a`, re-seed `[b]`, assert `[b, { ...a, completed: true }]`.
  - `[low]` `[reject]` (verification-gap) Nothing asserts the toggle callback stays stable (only one row re-renders) — performance only, with no user-visible change. The filed disposition was defer, but it is caused by this change and not maybe-false. The repo has no render-count harness, so the fix is more than a direct correction.
  - `[false]` `[reject]` (verification-gap, other) A remotely deleted Todo with a pending toggle reappears after a non-404 failure — the same trigger as the second blind finding, which can't happen.
  - `[false]` `[reject]` (intent-alignment) Real-browser behaviour (persistence across the stack, 100 ms, 16/44 px layout, Space) and the epic's Playwright rule are unverified — resolved by verification. A Playwright-driven Chromium run against the dev stack confirmed each one (see Verification). The Playwright suite itself arrives in Epic 3.
  - `[false]` `[reject]` (intent-alignment) The 2-2 status in `sprint-status.yaml` wasn't moved — it is part of finalization (a separate commit, as in earlier stories), not the reviewed code diff.

## Design Notes

Why the failure mapping lives in the helper: for create, the default (render from the existing `confirmed`) already removes a never-confirmed row. A PATCH `404`, though, must turn a confirmed Todo into `null`. So the kind supplies the mapping and the helper applies it before re-rendering:

```ts
onError: (error) => {
  if (error instanceof DroppedError) { removeOp(); return }
  bumpGeneration(id)
  const known = config.failureState?.(error, vars)
  if (known !== undefined) sync.confirmed.set(id, known)
  sync.pending.delete(id); renderTodo(queryClient, id); config.onFailure(…)
}
```

After a 404 removes the row, focus is lost like with any unmounted element. The delete focus rules come with Story 2.3. The "Playwright check against the dev stack" in the epic context has no harness yet (e2e arrives in Epic 3), so a manual dev-stack check below covers it.

## Verification

**Commands:**
- `pnpm --filter @todos/web test && pnpm --filter @todos/shared test` -- expected: all pass, none skipped
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: all exit 0

**Manual checks (if no CLI):**
- Dev stack (`docker compose up`, web on http://localhost:18080): toggle a Todo, reload, and it's still toggled. `curl -s localhost:18080/api/v1/todos` shows `completed` changed.

## Auto Run Result

**Summary:** Every row now starts with a shadcn/Radix Completion checkbox:
- 16 px in a 44 px hit area, aligned with the first line.
- Its accessible name is the Description.
- Toggling sends `PATCH { completed }` through a new `useToggleTodo` built on `createTodoMutation("toggle")`.
- Completed Todos show the primary fill, a line-through and muted text, and toggles announce "Marked as done" / "Marked as not done".

`todo-sync` is generalized in three ways:
- A typed `TodoWriteKind` union.
- A per-kind `failureState` mapping that the helper applies to `confirmed`. `notFoundMeansDeleted` makes a PATCH 404 remove the row.
- Seeding that keeps ids with pending ops, plus `renderedList` so a list fetch re-applies pending ops and keeps pending creates.

**Files changed:**
- `packages/shared/src/paths.ts`: `todoPath(id)`.
- `packages/shared/test/todos.test.ts`: `todoPath` tests.
- `apps/web/src/api/http.ts`: `updateTodo`.
- `apps/web/src/api/todo-sync.ts`: `TodoWriteKind`, `toggleOp`, `failureState`, `notFoundMeansDeleted`, seeding rule, `renderedList`.
- `apps/web/src/api/hooks/use-todos-query.ts`: returns the rendered list.
- `apps/web/src/api/hooks/use-toggle-todo.ts` (new): toggle hook.
- `apps/web/src/components/ui/checkbox.tsx` (new): shadcn Checkbox.
- `apps/web/src/features/todos/toggle-failure.ts` (new): toggle failure toast.
- `apps/web/src/features/todos/todo-row.tsx`: checkbox column and completed cues.
- `apps/web/src/features/todos/todo-list.tsx`: owns the toggle hook.
- `apps/web/src/api/todo-sync.test.ts`: helper, seeding and race tests.
- `apps/web/src/features/todos/todo-row.test.tsx` (new): component tests for every I/O matrix row.

**Review findings:** 22 in total. 3 patched (all low: a test assertion that could never fail, the `updateTodo` JSDoc, and a missing `renderedList` case), 0 deferred, and 19 rejected (3 low, 16 false; the reasons are in the Review Triage Log).

**Follow-up review recommendation:** `false`. Patched this pass: high 0, medium 0, low 3.

**Verification:**
- `pnpm --filter @todos/web test`: 143 passed across 10 files, none skipped.
- `pnpm --filter @todos/shared test`: 46 passed. `pnpm --filter @todos/api test` (after implementation): 158 passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` and `prettier --check apps packages` all exit 0.
- Matrix audit: every I/O row has a passing test.
- Manual real-browser check: Chromium via playwright-core, dev stack at :18080, using a throwaway Todo that was deleted afterwards. It showed:
  - a 16×16 box with a 44×44 hit area, its center within 2 px of the first line's center;
  - Enter doesn't toggle;
  - Space checks it in 33 ms and sends `PATCH {"completed":true}` → 200;
  - line-through and `muted-foreground` text, and a primary fill `rgb(47,111,106)` once the transition settles;
  - "Marked as done" in the live region, and focus stays on the checkbox;
  - still checked after a reload.

**Residual risks:**
- Focus falls to `<body>` when a PATCH 404 removes the focused row (only when the Todo was deleted in another tab). Story 2.3's row-removal focus logic should cover it.
- The running dev `web` container's Vite didn't pick up edits to `packages/shared`: it served a stale module until `docker compose restart web`. This is a pre-existing dev-environment issue. It is likely that no file watcher reaches the shared package through the bind mount.
