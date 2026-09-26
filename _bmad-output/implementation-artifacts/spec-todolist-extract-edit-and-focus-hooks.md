---
title: 'TodoList refactor: extract the edit state machine, focus handling and exiting rows into hooks (Epic 2 retro F5)'
type: 'refactor'
created: '2026-09-26'
status: 'done'
baseline_commit: '375e17791df351235cac3725c29b19303eeeee13'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-25.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `apps/web/src/features/todos/todo-list.tsx` has become the web app's god component (470 lines, Epic 2 retro F5). It holds the single-open-edit state machine, both focus mechanisms (focus after a removal, restoring focus after a failed delete), the exiting-row bookkeeping, the delete flow, the write hooks and two controller registrations, all behind a web of shared refs and effects. Every UI change lands in it.

**Approach:** a behaviour-preserving extraction into three hooks, each in its own module next to the component:
- exiting rows
- list focus
- the edit state machine

`TodoList` then only composes them, runs the delete flow and renders.

**Decisions (human, 2026-09-26):** only F5 is in scope. F6 (write-path consolidation) and F7 (shared test helpers) are split off and logged in `deferred-work.md` as separate builds.

## Boundaries & Constraints

**Always:**
- **No behaviour change.** Every existing unit, stack and e2e test passes **without edits**.
- **Stable callbacks.** Every callback handed to the memoised `TodoRow`, and every effect dependency, stays stable across renders (`useCallback`/refs, as now).
- **The subtle patterns are kept exactly:**
  - the render-time pruning of exiting rows when the list identity changes
  - the render-time close of an edit whose row is gone or exiting
  - `openEdit` written immediately, then synced every render
  - one "latest render" source of `list`/`rows` shared by edit, focus and delete
  - the removal focus target computed from the rows **before** the row is marked exiting
  - the single layout effect that resolves removal focus and the pending `focusRowId`
  - `listLoaded` set in a passive effect, with its ordering relative to the rows' layout effects
- **Hook order:** exiting rows, then list focus, then the edit machine.

**Never:**
- Don't change `TodoRow`'s props interface, `ListState`, `list-states.tsx`, `edit-field.tsx` or `todo-row.tsx`.
- Don't change the write hooks (`api/hooks/*`), `todo-sync.ts`, or the failure modules (`create-`, `delete-`, `edit-`, `toggle-failure.ts`). That is F6.
- Don't edit any existing test file. That is F7.
- Don't change any copy, announcement, timing or DOM structure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Behaviour unchanged | the full existing suites | `pnpm test` (all web suites), `pnpm test:e2e` and `pnpm test:stack` pass with no test edits | — |
| Removal focus targets | a row removed from `[A, B, C]`: removing the middle, the last, and the only row; plus rows already exiting | next live row's checkbox, else the previous, else the Add input; exiting rows are skipped | — |
| Exiting-row display | a list without a deleted row, a row still exiting, and a delete rolled back (row back in the list) | the exiting row keeps its place until its exit is done; a rolled-back row is shown live, not as exiting | — |
| Pruning | the list identity changes while rows are exiting | entries whose row is back in the list, or whose exit completed, are pruned | — |

</frozen-after-approval>

## Code Map

- `apps/web/src/features/todos/todo-list.tsx`:
  - **Exiting rows:** types `ExitingRow`/`ExitingRows`/`DisplayedRow` (:36-49); helpers `isRolledBack` (:55), `displayedRows` (:67) and `pruneExiting` (:82); state `exiting`/`prunedFor` (:175-176) with the render-time prune (:177-180) and `rows` (:181); `handleExitDone` (:352).
  - **Focus:** `removalFocusTargets` (:99), `firstCheckbox` (:112), `rowOf` (:396), `checkboxOf` (:405); `regionRef` (:171); the `latest` ref (:207-210); `focusRowId` (:213), `focusRemoval` (:216) and the focus counter (:220); the combined layout effect (:232-257); `handleFocusedRemoval` (:299); the delete focus-controller registration (:221-231, `focusRow` plus `resendDelete` via `deleteTodo`).
  - **Edit:** `OpenEdit` (:131); `edit` (:183) with the render-time close (:185-187); the `openEdit` and `draft` refs (:190-195); `setOpenEdit` (:196), `closeEdit` (:307), `handleSaveEdit` (:314), `handleEdit` (:328, which needs `regionRef`, `rowOf` and `latest.list`), `handleDraft` (:348); the edit-controller registration (:259-268).
  - **Stays in `TodoList`:** `handleDelete` (:276-295, which spans exiting, focus and write), `query`/`retry`/`handleRetry` (:165-167, :360), `listLoaded` (:172, :272-274, `RowEntranceContext` :374), the region div (:368-373), and `ListState` (:414-470).
- Imports to keep: `focusAddRow` (`create-failure.ts`); `registerDeleteFocusController`, `recordDeleteFocus`, `withDroppedDelete` (`delete-failure.ts`); `registerEditController` (`edit-failure.ts`); `focusIsFree` (`free-focus.ts`); `RowEntranceContext` (`row-entrance.ts`).
- No test imports anything internal from `todo-list.tsx`, only `TodoList`. These existing suites pin the behaviour: `todo-edit.test.tsx`, `todo-delete.test.tsx` (including the StrictMode "focus after a removal" cases at :773), `todo-row.test.tsx:333`, `todo-list.test.tsx:310`, and `add-row.test.tsx:428`. The e2e specs are `core-flows` (the Edit and Delete-focus tests), `keyboard.spec.ts` and `rollback.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/features/todos/use-exiting-rows.ts` (new) -- the exiting types and pure helpers (exported for tests); `useExitingRows(list)` returns `rows`, `markExiting(row)` and `handleExitDone`, and keeps the render-time prune. -- (c)
- [x] `apps/web/src/features/todos/use-list-focus.ts` (new) -- `removalFocusTargets` and the DOM helpers (exported); `useListFocus({ latest, queryClient })` owns `regionRef`, `focusRowId`, `focusRemoval`, the counter and the combined layout effect, and returns `regionRef`, `handleFocusedRemoval`, `setRemovalFocus(row, targets)`, `requestRowFocus(id)` and `containsFocus(id)`. -- (b)
- [x] `apps/web/src/features/todos/use-edit-machine.ts` (new) -- `useEditMachine({ rows, latest, regionRef, editTodo })` owns `edit` (with the render-time close), the `openEdit`/`draft` refs, `closeEdit`, `handleSaveEdit`, `handleEdit`, `handleDraft` and the edit-controller registration. -- (a)
- [x] `apps/web/src/features/todos/todo-list.tsx` -- compose the three hooks in the order exiting → focus → edit. Keep `handleDelete`, the delete focus-controller registration (built on the focus hook's returns), the query and retry, `listLoaded` and `ListState`. Hold one shared `latest` ref. Target: well under 250 lines. -- (composition)
- [x] `apps/web/src/features/todos/use-exiting-rows.test.ts`, `use-list-focus.test.ts` (new) -- unit tests of the exported pure helpers covering the Removal focus, Exiting-row display and Pruning matrix rows. -- matrix coverage.

**Acceptance Criteria:**
- Given the refactor, when I run `pnpm lint`, `pnpm typecheck` and `pnpm test`, then all pass, and `git diff` shows no change to any pre-existing test file.
- Given the refactor, when I run `pnpm test:e2e`, then all 99 tests pass (Chromium, Firefox, WebKit, mobile, quality, durability).
- Given `todo-list.tsx` after the change, when I read it, then it only composes the three hooks, the delete flow and the rendering, and is under 250 lines.

## Implementation Notes

- `use-list-focus.ts` returns only `regionRef`, `handleFocusedRemoval` and `requestRowFocus`. `setRemovalFocus` and `containsFocus` had no caller: `handleDelete` moves focus at once, and `handleFocusedRemoval` sets the removal inside the hook. The DOM helpers (`rowOf`, `checkboxOf`, `firstCheckbox`) live in the neutral `list-dom.ts`. The edit machine's `containsFocus` uses `rowOf` with `regionRef`, which keeps the `useEditMachine({ rows, latest, regionRef, editTodo })` signature.
- `markExiting` takes `{ todo, from }`, and `done: false` is set inside the hook. `LatestRender` (the shape of the shared `latest` ref) lives in `use-exiting-rows.ts`.
- Layout-effect order changed from (openEdit sync, latest sync, focus) to (latest sync, focus, openEdit sync), as the mandated hook order requires. This is harmless: the handlers write `openEdit` at once, and the focus effect never reads it. The sync only catches the render-time close.
- `todo-list.tsx` is 221 lines.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 12, false 3, maybe-false 0
- `[false]` `[reject]` (blind) The spec isn't in the diff. — This build's own spec was left out of the review diff on purpose, and it is committed with the change.
- `[false]` `[reject]` (blind) The new deferred-work entries say `source_spec: none`. — That is the split format step-01 prescribes for goals deferred before any spec exists; the split happened in step 1.
- `[low]` `[reject]` (blind) The deferred-work evidence cites bare line numbers that will go stale. — Each line reference sits next to the symbol it names (`notFoundMeansDeleted`, `deleteTodoRequest`, `stubAnimate`), so it stays findable.
- `[low]` `[reject]` (blind) `useEditMachine` has no direct hook tests. — It is covered through the real `TodoList` by `todo-edit.test.tsx`: save, switch, cancel, failure reopen, `containsFocus` and robustness (the verification-gap review confirmed this). Direct `renderHook` tests would be new scope.
- `[low]` `[reject]` (blind) `rowOf`, `checkboxOf` and `firstCheckbox` have no direct tests. — They are exercised through the focus-after-removal and delete-failure suites, which render the real list.
- `[low]` `[patch]` (blind) The edit hook imports a DOM helper from the focus hook's module. — Fixed: `rowOf`, `checkboxOf` and `firstCheckbox` moved to `list-dom.ts`, and both hooks import them from there.
- `[low]` `[reject]` (blind) The "latest render" ref is split across three places. — The frozen spec requires one shared `latest` ref held by `TodoList`, fed to the focus hook and the edit hook.
- `[low]` `[reject]` (blind) `useEditMachine` reads both `rows` and `latest`. — This preserves the original behaviour: the render-time close uses this render's `rows`, and handlers use the committed `latest`. Changing it would alter timing.
- `[low]` `[patch]` (blind) The `useEditMachine` doc comment misdescribes `handleEdit`. — Fixed: the comment now describes the explicit commit of the open draft.
- `[low]` `[patch]` (blind) A test name contradicts its assertion. — Fixed: renamed to "sorts the list by compareTodos when nothing is exiting".
- `[low]` `[reject]` (blind) More `displayedRows`/`pruneExiting` edge cases could be tested. — The matrix rows are covered, and the behaviour suites cover several exiting rows at once and rollback.
- `[low]` `[patch]` (blind) `isRolledBack` is exported unnecessarily. — Fixed: it is no longer exported.
- `[low]` `[reject]` (blind) The `editTodo` parameter type uses `ReturnType<typeof useEditTodo>`. — Exporting a named type would edit `api/hooks`, which is off limits for this build (F6 scope).
- `[false]` `[reject]` (edge-case) The layout effects now sync `openEdit` after the focus effect, so a stale save could run. — The focus effect only moves focus from `<body>`, or into a row after a failed delete. `openEdit` is stale only in the render that closed that edit, whose field is already gone. A focused, open edit field is never blurred while the ref is stale, and the verification-gap review traced the same result.
- `[low]` `[reject]` (edge-case, claim) `useListFocus` returns fewer functions than the spec listed (`setRemovalFocus`, `containsFocus`). — Unused API was left out, and the edit machine checks containment through `rowOf`. This is recorded in Implementation Notes. The fix would be to edit this build's spec or add dead code.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass (throwaway `TEST_DATABASE_URL` Postgres, stopped with `docker rm -f -v`).
- `git diff --stat <baseline> -- 'apps/web/src/**/*.test.ts*'` -- expected: only the new hook test files.
- `pnpm test:e2e` -- expected: 99 passed and 2 expected skips. The owner's `todos` dev stack keeps running untouched.
- `wc -l apps/web/src/features/todos/todo-list.tsx` -- expected: < 250.
