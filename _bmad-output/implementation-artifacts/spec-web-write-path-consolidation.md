---
title: 'Web write-path consolidation: one useTodoMutation, one isNotFound check, a shared failure-copy module (Epic 2 retro F6, items 1-3)'
type: 'refactor'
created: '2026-09-26'
status: 'done'
baseline_commit: '47df1c698d5f9141cb1480963ac908b5e0f11135'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the web write path repeats itself (Epic 2 retro F6):
- **Four identical hook bodies.** `use-create-todo.ts`, `use-toggle-todo.ts`, `use-delete-todo.ts` and `use-edit-todo.ts` share the same `useQueryClient` + `useMemo(createTodoMutation…)` + `useCallback` body.
- **Three copies of one check.** "Is this a 404?" is written out in `notFoundMeansDeleted` (`todo-sync.ts`), in `deleteTodoRequest` (`use-delete-todo.ts`) and in `edit-failure.ts`.
- **Misplaced shared copy.** The copy that the create and edit failures share lives in `create-failure.ts`.

**Approach:** a behaviour-preserving consolidation in three parts:
- One generic `useTodoMutation` behind the four hooks, which stay as thin wrappers.
- One `isNotFound` predicate used by all three 404 sites, each keeping its own handling.
- A neutral `failure-copy.ts` for the shared strings and the quote rule.

**Decisions (human, 2026-09-26):**
- F6 is split. Items 1–3 are done here.
- Item 4, per-QueryClient failure controllers, is its own build, logged in `deferred-work.md`, because it is the only part that changes behaviour.
- The two 404 transformations stay different. For toggle and edit a 404 goes down the failure path: the generation bumps, `confirmed` becomes `null`, queued ops are dropped and `onFailure` runs. For delete a 404 is a success that resolves `null`. Only the predicate is shared.

## Boundaries & Constraints

**Always:**
- **No behaviour change.** Every existing unit, stack and e2e test passes **without edits**.
- **Paths and names stay.** Every current export name and module path stays. Tests import these directly:
  - `useToggleTodo`/`ToggleTodoVars` from `api/hooks/use-toggle-todo`
  - `deleteTodoRequest` from `api/hooks/use-delete-todo`
  - `notFoundMeansDeleted` from `api/todo-sync`
  - `isTooLong` from `features/todos/create-failure`
- **Hook contract.** Each hook keeps its signature, `(onFailure) => (vars) => void`, and its exported `XVars`/`XFailure` types. The returned function stays stable (same memo and callback dependencies), and each hook's `op`, `request` and `failureState` stay module-level constants, so the memo keeps depending only on `onFailure`.
- Lint and typecheck pass: `fetch` only in `http.ts`, `noUnusedLocals`, `verbatimModuleSyntax`.

**Never:**
- Don't touch the failure controllers or singletons (`register*Controller`, `recordDeleteFocus`, `focusAddRow`). That is item 4.
- Don't change any user-facing string, announcement or toast behaviour.
- Don't move `isTooLong` out of `create-failure.ts` (it is error classification, not copy).
- Don't edit any existing test file.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Behaviour unchanged | the full existing suites | `pnpm test`, `pnpm test:stack` and `pnpm test:e2e` pass with no test edits; the web per-file counts equal the pre-change baseline plus only the new `isNotFound` tests | — |
| `isNotFound` | an `HttpError` of kind `NOT_FOUND`; other `HttpError` kinds; a plain `Error`; a non-error value | `true` for the first; `false` for the rest | — |
| Toggle or edit 404 | a PATCH answers 404 | failure path exactly as now: the row is removed, `state: null`, `onFailure` called | existing |
| Delete 404 | a DELETE answers 404 | success path exactly as now: resolves `null`, no `onFailure`, no toast | existing |

</frozen-after-approval>

## Code Map

- `apps/web/src/api/hooks/use-create-todo.ts:26`, `use-toggle-todo.ts:27`, `use-edit-todo.ts:29`, `use-delete-todo.ts:39` -- each is `(onFailure) => { qc = useQueryClient(); mutation = useMemo(() => createTodoMutation<V>(kind, {op, request, failureState?, onFailure}), [onFailure]); return useCallback((v) => void mutation.mutate(qc, v), [mutation, qc]) }`. The `Vars` interfaces are at :12. `op`/`request`/`failureState` per kind:
  - create: `createOp(id, description)` / `createTodo` / none.
  - toggle: `toggleOp(completed)` / `updateTodo(id, {completed})` / `notFoundMeansDeleted`.
  - edit: `editOp(description)` / `updateTodo(id, {description})` / `notFoundMeansDeleted`.
  - delete: `deleteOp` / `deleteTodoRequest` (exported, :22-29) / none.
- `apps/web/src/api/todo-sync.ts`:
  - `TodoMutationConfig` (:201) and `createTodoMutation<TVars>(kind, config)` (:253). Read-only.
  - `notFoundMeansDeleted` (:221) has the inline `instanceof HttpError && kind === "NOT_FOUND"`.
- `apps/web/src/api/http.ts` -- `HttpError` with `.kind`. Add `isNotFound(error: unknown): error is HttpError` here.
- `apps/web/src/features/todos/edit-failure.ts:63` -- `const notFound = error instanceof HttpError && error.kind === "NOT_FOUND"`. Drop the `HttpError` import if it becomes unused. It also imports `isTooLong`, `quoteDescription`, `RETRY_LABEL` and `TOO_LONG_COPY` from `create-failure` (:6-11).
- `apps/web/src/features/todos/create-failure.ts` -- `TOO_LONG_COPY` (:12), `RETRY_LABEL` (:14), `QUOTE_MAX` (:17) and `quoteDescription` (:52) move to `failure-copy.ts`. `CREATE_RESTORED_COPY` (:10) and `isTooLong` (:59) stay.
- Callers of the hooks stay as they are: `add-row.tsx:51`, `todo-list.tsx:71-73,179`, `todo-row.tsx:6` and `use-edit-machine.ts:11,44` (`ReturnType<typeof useEditTodo>`).
- Tests that import by path, so the paths must stay: `features/todos/todo-delete.test.tsx:7`, `api/todo-sync.test.ts:6,17` and `api/http.contract.test.ts:4`. The tests hard-code the copy strings, so moving the constants doesn't break them.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/api/hooks/use-todo-mutation.ts` (new) -- `useTodoMutation<V extends { id: string }>(kind, config: Omit<TodoMutationConfig<V>, "onFailure">, onFailure)`, with the exact memo and callback body of the four hooks. -- item 1.
- [x] `apps/web/src/api/hooks/use-{create,toggle,edit,delete}-todo.ts` -- each defines a module-level config constant and becomes `export function useXTodo(onFailure) { return useTodoMutation("x", X_CONFIG, onFailure) }`. `Vars`/`Failure` types and `deleteTodoRequest` stay exported where they are. -- item 1.
- [x] `apps/web/src/api/http.ts` + `api/todo-sync.ts` + `api/hooks/use-delete-todo.ts` + `features/todos/edit-failure.ts` -- add `isNotFound`. Use it in `notFoundMeansDeleted` (`isNotFound(e) ? null : undefined`), in `deleteTodoRequest` (`catch (e) { if (isNotFound(e)) return null; throw e }`) and at `edit-failure.ts:63`. -- item 2.
- [x] `apps/web/src/api/http.test.ts`, or a new `apps/web/src/api/is-not-found.test.ts` -- add the `isNotFound` matrix row. Adding a test is allowed; editing existing tests is not, so put it in a new file if the existing file would need changes. -- matrix.
- [x] `apps/web/src/features/todos/failure-copy.ts` (new) + `create-failure.ts` + `edit-failure.ts` -- move `TOO_LONG_COPY`, `RETRY_LABEL`, `QUOTE_MAX` and `quoteDescription`. `create-failure.ts` imports them from the new module. `edit-failure.ts` imports the copy from `failure-copy` and `isTooLong` from `create-failure`. -- item 3.

**Acceptance Criteria:**
- Given the change, when I run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:stack` and `pnpm test:e2e`, then all pass, and no pre-existing test file shows up in `git diff`.
- Given the four hook files, when I read them, then each only declares its kind's config and delegates to `useTodoMutation`.
- Given the web source, when I grep for `kind === "NOT_FOUND"`, then it appears only inside `isNotFound`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 13 findings — high 0, medium 0, low 13, false 0, maybe-false 0 (verification-gap: none)
- `[low]` `[patch]` (edge-case) An inline `config` passed to `useTodoMutation` would rebuild the mutation on every render. — Fixed: `kind` now lives in each module-level config constant (`TodoHookConfig`), the rule is stated once in the helper's doc, and a new `renderHook` test pins trigger stability. All four callers pass module constants.
- `[low]` `[patch]` (blind) The original F6 entry in `deferred-work.md` is never closed. — Fixed: it now has a `resolution:` pointing at this spec for items 1–3, with item 4 moved to its own entry.
- `[low]` `[patch]` (blind) The rest of F6's controller duplication has dropped out of tracking. — Fixed: the per-QueryClient entry now lists the ×3 register/unregister body, the ×3 `focusWasFree` check, the ×2 Retry+announce block, and the divergent UI-state passing and announce placement.
- `[low]` `[patch]` (blind) The new deferred entry's wording ("this is the only F6 part…") has no subject; it also says `source_spec: none`. — The wording is fixed. `source_spec: none` is kept: the split happened in step 1, before this spec existed, and that is the step-01 split format.
- `[low]` `[patch]` (blind) Epic 2 retro item 13 says to route every 404 through `failureState`, and nothing records the departure. — Fixed: the F6 resolution records that delete's 404 deliberately stays a success, sharing only the predicate, because routing it through `failureState` would change behaviour.
- `[low]` `[patch]` (blind) Nothing ties `kind` to `config` in `useTodoMutation`. — Same root cause as the edge-case inline-config row, fixed there: `kind` is part of the config.
- `[low]` `[patch]` (blind) The "config must be module-level" rule is only a comment, and it's written twice. — Same root cause as the edge-case inline-config row, fixed there: one comment remains, and the stability test pins the contract.
- `[low]` `[patch]` (blind) `useTodoMutation` has no test. — Fixed: `use-todo-mutation.test.tsx` checks the same trigger across rerenders and a new trigger when `onFailure` changes.
- `[low]` `[reject]` (blind) The shipped memo body isn't the spec's "exact memo body". — The fix would edit this build's spec. The deviation (deps `[config, onFailure]`, needed by the hooks lint rule) is behaviour-identical because configs are module constants, and the implementation report records it.
- `[low]` `[patch]` (blind) The `isNotFound` docstring promises a 404 status check, but it checks only `kind`. — Fixed: the doc now reads "an HttpError of kind NOT_FOUND".
- `[low]` `[patch]` (blind) The `isNotFound` test's kind list is typed out by hand. — Fixed: it is built from `ErrorCodeSchema.options` minus `NOT_FOUND`, plus `NETWORK`.
- `[low]` `[patch]` (blind) The hook docstrings still say "built on `createTodoMutation`". — Fixed: they now say they are built on `useTodoMutation`.
- `[low]` `[reject]` (blind) `failure-copy.ts` hard-codes 40 and 500. — The doc now references `QUOTE_MAX`. Building `TOO_LONG_COPY` from the schema limit would touch a user-facing string, which this spec forbids.

## Verification

**Commands:**
- `cd apps/web && npx vitest run --reporter=json --outputFile=<tmp>` -- expected: every pre-existing file has the same count as before (283 across 16 files, recorded before the change), plus the new `isNotFound` tests. All pass.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. Use a throwaway `TEST_DATABASE_URL` Postgres, stopped with `docker rm -f -v`.
- `pnpm test:e2e` -- expected: 99 passed and 2 expected skips. The owner's dev stack stays untouched.
- `grep -rn 'kind === "NOT_FOUND"' apps/web/src --include=*.ts --include=*.tsx | grep -v test` -- expected: a single hit, in `isNotFound`.
