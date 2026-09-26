---
title: 'Per-QueryClient failure controllers, and the remaining failure-handler duplication (Epic 2 retro F6 item 4)'
type: 'refactor'
created: '2026-09-26'
status: 'done'
baseline_commit: '9ea08f4366d99f191137bb03c276c0c9089dfeb6'
route: 'dispatch'
review_loop_iteration: 0
context: []
warnings: ['oversized']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the web failure handlers find their UI through module-level singletons: the add-row, delete-focus and edit controllers, and the `movedFocus` map. They are last-registered-wins, while the sync state is kept per QueryClient. With two app trees mounted at once, a failure in one is handled by the other's UI. The handlers also repeat themselves:
- the register/unregister body (×3)
- the "focus was free" check (×3)
- the Retry-toast-and-announce block (×2)
- different ways of receiving UI state and placing announcements (Epic 2 retro F6, adversarial #8)

**Approach:** keep the controllers and the moved-focus map per QueryClient, using a `WeakMap<QueryClient, …>` registry (the pattern `todo-sync.ts` uses). Each failure now carries its `queryClient`, so a handler looks up its own tree's controllers. Then dedupe:
- one generic register-with-identity-guard
- one focus-was-free helper
- one Retry-toast helper
- one stated rule for UI state and announcements

**Decisions (human, 2026-09-26):** do the scoping and all of the remaining duplication together, as one change.

## Boundaries & Constraints

**Always:**
- **Single tree unchanged.** With one app tree, behaviour is unchanged. Every existing unit, stack and e2e test passes **without edits**, including the StrictMode "focus after a removal" cases. That is: effects run register, unregister, register, and the identity guard keeps the live registration.
- **Two trees are isolated.** With two `AppProviders` trees, each with its own QueryClient, mounted at once:
  - a failure's controller lookup (add row, edit reopen, delete focus, dropped-delete resend) uses only its own tree's controllers
  - `movedFocus` is per client
- **UI state and announcements have one rule:**
  - Every handler that needs UI state gets it from its client's controllers. Toggle stays toast-only, because it needs none.
  - Success announcements stay in the component that owns the action.
  - Retry announcements go through the one Retry-toast helper.
- User-facing strings, toast and announce behaviour, timings and DOM stay unchanged.
- Existing export names and paths that tests import stay: `showToggleFailure` (`toggle-failure.ts`) and `isTooLong` (`create-failure.ts`).

**Never:**
- Don't scope the Sonner toast store or the announce store per client. They stay global, which is out of scope.
- Don't change `createTodoMutation`'s behaviour, apart from adding `queryClient` to the failure object.
- Don't change the hook signatures of `useCreate`/`useToggle`/`useEdit`/`useDeleteTodo`.
- Don't edit any existing test file.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single tree unchanged | the full existing suites | `pnpm test`, `pnpm test:stack` and `pnpm test:e2e` pass with no test edits, and each existing web file keeps its count | — |
| Two trees, create fails in A | trees A and B (own clients) mounted; A's create POST 500s while A's input is empty | the typed text returns to A's input; B's input is untouched | injected |
| Two trees, delete fails in A | a delete in A 500s after focus moved | the row reappears in A, and focus is restored in A only; B's focus and rows are untouched | injected |
| Two trees, edit fails in A | an edit in A 500s | A's field reopens with the attempt; B has no open edit | injected |
| Unmount one tree | B unmounts, then A's write fails | A's controllers still handle it (B's cleanup doesn't clear A's registration) | — |
| StrictMode double mount | a tree under `<StrictMode>` | the live registration survives register, unregister, register | identity guard |

</frozen-after-approval>

## Code Map

- `apps/web/src/api/todo-sync.ts`:
  - `TodoMutationFailure<TVars>` (:187-199) is `{vars, error, retry, dropped, state}`. Add `queryClient: QueryClient`.
  - `config.onFailure({...})` (:305) already has `queryClient` in scope, from `options(queryClient, vars)` (:257).
  - The pattern to copy: `syncByClient = new WeakMap` (:66) and `getTodoSync` get-or-create (:72-79).
- **Singletons to replace:**
  - `create-failure.ts:31` `controller: AddRowController`: registered by `AddRow` (`add-row.tsx:53-67`, `useEffect(() => registerAddRowController({...}), [])`). Read by `showCreateFailure` (:65) and `focusAddRow()` (:42). `focusAddRow` also has non-failure callers: `todo-list.tsx:120` (delete) and `use-list-focus.ts:75`.
  - `delete-failure.ts:23` `controller: DeleteFocusController` (registered at `todo-list.tsx:90-97`) and `:36` `movedFocus` Map (`recordDeleteFocus` at `todo-list.tsx:121`). Read by `deleteFailed` (:51-54) and `withDroppedDelete` (:90-91).
  - `edit-failure.ts:33` `controller: EditController`: registered by `use-edit-machine.ts:68-77`, read by `showEditFailure` (:60).
  - The identical register body appears 3 times: `create-failure.ts:34-39`, `delete-failure.ts:26-33` and `edit-failure.ts:36-41`, each `controller = next; return () => { if (controller === next) controller = null }`.
- **Duplication to fold:**
  - Focus-was-free (×3): `create-failure.ts:70-73` (`focusIsFree() || addRow.containsFocus()`), `edit-failure.ts:63` (`focusIsFree() || list.containsFocus(vars.id)`) and `delete-failure.ts:53-54` (`focusIsFree() || activeElement === moved`). `focusIsFree` is in `free-focus.ts:10`.
  - Retry + announce (×2): `create-failure.ts:78-91` and `edit-failure.ts:69-80`, each `showErrorToast(copy, { action: { label: RETRY_LABEL, onClick: () => { retry(); announce("…") } } })`.
- Handlers are module-level constants passed to the hooks: `add-row.tsx:19` and `todo-list.tsx:35-36,72`. The components have `useQueryClient()` for registration.
- Providers: `app-providers.tsx:22-32` (an optional `queryClient` prop) and `test/render.tsx:13-21` `renderWithProviders`. Toast and announce are global stores.
- Tests: none imports the register functions or singletons. The StrictMode case is `todo-delete.test.tsx:727-766`. No test mounts two providers yet.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/api/todo-sync.ts` -- add `queryClient` to `TodoMutationFailure` and pass it at the `onFailure` call. -- lookup key.
- [x] `apps/web/src/features/todos/failure-controllers.ts` (new) -- `getFailureControllers(qc)`, get-or-create from a `WeakMap<QueryClient, { addRow, deleteFocus, edit, movedFocus }>`, and one generic `registerController(qc, slot, next)` with the identity guard. -- scoping plus the ×3 register dedupe.
- [x] `create-failure.ts`, `delete-failure.ts`, `edit-failure.ts` + their registrars (`add-row.tsx`, `todo-list.tsx`, `use-edit-machine.ts`, `use-list-focus.ts`):
  - Handlers read `failure.queryClient`'s controllers.
  - `register*`, `recordDeleteFocus` and `focusAddRow` take the QueryClient; registrars get it with `useQueryClient()`.
  - The non-failure `focusAddRow` callers pass their client.

  -- scoping.
- [x] `free-focus.ts` -- add `focusIsFreeOr(check: () => boolean)` and use it at the 3 sites. -- dedupe.
- [x] `apps/web/src/features/todos/retry-toast.ts` (new) -- `showRetryToast(copy, retry, announcement)`, used by the create and edit failures, with identical strings, timings and toast options. -- dedupe.
- [x] Module docs (the head comment of `failure-controllers.ts`) -- state the UI-state and announce rule from Always. -- one stated rule.
- [x] `apps/web/src/features/todos/two-trees.test.tsx` (new) -- the Two trees ×3 and Unmount-one-tree matrix rows. Render two `AppProviders` trees with their own clients in one document, each with `AddRow` + `TodoList` in its own container, and use `within(container)` queries. -- the matrix.

**Acceptance Criteria:**
- Given the change, when I run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:stack` and `pnpm test:e2e`, then all pass, and no pre-existing test file shows up in `git diff`.
- Given the web source, when I grep for a module-level `let controller` or `const movedFocus` in the failure modules, then there are none.
- Given the failure handlers, when I read them, then the register body, the focus-was-free check and the Retry-toast block each exist once.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 17, false 0, maybe-false 0
- `[medium]` `[patch]` (verification-gap) `focusAddRow` per tree has no two-tree test. — Fixed: new case — both trees start with one Todo, it's deleted in A, and A's input has focus while B's doesn't. The implementer confirmed the test fails against a shared lookup.
- `[low]` `[defer]` (verification-gap) The dropped-delete resend has no two-tree test. — Filed disposition was defer: both trees share `fetchMock`, so the DOM can't tell which client resent, and the check needs per-client sync assertions. Logged in `deferred-work.md`.
- `[low]` `[patch]` (blind) `edit-failure.ts` import order. — Fixed: the `QueryClient` type import moved to the top with the other external imports.
- `[low]` `[defer]` (blind) The dropped-delete path has no two-tree test. — Same root cause as the verification-gap resend row, deferred with it.
- `[low]` `[patch]` (blind) `focusAddRow` has no two-tree test. — Same root cause as the verification-gap `focusAddRow` row, fixed there.
- `[low]` `[reject]` (blind) Nothing asserts the new `queryClient` field on the failure object. — Adding it would mean editing `todo-sync.test.ts`, which this spec forbids. The two-tree tests prove the lookup uses the failing client.
- `[low]` `[defer]` (blind) `movedFocus` keeps an entry for every successful delete. — This predates the change (the old module-level map had the same behaviour); the map is now per client and freed with it. Logged in `deferred-work.md`.
- `[low]` `[reject]` (blind) `focusIsFreeOr` reads like it short-circuits, but always runs `check()`. — This is intentional: both values are read before the handler changes the DOM, as the original create code did. The comment says so.
- `[low]` `[reject]` (blind) `getFailureControllers` returns writable slots. — The module is internal and every writer goes through `registerController`. A `Readonly` view is a style change.
- `[low]` `[reject]` (blind) There's a type-only import cycle through the controller interfaces. — Type imports are erased (`verbatimModuleSyntax`), so there's no runtime cycle.
- `[low]` `[reject]` (blind) Some two-tree assertions can never fail (B's rows, B's focus). — They're redundant but harmless. The discriminating assertions (A's restore, focus and reopen) are present, and the implementer showed the tests fail against the old singletons.
- `[low]` `[patch]` (blind) The "B unmounts" test only checks the positive outcome. — Fixed: it also asserts no Retry button appears.
- `[low]` `[reject]` (blind) Nothing tests that A's own controllers unregister on unmount. — The identity-guarded unregister is exercised by the existing unmount tests (`todo-edit.test.tsx:364`) and the StrictMode cases.
- `[low]` `[reject]` (blind) `showRetryToast` announces success before the retry settles. — This is the existing behaviour, moved unchanged, and this spec keeps announce behaviour fixed.
- `[low]` `[patch]` (blind) Stale comments cite `focusIsFree`; also the spec file isn't in the diff. — The comments are fixed. The spec was left out of the review diff on purpose.
- `[low]` `[defer]` (edge-case) `movedFocus` is never cleared on delete success. — Same root cause as the blind `movedFocus` row, deferred with it.
- `[low]` `[reject]` (edge-case) A later registrant on the same client unmounting first nulls the slot. — This is the same last-registered-wins semantics as before, now within one client, where the app mounts exactly one Add row and one Todo List.
- `[low]` `[reject]` (edge-case, claim) `useEditMachine` and `useListFocus` take the client as a parameter instead of calling `useQueryClient()`. — `TodoList` gets the client with `useQueryClient()` and passes it down, so the registrar is still the tree's own client.

## Design Notes

- **Why add `queryClient` to the failure, rather than binding handlers per client:** the handlers are module-level constants whose identity keeps each hook's memo and trigger stable (the `useTodoMutation` contract). Carrying the client on the failure keeps them constant.
- **Two trees still share toasts and announcements.** Sonner and the announce store are global. The two-tree tests therefore assert controller-driven effects (input text, focus, reopened field, rows), not toast counts.

## Verification

**Commands:**
- `cd apps/web && npx vitest run --reporter=json --outputFile=<tmp>` -- expected: every pre-existing file's count equals the pre-change baseline (297 across 18 files), plus the new two-tree tests. All pass.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. Use a throwaway `TEST_DATABASE_URL` Postgres, stopped with `docker rm -f -v`.
- `pnpm test:stack` and `pnpm test:e2e` -- expected: all pass. The owner's dev stack stays untouched.
- `grep -nE '^(let|const) (controller|movedFocus)' apps/web/src/features/todos/*-failure.ts` -- expected: no hits.
