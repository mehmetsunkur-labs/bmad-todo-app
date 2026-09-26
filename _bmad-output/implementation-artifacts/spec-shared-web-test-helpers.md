---
title: 'Shared web test helpers: move the duplicated test scaffolding into apps/web/src/test (Epic 2 retro F7)'
type: 'refactor'
created: '2026-09-26'
status: 'done'
baseline_commit: '0f64be5f00cceb3e935b98f1b20d915d586470b9'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the web test files each redefine the same scaffolding (Epic 2 retro F7). Examples: `renderPopulated`, `toasts`, `announcer`, `rows`, `click`, `checkbox`, `serverError`, `notFound`, `callsWith`, the same-act `deferredFetch` wrapper, the `top`/`middle`/`bottom` fixtures, and two differing `stubAnimate`s. `todo-sync.test.ts` also holds 4 copies each of `deferred()`, `flush()` and `setup()`. Copies drift, and every new test copies them again.

**Approach:** move each duplicated helper into the shared modules under `apps/web/src/test/`, giving it parameters where the copies differ so every caller keeps its exact behaviour. Replace the local copies with imports, and consolidate `todo-sync.test.ts`'s copies once, within that file.

**Decisions (human, 2026-09-26):** F7 goes before F6. This change is test-only.

## Boundaries & Constraints

**Always:**
- **Every test keeps its behaviour.** The same tests pass and each file keeps its test count. Assertions, test names and the order of steps within a test stay as they are.
- **Differing copies keep their meaning:**
  - `rows`: throwing when the list is missing (`add-row`, `todo-row`) vs returning `[]` (`todo-delete`), and preferring the edit field's value (`todo-edit`).
  - `click` vs focus-then-click.
  - The two `stubAnimate`s: `add-row` asserts only `animate.mock.calls`; `todo-delete` records the `FakeAnimation` objects.
  - `renderPopulated`: each file's default todos, a positional or option `queryClient`, and `todo-delete`'s `<ToggleProbe/>`.
  - The shared `deferredFetch` default (`flushInSameAct: false`, used by `add-row`), which stays as it is.
- Helpers live in `apps/web/src/test/*`, never named `*.test.*` or `*.spec.*`. They pass `pnpm lint` (no bare `fetch` reference; no component exports mixed into `.tsx` helpers, to satisfy `react-refresh`) and `pnpm typecheck` (`noUnusedLocals`).
- File-local state stays local: `todo-delete`'s `queueToggle`/`ToggleProbe`, `todo-edit`'s `document.hasFocus` mock, and the per-file dates passed to `setupFetchAndFakeTimers`.

**Never:**
- Don't change production code: nothing under `apps/web/src/` outside test files and `src/test/*`.
- Don't touch the API or shared-package tests.
- Don't do the write-path consolidation (F6).
- Don't rewrite `http.test.ts`, `App.test.tsx` or `sonner.test.tsx`'s own fetch or timer setup (not in F7's list). `sonner.test.tsx` may import the shared `toasts` only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same tests, same results | `vitest run` in `apps/web` before and after | 283 tests pass after, with the same count per file as the baseline: App 2, http.contract 9, http 25, todo-sync 34, app-providers 1, sonner 7, add-row 42, todo-delete 46, todo-edit 48, todo-list 19, todo-row 19, use-exiting-rows 11, use-list-focus 6, relative-time 8, utils 2, vite-allowed-hosts 4 | — |
| `rows` without a list | `rows({ allowMissing: true })` with no list rendered, or the default call | returns `[]` with the option; throws by default, as before | test assertion |
| `stubAnimate` recording | `stubAnimate(animations)` then an exit | records `FakeAnimation` entries, and `unstubAnimate()` restores `Element.prototype.animate` | — |
| No duplicates left | grep the 5 feature test files and `todo-sync.test.ts` for the moved helper definitions | each helper is defined once, in `src/test/*` (the `todo-sync` helpers once, in that file) | — |

</frozen-after-approval>

## Code Map

- `apps/web/src/test/fetch.ts`:
  - Already exports `fetchMock`, `advance`, `deferredFetch({flushInSameAct=false})`, `hangingFetch` and `setupFetchAndFakeTimers(date)`.
  - Add `deferredFetchSameAct()`, currently copied at todo-row:22, todo-delete:31, todo-edit:26 and todo-list:19.
  - Add `callsWith` (todo-delete:97, todo-edit:84) and `patches` (todo-row:61, todo-edit:86, built on `callsWith`).
- `apps/web/src/test/render.tsx` -- already exports `renderWithProviders`, `jsonResponse`, `makeTodo`, `fakeAbortSignalTimeout`. Add `renderPopulated(todos, { queryClient?, extra? })` with no default todos. Callers pass their defaults, and `todo-delete` passes its probe as `extra`. The call shapes to support:
  - add-row:49 is `(todos=[existing])`.
  - todo-row:35 and todo-edit:44 are positional `(todos, queryClient)`.
  - todo-delete:59 is an options object with `probe`.
- **New `apps/web/src/test/queries.ts`:**
  - `toasts` (add-row:76, todo-row:54, todo-delete:90, todo-edit:77, sonner:13; all identical).
  - `announcer` (add-row:60, todo-row:52, todo-delete:88, todo-edit:76).
  - `rows({ allowMissing?, preferEditField? })` (add-row:61 and todo-row:48; todo-delete:80; todo-edit:68).
  - `checkbox` (todo-row:45, todo-delete:75, todo-edit:56), `deleteButton` (todo-delete:76, todo-edit:59), `addInput` (todo-delete:87, todo-edit:65; add-row's `input` at :56 is the same query), `retryButton` (add-row:83, todo-edit:66).
  - `click` (todo-row:69) and `focusAndClick` (todo-delete:101, todo-edit:92).
  - The two `type` helpers differ (add-row:85 sync vs todo-edit:99 async): keep both local.
- **New `apps/web/src/test/fixtures.ts`:**
  - `top`/`middle`/`bottom` (todo-delete:33-47 and todo-edit:28-42, identical).
  - `serverError` (todo-row:92, todo-delete:111, todo-edit:127) and `notFound` (todo-delete:109, todo-edit:129).
  - `add-row`'s inline `{code:"INTERNAL", message:"x"}` at :108 and ~:800 stays local.
  - `todo-row`'s `newer`/`older` stay local (different descriptions).
- **New `apps/web/src/test/animate.ts`:**
  - `FakeAnimation`, `stubAnimate(animations = [])` returning the `vi.fn` (the recording version from todo-delete:848-870, installed with `Object.defineProperty`, configurable and writable), and `unstubAnimate()`.
  - Callers: `add-row` (~:811, its afterEach at :821) and `todo-delete` (its afterEach at :116, which also resets `queueToggle`).
- `apps/web/src/api/todo-sync.test.ts`:
  - `deferred<T>()` at :154, :371, :556, :791 and `flush()` at :164, :381, :566, :801: one each, at the top of the file.
  - `setup(seed, { spyInvalidate = true })` covering :166, :383, :568 and :803. The :803 block doesn't spy, so pass `false` there.
  - The duplicated fixtures `todo`/`other` (357-367, 544-553, 780-789) and `NEW_ID` (141, 367, 553).
  - `toggleKind` (400/600) and `deleteKind` (588/832): diff them first, and merge only if they're identical.
- Config facts: Vitest has no `include`, so its default applies (`src/test/*.ts` is not collected). `tsconfig.app.json` includes `src`, so the helpers are typechecked. The ESLint fetch ban does not exempt `src/test/*`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/test/{fetch.ts,render.tsx,queries.ts,fixtures.ts,animate.ts}` -- add the shared helpers listed in the Code Map, parameterized where the copies differ. -- one definition each.
- [x] `apps/web/src/features/todos/{add-row,todo-row,todo-delete,todo-edit,todo-list}.test.tsx`, `apps/web/src/components/ui/sonner.test.tsx` -- delete the local copies and import the shared helpers. Keep each file's defaults at its call sites or in a one-line local wrapper. -- dedupe.
- [x] `apps/web/src/api/todo-sync.test.ts` -- consolidate `deferred`, `flush`, `setup`, the fixtures and the identical kind factories within the file. -- dedupe.
- [x] Run the per-file test counts and compare them with the baseline in the matrix. -- matrix proof.

**Acceptance Criteria:**
- Given the refactor, when I run `pnpm lint`, `pnpm typecheck` and `pnpm test`, then all pass, and the `apps/web` per-file test counts equal the baseline.
- Given `git diff`, when I list the changed paths, then only `apps/web/src/test/*` and `apps/web` test files changed, and no production file.
- Given the 5 feature test files, when I grep for the moved helpers' local definitions, then none remain.

## Implementation Notes

- Baseline per-file counts from `vitest run --reporter=json` before any change: `/tmp/claude/-path-to-Todo-App/b728be79-534f-4eb5-b50e-3992692eb10e/scratchpad/web-counts-before.txt` (283 total).

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 12 findings — high 0, medium 0, low 12, false 0, maybe-false 0
- `[low]` `[patch]` (blind) The shared helpers form an import cycle, and a generic helper depends on the feature. — Fixed: `renderPopulated` moved to `test/render-todo-list.tsx`, so `render.tsx` imports neither `./fetch` nor `TodoList`.
- `[low]` `[patch]` (blind) Duplicates missed in `todo-row.test.tsx`. — Fixed: it now uses `addInput()`, `notFound()` and `callsWith("POST")`, with the assertions unchanged.
- `[low]` `[patch]` (blind) `add-row`'s `posts()` filters POST by hand. — Fixed: it is now built on `callsWith("POST")`.
- `[low]` `[patch]` (blind) The `todo-sync` fixture `other` is shadowed by a local deferred. — Fixed: the deferred is renamed `otherPost`. Merging the fixture sets was not done, because the ids and descriptions pin existing assertions.
- `[low]` `[reject]` (blind) Drop the `spyInvalidate` option. — The frozen spec keeps each block's behaviour exactly, and the edit block never spied before.
- `[low]` `[patch]` (blind) The `focusAndClick as click` alias makes `click` mean different things in neighbouring files. — Fixed: the real name `focusAndClick` is used at the call sites. `addInput as input` stays, since only `add-row` uses it.
- `[low]` `[patch]` (blind) `rows()`'s flags hide behaviour, and a row without a `<p>` throws a bare TypeError. — The null-safety part is fixed (`?.textContent ?? null`). The flags stay, as the spec defines them.
- `[low]` `[patch]` (blind) The `animate.ts` stub is incomplete, and its comment is wrong. — The comment is fixed. The stub is kept as it was in `todo-delete` (`cancel` never called `oncancel` there either), so there is no behaviour change.
- `[low]` `[reject]` (blind) The new shared modules have no tests of their own. — They are exercised by all 283 web tests with identical per-file counts. Dedicated tests would be new scope.
- `[low]` `[patch]` (edge-case) The `render.tsx` ↔ `fetch.ts` cycle risks a TDZ error. — Same root cause as the blind import-cycle row, fixed there.
- `[low]` `[patch]` (edge-case) `rows()` throws a TypeError on a listitem with no `<p>`. — Same root cause as the blind `rows()` row, fixed there.
- `[low]` `[reject]` (edge-case, claim) `todo-delete`'s local `renderPopulated` wrapper is about 7 lines. — It only maps the file's `probe` option to `extra`, which the spec allows.

## Verification

**Commands:**
- `cd apps/web && npx vitest run --reporter=json --outputFile=<tmp>.json`, then compare per-file `assertionResults` counts with the matrix -- expected: identical, all passing.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. Use a throwaway `TEST_DATABASE_URL` Postgres for the API suite, stopped with `docker rm -f -v`.
- `git diff --name-only <baseline>` -- expected: only `apps/web/src/test/*` and `*.test.ts(x)` files under `apps/web`.
