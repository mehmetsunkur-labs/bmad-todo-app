---
title: 'Story 2.1: Update and delete Todos through the API'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'ee18b3b51c7b7a44dc02fcc1e4c8c1a7585ea516'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The API can only list and create Todos. Stories 2.2–2.4 (toggle, delete, edit) need a PATCH and DELETE contract they can rely on.

**Approach:** Add `PATCH /api/v1/todos/:id` and `DELETE /api/v1/todos/:id`, with shared Zod schemas, following the existing route → service → repository layering. Each write is one SQL statement. Pin down, with tests, how a late create replay behaves once edit and delete exist.

## Boundaries & Constraints

**Always:** Request schemas live in `packages/shared` and are strict. `:id` is `z.uuid()` (any version or case). The Description is normalized with `normalizeDescription` and validated with the same `descriptionError` as create. Timestamps come only from the database clock. `updated_at = now()` only when a stored value actually changes, detected in the same UPDATE statement with `IS DISTINCT FROM`. `created_at` never changes. Repositories return `null`/`false` on a miss and never throw `AppError`. The service turns a miss into `NOT_FOUND`. Every error body comes from the existing handlers in `apps/api/src/errors.ts`.

**Never:** No web client changes (`http.ts`, `todo-sync.ts`, hooks, UI: Stories 2.2–2.4). No database migration. No change to POST semantics. No read-then-write for PATCH or DELETE. No new error codes or reasons. No changes to `packages/shared/fixtures/wire-contract.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toggle | existing Active Todo, `{ "completed": true }` | `200` Todo, `completed: true`, Description unchanged, `updatedAt` later than before, `createdAt` same | — |
| Edit | `{ "description": "  Buy\noat milk " }` | `200`, `description: "Buy oat milk"`, `updatedAt` bumped | — |
| Both | `{ "description": "x", "completed": true }` | `200`, both applied in one write | — |
| No-op | fields equal to the stored values (after normalization) | `200`, stored Todo byte-for-byte, `updatedAt` unchanged | — |
| Empty body | `{}` | `400`, `details: [{ field: "", reason: "invalid" }]`, no write | error handler |
| Null value | `{ "completed": null }` / `{ "description": null }` | `400`, `details: [{ field: "<key>", reason: "invalid" }]`, no write | error handler |
| Unknown key | `{ "completed": true, "createdAt": "…" }` | `400`, `details: [{ field: "createdAt", reason: "unknown_field" }]`, no write | error handler |
| Bad Description | `"   "` / 501 units / contains NUL | `400`, reason `empty` / `too_long` / `invalid` on field `description`, no write | service `AppError` |
| Unknown id | PATCH or DELETE with a well-formed, absent uuid | `404`, exact `NOT_FOUND` envelope | service `AppError` |
| Malformed id | `/api/v1/todos/not-a-uuid` (PATCH or DELETE) | `400 VALIDATION_ERROR`, `details: [{ field: "id", reason: "invalid" }]`, no query | error handler |
| Delete | existing Todo, no body, no content type | `204`, empty body, the row is gone from GET | — |
| Replay after edit | POST `{ id: X, original description }` after X was edited | `409` exact `CONFLICT` envelope, row unchanged | existing create |
| Replay after delete | POST `{ id: X, description }` after X was deleted | `201`, row exists again | existing create |

</intent-contract>

## Code Map

- `packages/shared/src/todos.ts` -- DTO and request schemas. `CreateTodoRequestSchema` (L41) is the pattern: `z.strictObject`, shape only, length checked by the service.
- `packages/shared/src/paths.ts` -- `TODOS_PATH`. Add the `:id` route path here.
- `packages/shared/test/todos.test.ts` -- existing schema unit tests. Extend them for the new schemas.
- `apps/api/src/routes/todos.ts` -- GET/POST registration with `schema: { body, response }`. Add PATCH/DELETE here, using `params` validation.
- `apps/api/src/services/todo-service.ts` -- `TodoService` interface. `descriptionError` (L35) and the create flow are the reuse points.
- `apps/api/src/repositories/todo-repository.ts` -- Drizzle queries and `toTodo` (L25). The only place that may import Drizzle (ESLint-enforced, AD-7).
- `apps/api/src/errors.ts` -- `toDetails` (L68) maps Zod issues. `instancePath "/id"` gives field `id`, and a root refine gives field `""` with default reason `invalid`. `NOT_FOUND` already defaults to 404. Read-only unless a mapping is wrong.
- `apps/api/test/helpers.ts` -- `createTestApp`, `truncateTodos`, `expectValidationError`, `CONFLICT_BODY`. Add a `NOT_FOUND_BODY` beside `CONFLICT_BODY`.
- `apps/api/test/todos.test.ts` -- style reference: `describe` per route, `inject`, raw SQL seeds, `ISO_MS`.
- `apps/api/test/todo-service.test.ts` -- stub-repository pattern for service unit tests.

## Tasks & Acceptance

**Execution:**
- `packages/shared/src/paths.ts` -- add `TODO_PATH = \`${TODOS_PATH}/:id\`` -- a single source for the route path.
- `packages/shared/src/todos.ts` -- add `TodoIdParamsSchema = z.strictObject({ id: z.uuid() })` and `UpdateTodoRequestSchema = z.strictObject({ description: z.string().optional(), completed: z.boolean().optional() })`, refined so at least one key is present, plus their inferred types -- the shared contract (AD-1, AD-2).
- `packages/shared/test/todos.test.ts` -- unit-test both schemas: accepts each single key and both keys, rejects `{}`, `null`s, unknown keys and a non-uuid id.
- `apps/api/src/repositories/todo-repository.ts` -- add `update(ctx, id, patch)`, one `UPDATE … SET` with only the present columns and `updated_at = CASE WHEN <any present column> IS DISTINCT FROM <new value> THEN now() ELSE updated_at END`, `RETURNING`, giving `Todo | null`. Add `delete(ctx, id)`, one `DELETE … RETURNING id`, giving `boolean` -- single-statement writes (AD-7), DB clock (AD-3).
- `apps/api/src/services/todo-service.ts` -- add `update` (normalize and validate the Description if present, call the repository, `null` → `AppError("NOT_FOUND")`) and `delete` (`false` → `NOT_FOUND`). Document both on the interface.
- `apps/api/src/routes/todos.ts` -- register `PATCH TODO_PATH` (params, body, `response: { 200: TodoSchema }`) and `DELETE TODO_PATH` (params, then `reply.code(204).send()`).
- `apps/api/test/helpers.ts` -- add `NOT_FOUND_BODY`.
- `apps/api/test/todos.test.ts` -- new `describe` blocks for PATCH and DELETE covering every I/O matrix row, including "no row changed" checks via SQL on validation failures, plus the concurrency ACs below.
- `apps/api/test/todo-service.test.ts` -- update the stub repository for the new methods, and unit-test the service's miss → `NOT_FOUND` for update and delete, plus that an invalid Description never reaches the repository.

**Acceptance Criteria:**
- Given one Todo, when two PATCHes run concurrently, one with `{ description }` and one with `{ completed }`, then both return `200` and the stored row has both changes (sending only the changed fields never reverts the other one).
- Given one Todo, when two PATCHes with different Descriptions run concurrently, then both return `200`, and GET returns exactly one of the two Descriptions, intact (NFR3). When they are sent one after the other, the second wins.
- Given a Todo, when it is PATCHed and then GET is called, then GET returns the PATCH response's Todo, and its position (by `compareTodos`) is unchanged.
- Given a PATCH or DELETE that responds with 4xx, when the table is inspected, then the row is exactly as it was.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 12 findings — high 0, medium 0, low 4, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Wire-contract fixture not extended to PATCH/DELETE — no client code parses these responses yet; the fixture's purpose is pairing server bodies with a client parser, which Stories 2.2/2.3 add, so extend it there. Adding cross-side surface now guards no consumer.
  - `[false]` `[reject]` (blind) Error responses missing from route schemas — AD-5 routes every non-2xx body through the single error handler (POST lists no 4xx either); the DELETE 204 empty body is asserted by the "deletes: 204, empty body" test.
  - `[false]` `[reject]` (blind) Empty-patch guard triplicated / service copy can drift from `errors.ts` — unreachable: the route schema's refine rejects `{}` before the service runs (tested: "empty body {} → 400 root invalid"), so no caller can observe a divergence.
  - `[false]` `[reject]` (blind) Docstrings contradict code; no-op still runs an UPDATE — the repository doc describes the service contract and the fallback is documented inline; "returns the stored Todo unchanged" is about the response, which holds. Skipping the UPDATE would need a read-then-write, which the spec forbids.
  - `[false]` `[reject]` (blind) Microsecond `updated_at` bump on no-op would go undetected — the columns are `timestamptz(3)` (`apps/api/src/db/schema.ts:14-19`), so no sub-millisecond value exists; casts are exercised by every route test.
  - `[low]` `[reject]` (blind) "updatedAt comes from the database clock" test can't tell DB from app clock on one host — true, but a stronger test needs clock freezing or skewing (more than a direct correction), and the repository code sets no app-side time at all.
  - `[false]` `[reject]` (blind) Concurrency tests miss PATCH+DELETE race and same-value toggle race — the behaviour is correct: under READ COMMITTED the waiting UPDATE re-checks the committed row (a deleted row gives no RETURNING → 404, an equal value → `IS DISTINCT FROM` false → no bump). A missing extra test is not a defect against the covered ACs.
  - `[false]` `[reject]` (blind) Request-shape edge cases (no body, 415, bad JSON, 413, JSON-typed empty DELETE, missing id, trailing slash) untested — all go through the shared `toAppError`/not-found handlers already tested in `apps/api/test/errors.test.ts`; a missing body fails the Zod body schema → 400, and unknown paths → 404 envelope.
  - `[false]` `[reject]` (blind) Logging only checked for successful PATCH; failures may leak the Description — 4xx responses are never logged with `err` (`apps/api/src/errors.ts:270`), and request lines carry no body; the existing logging tests cover the hook generically.
  - `[false]` `[reject]` (blind) `z.uuid()` params stricter than the column could strand rows — create uses the identical `z.uuid()` (`packages/shared/src/todos.ts` `CreateTodoRequestSchema`), so every API-created row is addressable.
  - `[low]` `[reject]` (blind) Test helpers (`seedTodo`, `snapshot`, `appErrorOf`) local to test files — the remaining Epic 2 stories are web-side, so no later API story is known to duplicate them; moving them is a refactor, not a direct fix.
  - `[low]` `[patch]` (edge) Racing PATCHes: the one that waited on the row lock commits last with an earlier `now()`, so `updatedAt` moves backwards — fixed: the CASE now sets `GREATEST(now(), updated_at)` on a real change, and the docstring explains why (`apps/api/src/repositories/todo-repository.ts`).

## Design Notes

A PATCH is one UPDATE whose change check runs against the pre-update row, so there is no read-modify-write race:

```sql
UPDATE todos SET description = $d, completed = $c,
  updated_at = CASE WHEN description IS DISTINCT FROM $d
                      OR completed IS DISTINCT FROM $c
                    THEN now() ELSE updated_at END
WHERE id = $id RETURNING *;
```

Build it with Drizzle `.set({...})` and `sql` templates, adding only the columns in the patch. Within a statement, SET expressions see the old row values. For PostgreSQL, `now()` is the transaction start time, the same clock that set `created_at`. The replay ACs need no code: the existing create already compares against the stored row. The tests just pin that behaviour down.

## Verification

**Commands:**
- `pnpm --filter @todos/shared test && pnpm --filter @todos/api test` -- expected: all pass (the dev db must be up, `docker compose up db`)
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: all exit 0

## Auto Run Result

**Summary:** Added `PATCH /api/v1/todos/:id` (partial update, strict body, at least one key, Description normalized and validated as in create, `updatedAt` moves only on a real change and never backwards, one UPDATE statement) and `DELETE /api/v1/todos/:id` (`204`, one DELETE statement). Unknown ids return `404 NOT_FOUND`, and malformed ids return `400` on field `id`. Tests now pin the create-replay behaviour once edit and delete exist: after an edit a replay gets `409`, after a delete it gets `201`.

**Files changed:**
- `packages/shared/src/paths.ts`: `TODO_PATH` route path.
- `packages/shared/src/todos.ts`: `TodoIdParamsSchema`, `UpdateTodoRequestSchema` and their types.
- `packages/shared/test/todos.test.ts`: schema unit tests.
- `apps/api/src/repositories/todo-repository.ts`: single-statement `update` (`IS DISTINCT FROM` change check, monotonic `updated_at`) and `delete`.
- `apps/api/src/services/todo-service.ts`: `update`/`delete`, with a miss mapped to `NOT_FOUND`; the Description check is now shared by create and update.
- `apps/api/src/routes/todos.ts`: PATCH and DELETE routes.
- `apps/api/test/helpers.ts`: `NOT_FOUND_BODY`.
- `apps/api/test/todo-service.test.ts`: service unit tests for update and delete.
- `apps/api/test/todos.test.ts`: route tests for every I/O matrix row, the concurrency ACs, GET position, and the replay cases.

**Review findings:** 12 in total. 1 patched (low: `updatedAt` could move backwards under a lock race), 0 deferred, and 11 rejected (4 low, 8 false, with the reasons in the Review Triage Log).

**Follow-up review recommendation:** `false`. Patched this pass: high 0, medium 0, low 1.

**Verification:** `pnpm --filter @todos/shared test` gave 44 passed. `pnpm --filter @todos/api test` gave 158 passed across 9 files, none skipped. `pnpm lint`, `pnpm typecheck`, `pnpm build` and `prettier --check apps packages` all exit 0. Matrix audit: every I/O row has a passing test.

**Residual risks:** the concurrency tests fire requests together but can't force a particular lock-wait order, so the `GREATEST` guard has no test that fails without it. The wire-contract fixture doesn't cover PATCH/DELETE yet; extend it when Stories 2.2/2.3 add client parsing.
