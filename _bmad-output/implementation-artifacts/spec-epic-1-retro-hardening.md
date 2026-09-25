---
title: 'Epic 1 retro hardening: no duplicate on resubmit, wire-contract test, enforced boundaries, shared test helpers'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
baseline_commit: '6a5d83b53fe55231fbae2963ade546f9b96fc1e2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-09-25.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** This change covers the Epic 1 retro action items 1, 2, 4 and 5 (findings F1, F2, F5, F6), which need fixing before Epic 2:
- **F1:** a failed create restored to an empty input is resubmitted under a new UUIDv7, so a POST that committed on the server but timed out on the client becomes a duplicate Todo.
- **F2:** no test runs the real server's response bodies through the real client parser.
- **F5:** the "fetch only in `http.ts`" and "Drizzle only in repositories/db" rules are unenforced.
- **F6:** test helpers are copied across files, and generic Toaster tests sit inside `add-row.test.tsx`.

**Approach:**
- **F1:** the Add row remembers the id and normalized Description of the last restored failure, and reuses that id when the same normalized text is submitted.
- **F2:** add a shared wire-contract fixture that the API tests assert against the real server and the web tests feed through `request()`.
- **F5:** add ESLint rules.
- **F6:** extract the shared helpers and move the Toaster tests to their own file, with no behavior change.

## Boundaries & Constraints

**Always:**
- The reuse applies only after a restore (the input-empty failure branch). The busy-input Retry path is unchanged, since it already resends the same id.
- The remembered `{id, description}` is cleared on the next submit, whether it was reused or not.
- It is also replaced by a newer restore.
- Fixture error bodies are the server's exact bodies, `message` included.
- Moved tests keep their assertions. A move may change only setup, such as the render target and the focus target.

**Never:**
- Change `todo-sync.ts`, the server, the API responses, the copy or the toast behavior.
- Weaken or delete an assertion during a move.
- Add runtime dependencies.
- Carry out Epic 2 prep (retro item 3) or spec reconciliation (item 8).
- Hand-edit `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resubmit after restore | POST A times out (10 s), text is restored, user presses Enter unchanged | Second POST has the same `id` as A and the same Description | Server replay gives 200, or 201 if A never landed; one row either way |
| Resubmit after trimming | Restored "Buy milk", user adds trailing spaces | Normalized text is equal, so the same `id` is used | — |
| Resubmit edited | Restored "Buy milk", user changes it to "Buy milk!" | A new UUIDv7 is used | — |
| Fresh add after resubmit | Resubmit sent (the stored id is now cleared), user adds "Buy milk" again | A new UUIDv7 is used | — |
| Busy-input failure | Input has other text | Behavior is unchanged (Retry toast with the same id); nothing is remembered | — |
| Contract drift | A server body differs from the fixture | The API contract test fails | Update the fixture; the web contract test then re-checks the client |

</frozen-after-approval>

## Code Map

- `apps/web/src/features/todos/create-failure.ts:21-37,65-77`: `AddRowController` and its registry. The input-empty branch calls `addRow.setValue(vars.description)` and drops `vars.id`. `isTooLong` (:47) is module-private.
- `apps/web/src/features/todos/add-row.tsx:54-67` (the controller) and `:81-90` (`handleSubmit`, where `uuidv7()` is called at :87). `valueRef` gives synchronous reads; keep that pattern for the remembered failure.
- `apps/web/src/api/http.ts:67-138`: `request`, `HttpError(kind, status, details)`, and `createTodo`, which accepts both 201 and 200.
- `apps/web/src/test/render.tsx`: `renderWithProviders`, `jsonResponse`, `makeTodo`, `fakeAbortSignalTimeout`. Extend this file (or add a sibling `test/fetch.ts`) rather than creating parallel helpers.
- `apps/web/src/features/todos/todo-list.test.tsx:16-67` and `add-row.test.tsx:21-158`: the duplicated `fetchMock`, `advance`, `deferredFetch`, `hangingFetch` and `beforeEach`/`afterEach`. The copies differ in two ways:
  - `deferredFetch` runs `advance(0)` inside `act` in todo-list but after `act` in add-row.
  - `setSystemTime` uses local time in todo-list and UTC in add-row.

  Keep each file's current semantics, either through a parameter or by keeping that one line local.
- `add-row.test.tsx` Toaster-generic tests: auto-dismiss (:439), pause (:452), which focuses `input()` last, position 640px (:719), Escape (:760), max 3 (:776), CircleX (:788). They can run with just `<Toaster/>` plus `showErrorToast` (`lib/toast.tsx:67`). The Toaster lives in `components/ui/sonner.tsx`.
- `apps/api/test/errors.test.ts:18-44` and `todos.test.ts:113-158`: duplicated `VALIDATION_BODY` and `expectValidationError`, plus `CONFLICT_BODY`. The framework-error tests are duplicated at `errors.test.ts:164-194` (echo route) and `todos.test.ts:358-400`, where they also assert that no row is written.
- `apps/api/test/helpers.ts`: `createTestApp`, `truncateTodos`, `LogCapture`. This is where the shared API test helpers go.
- `packages/shared/package.json` exports only `"."`. `packages/shared/src/errors.ts` holds `ErrorEnvelopeSchema`, and `todos.ts` holds `TodoSchema`.
- `eslint.config.js:45-82`: `no-restricted-imports` blocks per `files`. Flat config **replaces** a rule per matching block, so any new `apps/api/src` block must repeat the api→web patterns.
  - `apps/api/test/errors.test.ts` imports `drizzle-orm`, so restrict only `apps/api/src/**`, excluding `src/repositories/**` and `src/db/**`.
  - The only web `fetch` call is `http.ts:77`. The tests stub fetch with `vi.stubGlobal("fetch", …)`, which is a string argument, not a reference.
- `apps/api/src/repositories/index.ts:15`: the stale comment. Drizzle is imported by `*-repository.ts` and `db/*`; `index.ts` imports none.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/features/todos/create-failure.ts`:
  - Change the input-empty branch to call a new controller method, `restore(description, id)`, in place of `setValue`.
  - Export `isTooLong` for the contract test.
- [x] `apps/web/src/features/todos/add-row.tsx`:
  - Implement `restore` by setting the value and remembering `{id, description}` in a ref.
  - In `handleSubmit`, reuse the remembered id when `normalizeDescription(value)` equals the remembered description, then clear the ref.
- [x] `apps/web/src/features/todos/add-row.test.tsx`: add tests for the matrix rows.
  - Resubmit after a timeout carries the same id.
  - Trimmed text reuses the id; edited text gets a new one.
  - A fresh add after a resubmit gets a new id.
  - The busy-input case is unchanged.
- [x] `packages/shared/fixtures/wire-contract.ts` and `packages/shared/package.json`: add a `"./fixtures"` export with named cases. Each case has a request, the expected status and body, and for errors the expected client `kind` and `tooLong`. The cases are:
  - 201 create and 200 replay
  - 409 conflict
  - 400 `empty`, `too_long` and `unknown_field`
  - 400 malformed JSON
  - 413 and 415
- [x] `apps/api/test/contract.test.ts`: send each case to the real app.
  - Assert the status and that error bodies equal the fixture exactly (`ErrorEnvelopeSchema.parse` must pass).
  - For success bodies, assert that `TodoSchema.parse` passes and the key set matches the fixture.
- [x] `apps/web/src/api/http.contract.test.ts`: feed each fixture body and status through `createTodo` (stubbed fetch). Assert the resolved Todo or the `HttpError.kind`/`details`, and `isTooLong`.
- [x] `eslint.config.js`:
  - Restrict the `fetch` global in `apps/web/src/**`, except `src/api/http.ts` and `**/*.test.*`.
  - Restrict `drizzle-orm` and `drizzle-orm/*` in `apps/api/src/**`, except `src/repositories/**` and `src/db/**`, while keeping the api→web patterns.
- [x] `apps/api/src/repositories/index.ts:15`: correct the comment.
- [x] `apps/web/src/test/`, `todo-list.test.tsx` and `add-row.test.tsx`: extract the shared fetch and timer helpers, and make both files import them.
- [x] `apps/web/src/components/ui/sonner.test.tsx` (or `lib/toast.test.tsx`): move the six generic Toaster tests there, rendering `<Toaster/>` with `showErrorToast`.
- [x] `apps/api/test/helpers.ts`, `errors.test.ts` and `todos.test.ts`:
  - Share `VALIDATION_BODY`, `CONFLICT_BODY` and `expectValidationError`.
  - Keep the framework-error tests once, in `todos.test.ts` (the real route, with no-row assertions). Remove the echo-route duplicates from `errors.test.ts`, except for any case unique to it.

**Acceptance Criteria:**
- Given the suites before and after, when they run, then every moved or deduplicated test still passes, and no assertion was removed except exact duplicates.
- Given code in `apps/web/src/features/**` that calls `fetch(...)`, or `apps/api/src/services/**` that imports `drizzle-orm`, when `pnpm lint` runs, then it errors. The existing tree lints clean.
- Given the dev stack, when a browser adds a Todo, reloads, and forces one POST failure then resubmits, then the list shows exactly one row for that text.

## Implementation Notes

- **F1:** the `AddRowController.setValue` method became `restore(description, id)`. `add-row.tsx` keeps `restoredRef` and uses it once in `handleSubmit`.
- **F1 tests:** 7 new tests. With the fix switched off, 4 of them fail. The other 3 expect a fresh id, so they pass either way.
- **F2:** added `packages/shared/fixtures/wire-contract.ts`, exported as `@todos/shared/fixtures`. The shared `tsconfig` now includes `fixtures`. Contract tests are `apps/api/test/contract.test.ts` and `apps/web/src/api/http.contract.test.ts`.
- **F5:**
  - `no-restricted-globals` and `no-restricted-properties` (`window`/`globalThis`/`self.fetch`) apply to `apps/web/src/**`, except `http.ts` and tests.
  - A Drizzle import block covers `apps/api/src/**` except repositories/db, and reuses the `API_TO_WEB_PATTERNS` constant.
  - A lint probe gave the expected errors, and it has been reverted.
- **F6:**
  - Web helpers moved to `apps/web/src/test/fetch.ts`. Per-file semantics are kept: todo-list uses a single `act` and local time, add-row uses two `act`s and UTC.
  - Six Toaster tests moved to `apps/web/src/components/ui/sonner.test.tsx`, with the same names and assertions.
  - API `VALIDATION_BODY`, `CONFLICT_BODY` and `expectValidationError` are now in `apps/api/test/helpers.ts`.
  - The echo-route malformed-JSON, empty-body and 413 tests were removed as duplicates. The XML 415 case was kept as a second `todos.test.ts` case.
- **Verification:** lint, typecheck and build exit 0. Tests: 252 passed (shared 25, API 113, web 114), up from 230, with none skipped.
- **Browser check (implementer, Playwright on :18080):** the POST reached the server (201) and was aborted on the client. The resubmit sent the same id and got a 200 replay, leaving 1 row in the list, after reload and in the DB. Probe rows were deleted.
- **Review pass 1:** Blind, edge-case and verification-gap layers ran, giving 15 findings: 4 patched (comments, an exact message assertion, an alias rename) and 11 rejected with evidence. Re-verified: lint, typecheck, build and Prettier all exit 0; 252 tests pass. A lint stdin probe gave the expected 2 errors (0 in repositories). A Playwright check showed a committed-then-aborted POST (201), then a resubmit with the same id (200), leaving 1 row in the list, 1 after reload and 1 in the DB.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind + edge + vgap-other | The id is remembered after a 409 CONFLICT, so an unchanged resubmit returns 409 again until the user edits the text | low | Real at `create-failure.ts:78` and `add-row.tsx:91-94`. A create 409 needs the id to be stored already with different text. The client only pairs an id with its own text (`uuidv7()`, and a reused id only with an identical normalized Description), so only an id collision reaches it. For 400 reasons a new id would fail identically. The fix adds a branch | reject |
| 2 | blind | No test covers the restore-then-resubmit path after 409/400/5xx | low | Same root cause as #1. For 400 and 5xx a reused id behaves like a new one (400: same failure; 5xx: replay-safe). Only the unreachable 409 differs | reject |
| 3 | blind | The "a newer restore replaces the remembered id" comment says "restored again, under the same id", contradicting its assertions | low | `add-row.test.tsx:534`. The resubmit is the edited "Buy milk!" under a new id (`second.id !== first.id`) | patch |
| 4 | blind | The `repositories/index.ts` comment says Drizzle is imported only by the `*-repository.ts` files and db/, "enforced by ESLint". The lint ignore covers all of `repositories/**` | low | `eslint.config.js` ignores `apps/api/src/repositories/**`, so `index.ts` could import Drizzle without a lint error | patch |
| 5 | blind | The fetch rule misses computed `globalThis["fetch"]`, XHR and `sendBeacon`, and the rules have no RuleTester tests | low | Computed access is not caught by `no-restricted-properties`. Destructuring and `window`/`globalThis`/`self.fetch` are caught (vgap probe). AD-6 covers `fetch` only. Deliberate evasion is unlikely, and the fix adds rule complexity. The rules were verified by lint probes (Verification) | reject |
| 6 | edge | A dynamic `import("drizzle-orm")` in apps/api/src bypasses the AD-7 rule | low | Confirmed by the reviewer (no error), but the codebase has no dynamic imports and the fix adds a `no-restricted-syntax` rule | reject |
| 7 | blind + edge | The contract has no 503 UNAVAILABLE, 500 INTERNAL, non-envelope or GET list cases | low | Every non-`too_long` failure maps to one copy (`create-failure.ts`), so 503/500 envelope drift doesn't change the UI; an unparseable envelope already maps to INTERNAL with the same copy. The GET list body is parsed with the shared `TodoListResponseSchema` in `todos.test.ts`. A 503 case needs the DB-down harness; that is added complexity | reject |
| 8 | blind | `VALIDATION_BODY`/`CONFLICT_BODY` in `api/test/helpers.ts` duplicate the fixture bodies | low | Both copies are pinned by tests against the real server (`todos.test.ts`, `contract.test.ts`), so a message change fails loudly rather than drifting. The fix needs new fixture exports | reject |
| 9 | blind | The fixture's `validation()` types `details` inline instead of `ErrorDetail`, so a renamed reason is not caught at compile time | false | The result is assigned into `body: ErrorEnvelope` (`wire-contract.ts` `ErrorCase.body`), whose `details` type comes from `ErrorReasonSchema`, so a renamed reason fails typecheck there | reject |
| 10 | blind | The web contract asserts `message` with a weak `not.toContain` | low | `http.contract.test.ts:54`. The exact `HttpError` message is `Request failed: ${kind}` (`http.ts:31`) | patch |
| 11 | blind | The web success cases don't prove that bodies with missing or extra keys are rejected | false | That is client schema behaviour, pinned in `http.test.ts` (schema-failure → INTERNAL). The contract's job is server/client body agreement, which the API key-set check covers | reject |
| 12 | blind | The contract never checks success timestamps against the server | false | `todos.test.ts` asserts ms-ISO `createdAt`/`updatedAt` on the real create (`ISO_MS`), and `contract.test.ts` runs `TodoSchema.parse` on the real body | reject |
| 13 | blind | `sonner.test.tsx` never clears Sonner's global toast store | false | `apps/web/src/test/setup.ts:12` calls `toast.dismiss()` in a global `afterEach` | reject |
| 14 | blind | The `deferredFetch as deferredFetchThen` alias is misleading | low | `todo-list.test.tsx:9,19`. "Then" doesn't describe the same-act flush variant | patch |
| 15 | edge | Busy input, POST committed but timed out, Retry toast dismissed, then retyping the text sends a new id, which duplicates the Todo | low | Pre-existing. Dismissing a Retry toast discards the failed create by design (Story 1.4 triage #7, `EXPERIENCE.md:84`). This change leaves the busy path unchanged per its Boundaries. The fix needs dismiss-to-remember wiring | reject |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build`: expected to exit 0.
- `pnpm test` (dev stack up): expected to show all suites green with no skipped tests, and a higher test count than 230 before moves and dedupe (report the new numbers).
- A temporary probe: add `fetch("/x")` to `features/todos/todo-row.tsx` and a `drizzle-orm` import to `services/todo-service.ts`, run `pnpm lint`, and expect 2 errors. Then revert the probe.

**Manual checks:**
- A Playwright run against `localhost:${WEB_PORT}`:
  - Add, then reload: the row is persisted.
  - Route the first POST to abort after letting it reach the server, then resubmit the restored text. Expect one row in the list and in the DB.
  - Delete the probe rows afterwards.
