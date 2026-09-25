---
title: 'Story 2.3: Delete a Todo'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'bf740bc6bb9f9b27937f80b8ed27615c331c2682'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      animateRowExit never calls onDone if the browser cancels the fade or collapse animation, so the exiting row would stay inert and visible and the Empty state would never appear.
    evidence: |-
      row-exit.ts sets onfinish but not oncancel on either animation. No path was shown where a browser cancels a WAAPI animation on this attached element. To settle it, check whether any engine cancels element.animate() on an attached element (for example when the tab is hidden, or on display:none) and reproduce it. If so, call onDone from oncancel unless the cancel came from animateRowExit's own cancel.
    location: >-
      apps/web/src/features/todos/row-exit.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A Todo can't be removed. `http.ts` also resolves a `204` as `undefined as T`, so a delete success can't write `confirmed(id) = null` from a typed value.

**Approach:** Add a Row actions container with a Delete button to each row, backed by a delete hook on `createTodoMutation("delete")` that sends `DELETE` and counts a `404` as success. The row fades and then collapses. Focus moves to a neighbour. A failure restores the row, its focus and one toast. `http.ts` gets a typed `204` → `null`.

## Boundaries & Constraints

**Always:**
- The delete op applies `null` in scope `{ id }` in the same tick as the click. The DELETE is sent at once.
- Only `todo-sync.ts` writes sync state. Every cache write touches one id, placed by `compareTodos`.
- The Delete button is a ghost `Button`: lucide `Trash2` at 16 px in a 44 px hit area, `muted-foreground`, turning `destructive` on hover or focus. Its accessible name is exactly `Delete todo: {Description}`.
- The Row actions sit on the right, aligned with the Description's first line. Tab order within a row is checkbox, then Delete.
- Visibility depends on input capability via `useMediaQuery(HOVER_POINTER_QUERY)`, never on width. With hover and a fine pointer, the actions are `opacity-0` but still tabbable, and visible while the row is hovered or has focus inside it. Otherwise they are always visible.
- Exit motion: opacity goes to 0 over 100 ms, then the height collapses over 150 ms. Both are instant under `prefers-reduced-motion` or without the Web Animations API.
- "Todo deleted" is announced.
- Focus is never left on `<body>` by a delete.

**Never:** No confirmation, undo, swipe or long-press. No Edit button (Story 2.4). No API change. No `invalidateQueries` or whole-list restore. No focus handling for a row removed by a PATCH 404 from a toggle (the Story 2.2 residual is logged in `deferred-work.md`). No change to the Loading skeleton.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete | click/Enter/Space on Delete | `DELETE /api/v1/todos/{id}` with no body and no `Content-Type`. The row leaves the list (after its exit motion) and "Todo deleted" is announced. Focus goes to the next row's checkbox | — |
| Last in list | delete the bottom row with rows above | Focus goes to the previous row's checkbox | — |
| Only Todo | delete the sole row | Focus goes to the Add input. After the exit, the Empty state shows | — |
| Success | `204` | `confirmed(id) = null`, and after a reload the Todo stays gone | — |
| Already gone | `404 NOT_FOUND` | Treated as success: no toast, row stays gone | hook maps it to `null` |
| Fails | network error, 10 s timeout, 5xx or non-envelope | The row reappears at its `compareTodos` position with its confirmed state, and one toast says "Couldn't delete that todo. Please try again." If focus is still on the element the delete moved it to (or on `<body>`), it goes to the restored row's checkbox. Otherwise it stays put | helper rollback |
| Queued after | toggle queued behind a failing delete | Dropped (`DroppedError`): no fetch, no second toast | `DroppedError` |
| Pending create | delete a row whose create is pending, then the create fails | The DELETE is dropped. Only the create failure UI shows, and the row stays removed | `DroppedError` |
| Toggle then delete | toggle in flight, then delete | The DELETE is sent only after the PATCH settles, and the row is removed at once | — |
| 204 with body expected | `request` with a body schema gets `204` | Rejects `HttpError("INTERNAL")` | `http.ts` |
| Reduced motion | `prefers-reduced-motion: reduce` | The row is removed with no animation | — |
| Hover device | `(hover: hover) and (pointer: fine)` matches | Actions are `opacity-0` until the row is hovered or has focus inside it, and still tabbable. No match: always visible | — |

</intent-contract>

## Code Map

- `apps/web/src/api/http.ts`:
  - `request` (L67): `if (response.status === 204) return undefined as T` (L89) is the bug to fix.
  - `RequestOptions.schema` (L50) needs a "no body expected" form.
  - `updateTodo` (Story 2.2) is the pattern for `deleteTodo`.
  - `HttpError.kind` is used for the 404 check.
- `apps/web/src/api/http.test.ts`: existing `request` tests. Update any that assert a 204 resolves `undefined`.
- `apps/web/src/api/todo-sync.ts`:
  - `createTodoMutation` already supports a `null` result (`request(): Promise<Todo | null>`, and `onSuccess` sets `confirmed`).
  - `toggleOp` is the op pattern to follow.
  - `renderedList` and seeding already handle a pending delete, since the op renders `null`.
- `apps/web/src/api/hooks/use-toggle-todo.ts`: the hook pattern to mirror.
- `apps/web/src/features/todos/todo-row.tsx`: memoized row with the checkbox column (Story 2.2). Add the Row actions column on the right. The description element has an id through `useId`.
- `apps/web/src/features/todos/todo-list.tsx`: `ListState` maps `query.data` to rows and owns the hooks. This is where exiting rows and focus-after-delete go.
- `apps/web/src/features/todos/row-entrance.ts`: WAAPI height animation, a no-op without `animate` or under `REDUCED_MOTION_QUERY`. Model the exit animation on it.
- `apps/web/src/lib/use-media-query.ts`: `useMediaQuery`, `matchesMedia`, `HOVER_POINTER_QUERY` and `REDUCED_MOTION_QUERY`.
- `apps/web/src/features/todos/create-failure.ts`: the `registerAddRowController` controller exposes `focus()` for the Add input. Reuse it rather than querying the DOM.
- `apps/web/src/features/todos/toggle-failure.ts`: pattern for the delete failure copy.
- `apps/web/src/components/ui/button.tsx`: the `ghost` variant and `size` options.
- `apps/web/src/features/todos/list-states.tsx`: `EmptyState`.
- Tests:
  - `apps/web/src/features/todos/todo-row.test.tsx`: component test patterns for toggle.
  - `apps/web/src/api/todo-sync.test.ts`: race tests.
  - `apps/web/src/test/media.ts`: `setMediaQuery`.
  - `apps/web/src/test/fetch.ts` and `apps/web/src/test/render.tsx`.
- `_bmad-output/implementation-artifacts/deferred-work.md`: append-only log.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/api/http.ts`:
  - A call can declare no body (e.g. `schema: null`). It resolves a typed `null` on `204`, and on any other 2xx it resolves `null` without parsing.
  - A call with a body schema that gets `204` rejects `HttpError("INTERNAL", { status: 204 })`.
  - Add `deleteTodo(id): Promise<null>`.
- `apps/web/src/api/http.test.ts`: cover a `204` resolving `null` for a no-body call and `INTERNAL` for a body call, and a `DELETE` sending no body or `Content-Type`.
- `apps/web/src/api/todo-sync.ts`: add `deleteOp()`, which applies `null`.
- `apps/web/src/api/hooks/use-delete-todo.ts` (new): `useDeleteTodo(onFailure)` on `createTodoMutation("delete", { op: deleteOp, request })`. The request is `deleteTodo(id)`, with an `HttpError` of kind `NOT_FOUND` mapped to `null` (success). It returns a stable trigger.
- `apps/web/src/features/todos/delete-failure.ts` (new): `DELETE_FAILED_COPY`, and `showDeleteFailure` (a plain toast plus the focus restore rule from the matrix).
- `apps/web/src/features/todos/row-exit.ts` (new): `animateRowExit(row, onDone)` runs a 100 ms opacity fade, then a 150 ms height/padding collapse, then calls `onDone`. With reduced motion or no `animate`, it calls `onDone` at once.
- `apps/web/src/features/todos/todo-row.tsx`:
  - Add the Row actions container with the Delete button (`aria-label` from the Description) and the capability-driven visibility.
  - The row takes an `onDelete` prop and an `exiting` flag. An exiting row is `inert`, runs `animateRowExit` on mount of the flag, and reports when it is done.
  - Update the doc comment.
- `apps/web/src/features/todos/todo-list.tsx`:
  - Keep exiting rows (the Todo as last rendered) in local state. Render `query.data` plus exiting rows not in it, sorted by `compareTodos`.
  - Drop an exiting row when its exit finishes, or when its id reappears in `query.data` (rollback).
  - The Empty state shows only when there are no rows and no exiting rows.
  - On delete:
    1. Compute the focus target first: the next non-exiting row's checkbox, else the previous one's, else the Add input.
    2. Mark the row exiting and call the delete hook.
    3. Move focus, record it for the failure restore, and announce "Todo deleted".
- `apps/web/src/api/todo-sync.test.ts`: race tests for delete during a pending toggle (ordered), delete on a pending create that fails (dropped), a toggle queued behind a failed delete (dropped), and a 404 counted as success.
- `apps/web/src/features/todos/todo-delete.test.tsx` (new): component tests covering every I/O matrix row. They also cover the accessible name, the ghost/destructive classes, tab order (checkbox then Delete) and the Empty state after the last delete. The exit animation is checked through a stubbed `HTMLElement.prototype.animate`, asserting the 100 ms and 150 ms durations and that it's skipped under reduced motion.
- `_bmad-output/implementation-artifacts/deferred-work.md`: append one entry, `source_spec: spec-2-2-complete-and-un-complete-a-todo.md`. It records that when a toggle's PATCH 404 removes a focused row, focus falls to `<body>` (EXPERIENCE.md: focus is never lost to `<body>`), and that it should reuse Story 2.3's focus-after-removal rule.

**Acceptance Criteria:**
- Given a delete succeeded, when the page reloads, then the Todo isn't listed.
- Given any delete, when it is handled, then no confirmation dialog, modal or undo appears, and exactly one announcement "Todo deleted" is made.
- Given the Empty state follows the last delete, when it appears, then the Add row doesn't move and the Empty state replaces the list only after the row's exit.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 8, false 13, maybe-false 2
- findings:
  - `[false]` `[reject]` (intent-alignment) Motion, hover reveal, reload persistence and keyboard are checked only in jsdom — resolved by a real-browser run (Chromium via playwright-core against the dev stack; see Verification): idle opacity 0 → 1 on hover, 44×44 hit area, fade then collapse sampled over ~250 ms, `DELETE` with no body or `Content-Type` → 204, focus on the next checkbox, "Todo deleted" announced, Enter on Delete works, and the Todo stays gone after a reload.
  - `[false]` `[reject]` (intent-alignment) The Delete icon turns destructive on `focus-visible`, not on any focus — keyboard focus always matches `focus-visible`, and a mouse click on Delete removes the row at once, so no user sees the difference.
  - `[false]` `[reject]` (intent-alignment) The `deferred-work.md` entry isn't in the patch — it is in the working tree (verified) and committed with this story. The reviewed diff covers `apps`/`packages` only.
  - `[low]` `[patch]` (verification-gap) No test covers a rollback during the collapse phase (collapse cancel and `overflow` reset) — added a test: finish the fade, fail the DELETE, and assert the collapse is cancelled, `overflow` is `""`, the row isn't inert and is back in order, with one toast. Removing either guard fails it.
  - `[low]` `[patch]` (verification-gap) No test checks an exiting row keeps its `compareTodos` position — added a three-row test asserting Top, Middle, Bottom while Middle exits. Removing the `.sort` fails it.
  - `[low]` `[reject]` (verification-gap, other) `movedFocus` keeps an entry per successful delete — grouped with the first blind finding below.
  - `[low]` `[reject]` (blind) `movedFocus` grows after successful deletes and holds detached elements — real but negligible: one small entry per delete in a single-user session. Clearing it on success needs a new success hook, which is more than a direct correction.
  - `[low]` `[reject]` (blind) Rollback detection by array identity misfires if an unrelated cache write lands before the removal — real but cosmetic: the row then disappears without its exit animation, and no state is wrong. A robust signal would need redesigning how exiting rows track sync state.
  - `[false]` `[reject]` (blind) A row restored after the exit finished plays the entrance animation "as if new" — the spec only asks that it reappear at its position. Expanding it in avoids a layout jump (NFR-12), and its content is its confirmed state.
  - `[false]` `[reject]` (blind) `handleDelete` picks the wrong target when `findIndex` returns -1 — can't happen: the Delete button exists only on rendered rows, and each is in `latest.current.rows`. The row still exists in the pre-click `shown` even for two clicks in one act.
  - `[false]` `[reject]` (blind) Keyboard activation isn't really tested — jsdom can't synthesize it. The real-browser run pressed Enter on a focused Delete and the Todo was deleted.
  - `[low]` `[patch]` (blind) "Resolves null without parsing" never proves parsing was skipped, and a duplicate transport test sits in the UI file — the test now spies on `json` and asserts it wasn't called, and the duplicate was removed from `todo-delete.test.tsx`.
  - `[false]` `[reject]` (blind) The `schema!` non-null assertion and overload order in `http.ts` — typecheck passes and `deleteTodo` is typed `Promise<null>`. The assertion is guarded by the `schema === null` early return, and no harm was named.
  - `[false]` `[reject]` (blind) `deferred-work.md` and the spec are missing from the diff — see the third intent-alignment row: both are in the working tree and committed here.
  - `[false]` `[reject]` (blind) A focus-restore request can outlive its moment and steal focus later — the rollback render that brings the id back also makes the row non-inert (`isRolledBack`), so the layout effect focuses it in that commit or drops the request once the id is gone from the cache.
  - `[false]` `[reject]` (blind) The Delete accessible name uses the full Description — the story's AC and EXPERIENCE.md require exactly "Delete todo: {Description}". The 40-character quote rule applies to toast copy only.
  - `[maybe-false]` `[defer]` (blind) `animateRowExit` doesn't handle `oncancel`, so a browser-cancelled animation never calls `onDone`, and `displayedRows` sorts on every render — the sort cost is negligible. The cancel path: see the deferred entry.
  - `[low]` `[reject]` (edge) `movedFocus` leak — grouped with the first blind finding.
  - `[false]` `[reject]` (edge) A delete queued behind a failing toggle is silently discarded and the row returns — this is the specified FR-10 protocol: after a failure, queued actions for that Todo are dropped, with one toast per failed action (EXPERIENCE.md Row-level states).
  - `[low]` `[reject]` (edge) A failure up to 10 s later pulls focus out of the Add input while the user types (the only-Todo case) — this follows EXPERIENCE.md's rule literally ("If focus had moved on because of the delete, it goes back…"). The text isn't lost, and an idle heuristic would add complexity beyond a direct fix.
  - `[maybe-false]` `[defer]` (edge) A cancelled or never-finishing exit animation leaves the row inert and blocks the Empty state — no path was shown where the browser cancels a WAAPI animation on this attached element. If it happens, it is medium, so it is deferred.
  - `[false]` `[reject]` (edge) A misrouted 404 counts as success — every unknown route returns the same envelope, and the path comes only from `todoPath`, so a misroute is a code bug caught by tests, not a runtime case.
  - `[false]` `[reject]` (edge) VALIDATION on a malformed id rolls back and retries forever — ids are client-generated UUIDv7s or server-listed UUIDs, so the DELETE can't carry a malformed id, and there is no automatic retry.

## Design Notes

The delete op removes the row from the cache immediately, which is the AD-12 optimistic update, so the exit motion needs a copy of the row that outlives the cache entry. `TodoList` keeps these "exiting" copies only for animation. They are never sync state and never written to the cache. That keeps rollback simple. If the DELETE fails, the helper re-renders the confirmed Todo, its id reappears in `query.data`, and the exiting copy is dropped, even mid-animation, so the real row is back at its `compareTodos` position.

Focus restore on failure is limited to the case where the delete's own focus move is still in effect. That meets "if the delete had moved focus" without taking focus from someone who has since moved on (for example, typing in the Add row).

## Verification

**Commands:**
- `pnpm --filter @todos/web test && pnpm --filter @todos/shared test` -- expected: all pass, none skipped
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: all exit 0

**Manual checks (if no CLI):**
- Real browser against the dev stack (http://localhost:18080, `docker compose restart web` first if `packages/shared` changed):
  - Delete a throwaway Todo. Watch the fade then the collapse, and check focus lands on the neighbour.
  - Reload: the Todo is gone.
  - With the hover-capable viewport, the Delete button appears on row hover and focus.

## Auto Run Result

**Summary:** Each row now has Row actions on the right, containing a Delete button:
- A ghost button with `Trash2` at 16 px in a 44 px hit area, `muted-foreground`, turning `destructive` on hover or focus-visible. Its name is "Delete todo: {Description}".
- On hover-capable fine pointers it is hidden (opacity 0, still tabbable) until the row is hovered or has focus inside. Elsewhere it is always visible.

Deleting:
- Applies `deleteOp` at once through `useDeleteTodo` on `createTodoMutation("delete")` (a `404` counts as success).
- Keeps an inert exiting copy for a 100 ms fade, then a 150 ms collapse (instant under reduced motion).
- Moves focus to the next row's checkbox, else the previous one's, else the Add input, and announces "Todo deleted".
- On failure, restores the row at its `compareTodos` position with one toast, and returns focus to it if the delete's own focus move is still in effect.

`http.ts` resolves a typed `null` for no-body calls, and a `204` on a body call is `INTERNAL`.

**Files changed:**
- `apps/web/src/api/http.ts`: `schema: null` no-body calls, 204 → `null`, 204-with-body → `INTERNAL`, `deleteTodo`.
- `apps/web/src/api/http.test.ts`: 204/no-body tests.
- `apps/web/src/api/todo-sync.ts`: `deleteOp`.
- `apps/web/src/api/todo-sync.test.ts`: delete race tests.
- `apps/web/src/api/hooks/use-delete-todo.ts` (new): delete hook with 404 as success.
- `apps/web/src/features/todos/delete-failure.ts` (new): the failure toast and the focus-restore rule.
- `apps/web/src/features/todos/row-exit.ts` (new): fade-then-collapse exit, cancellable.
- `apps/web/src/features/todos/todo-row.tsx`: Row actions and the Delete button, capability-driven visibility, exiting rows.
- `apps/web/src/features/todos/todo-list.tsx`: exiting rows, focus after delete, Empty state after the exit.
- `apps/web/src/features/todos/create-failure.ts`: `focusAddRow()`.
- `apps/web/src/features/todos/todo-delete.test.tsx` (new): component tests for every I/O matrix row.
- `_bmad-output/implementation-artifacts/deferred-work.md`: Story 2.2's PATCH-404 focus residual.

**Review findings:** 23 in total. 3 patched (all low, test gaps: rollback during the collapse, exiting-row position, and the "without parsing" spy plus removing the duplicate test), 1 deferred (the `oncancel` path, medium unverified; two maybe-false rows grouped), and 19 rejected (5 low, 13 false; the reasons are in the Review Triage Log).

**Follow-up review recommendation:** `false`. Patched this pass: high 0, medium 0, low 3.

**Verification:**
- `pnpm --filter @todos/web test`: 182 passed across 11 files, none skipped.
- `pnpm --filter @todos/shared test`: 46 passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` and `prettier --check apps packages` all exit 0.
- Matrix audit: every I/O row has a passing test.
- Real-browser check (Chromium via playwright-core, dev stack at :18080, three throwaway Todos, cleanup left the Todo count unchanged):
  - Delete is at opacity 0 when idle and 1 on row hover, with a 44×44 hit area.
  - Exit samples every 40 ms (opacity/height): `1/66 0.31/66 0.04/66 0/61 0/49 0/22 gone`, so the fade completes within about 100 ms and the collapse follows.
  - `DELETE` with no body or `Content-Type` → 204, focus on the next row's checkbox, and "Todo deleted" in the live region.
  - Enter on a focused Delete deletes, and focus goes to the next row.
  - After a reload the deleted Todos are gone.

**Residual risks:**
- An unrelated cache write landing between the click and the delete's cache removal makes the row disappear without its exit animation (cosmetic).
- `movedFocus` keeps one small entry per successful delete for the session.
- A failure that arrives while the user types in the Add input (the only-Todo case) moves focus to the restored row, following the UX rule literally.
- The `oncancel` exit path is deferred.
