---
title: 'Story 1.3: Create Todos through the API, safely and idempotently'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '661b18eae715ef1aa34a4f87b835a4fa2de6c6f9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The API can only list Todos. The upcoming optimistic Add row (Story 1.4) needs a create endpoint that validates and normalizes input, tolerates retries of the same `id` without making duplicates, and never writes bad data or leaks Description text into logs.

**Approach:** Add `POST /api/v1/todos` (route → service → repository) with a strict shared request schema. The service normalizes the Description and validates it, then the repository runs `INSERT … ON CONFLICT (id) DO NOTHING`. A new row returns `201`. A replay with the same normalized Description returns `200` with the stored Todo, and a replay with a different one returns `409 CONFLICT`. Error logging is changed so no Description text ever reaches a log line.

## Boundaries & Constraints

**Always:**
- Shared owns `CreateTodoRequestSchema` (`z.strictObject({ id: z.uuid(), description: z.string() })`), its `CreateTodoRequest` type, and a pure `normalizeDescription(raw)`. `normalizeDescription` replaces each `\r\n`, `\r`, or `\n` with one space, then trims. Story 1.4 reuses it.
- The Zod schema checks only shape. The service checks emptiness and length on the **normalized** value (1–`DESCRIPTION_MAX` UTF-16 units) and throws `AppError("VALIDATION_ERROR", { details: [{ field: "description", reason }] })`.
- Only the repository touches Drizzle, and it takes `ctx` first. The insert sets only `id` and `description`, so the database clock sets `created_at`/`updated_at`. The stored and returned description is the normalized one.
- Every error goes through the existing `errors.ts` handler and envelope. Every thrown Drizzle or pg error that gets logged (the `warn` for 5xx and the `error` for unhandled) must have its bound `params` removed, including Drizzle's `"\nparams: …"` message suffix, at every level of the `cause` chain.
- The per-request log line is unchanged. If any Todo value is logged, it's only `id` or `descriptionLength`.

**Never:**
- No web or client changes, `createTodoMutation`, OpenAPI, PATCH/DELETE, or new migrations or DB constraints.
- Never log the request body or Description text. Never trust client timestamps (the strict schema rejects them as `unknown_field`).

**Decisions:**
- **Replay race:** if the insert returns no row and the follow-up select by `id` also finds none, retry the insert once, then throw `INTERNAL`.
- **Id case:** any UUID case is accepted. The response carries the canonical lowercase `id` that PostgreSQL returns.
- **Missing or non-string fields:** a missing `description` or `id`, a `null`, or a wrong type gives `reason: "invalid"` (the existing `toDetails` default).
- **Validation order:** Zod runs first, so a replay with an invalid body gets `400`, not `200` or `409`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | New `id`, `"  Buy\r\nmilk\n "` | `201` Todo `{ id, description: "Buy milk", completed: false, createdAt, updatedAt }` (ms ISO, DB clock); one row | N/A |
| Trim to limit | 500 chars wrapped in spaces, or 500 chars plus `"\n"` | `201`, 500-char Description | N/A |
| Replay, same text | Existing `id`, Description that normalizes to the stored one | `200` with the stored Todo unchanged; still one row | N/A |
| Replay, different text | Existing `id`, different normalized Description | `409 CONFLICT` envelope; row unchanged | N/A |
| Concurrent duplicates | Same body POSTed twice in parallel | One `201`, one `200`; exactly one row | N/A |
| Empty | `""`, `"   "`, or `"\r\n\n"` | `400`, details `[{field:"description",reason:"empty"}]`; no row | N/A |
| Too long | 501 units after normalization (including one astral emoji counted as 2) | `400`, `too_long`; no row | N/A |
| Bad id | `"abc"`, missing, or `123` | `400`, `{field:"id",reason:"invalid"}`; no row | N/A |
| Extra key | `{ id, description, createdAt }` | `400`, `{field:"createdAt",reason:"unknown_field"}`; no row | N/A |
| Framework errors | Malformed JSON; JSON type with an empty body; over 16 KiB; `text/plain` | `400` / `400` / `413` / `415` `VALIDATION_ERROR` on `POST /api/v1/todos` | N/A |
| DB down | Valid body, DB unreachable | `503 UNAVAILABLE`; no log line contains the Description | Server keeps serving |

</frozen-after-approval>

## Code Map

Follow the Story 1.2 list path exactly. Don't restructure it.

- `packages/shared/src/todos.ts` (+ `test/todos.test.ts`) -- add the request schema, type, and `normalizeDescription` next to `TodoSchema`. `index.ts` already re-exports it. Only `zod` may be imported.
- `apps/api/src/repositories/todo-repository.ts` -- add `create(ctx, { id, description }): Promise<Todo | null>` (`insert(todos).values(...).onConflictDoNothing({ target: todos.id }).returning()`, `null` when there's a conflict) and `findById(ctx, id): Promise<Todo | null>`. Reuse `toTodo`.
- `apps/api/src/services/todo-service.ts` -- add `create(ctx, input): Promise<{ todo: Todo; created: boolean }>` with the normalize, validate, insert, and replay logic.
- `apps/api/src/routes/todos.ts` -- `app.post(TODOS_PATH, { schema: { body: CreateTodoRequestSchema, response: { 200: TodoSchema, 201: TodoSchema } } })`. Set the status with `reply.code(created ? 201 : 200)`.
- `apps/api/src/errors.ts` -- the only error-logging site (lines 196–209). Add the params scrubbing there. Keep `isDatabaseUnavailable` working on the original error.
- `apps/api/test/todos.test.ts` -- a new `describe("POST /api/v1/todos")` block using `createTestApp`/`truncateTodos` and exact `toEqual` bodies (see the `*_BODY` constants and `expectValidationError` in `errors.test.ts`).
- `apps/api/test/errors.test.ts`, `logging.test.ts` -- patterns for DB-unreachable apps (`createTestApp({ databaseUrl })`) and `LogCapture` (`t.logs.lines`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/todos.ts` + `packages/shared/test/todos.test.ts` -- add `CreateTodoRequestSchema`, `CreateTodoRequest`, and `normalizeDescription`. Test the line-break and trim cases, and that the schema rejects unknown keys.
- [x] `apps/api/src/repositories/todo-repository.ts` -- add `create` and `findById`.
- [x] `apps/api/src/services/todo-service.ts` -- add `create` per the Boundaries and Decisions.
- [x] `apps/api/src/routes/todos.ts` -- register the POST route.
- [x] `apps/api/src/errors.ts` -- scrub DB params from logged errors.
- [x] `apps/api/test/todos.test.ts` -- one test per matrix row, all against `todos_test` via `inject`. Assert the row count and stored values with SQL through `t.pool`. For the concurrent row, use `Promise.all` on two injects. For the DB-down row, point the test app at an unreachable DB (as `errors.test.ts` does) and assert that no `t.logs.lines` entry, serialized, contains the Description.
- [x] `apps/api/test/logging.test.ts` -- add: a successful `POST /api/v1/todos` logs exactly one line, and its JSON doesn't contain the Description.

**Acceptance Criteria:**
- Given the dev stack, when I `curl -X POST` a valid body to `localhost:${WEB_PORT:-8080}/api/v1/todos` through the Vite proxy, then I get `201` and the Todo appears in the page after a reload.
- Given the repo, when I run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test`, then all exit 0, no tests are skipped, and `pnpm db:generate` reports no changes.

## Implementation Notes

- `apps/api/src/app.ts` (outside the Code Map): Fastify ships a built-in `text/plain` parser, so `text/plain` got `400`, not the `415` the matrix requires. `buildApp` now calls `app.removeContentTypeParser("text/plain")`, which makes the API JSON-only on every route.
- Log scrubbing is `toLoggableError` in `errors.ts`. It builds a new Error chain holding `name`, `message` without the `\nparams: …` suffix, `stack` with the params removed, allowlisted metadata (`code`, `errno`, `syscall`, `address`, `port`, `severity`, `routine`, `table`, `column`, `constraint`), `cause`, and AggregateError members. Everything else is dropped, including pg's `detail`, which can echo row values. The original error is never modified. A thrown non-Error object is logged only as `{ type: "non-error object" }`.

- **Review pass 1:** applied triage rows 1–6 as patches. The service now rejects a normalized Description that contains U+0000 or a lone surrogate (`reason: "invalid"`). Added `todo-service.test.ts` (a stub repository covers the replay-race retry → 201 and → `INTERNAL`), per-test no-row checks on the framework errors, a concurrent test with the same id and different text (201 + 409, one row), and a corrected test comment. Re-verified: lint/typecheck/build exit 0; 179 tests pass (shared 25, API 107, web 47), none skipped; `db:generate` reports no changes.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind + edge | A Description containing U+0000 passes validation, Postgres rejects it (22021), and the client gets `500 INTERNAL` for bad input | medium | Probe: `{"description":"a\\u0000b"}` → `500 INTERNAL` against `todos_test` | patch |
| 2 | blind + edge (+2 claims) | A lone UTF-16 surrogate is stored as U+FFFD, so the stored text differs from the input and an identical replay gets `409`, not `200` | medium | Probe: `"a\\ud800b"` → `201` with `"a\uFFFDb"`, then the same request → `409 CONFLICT`. Same root as row 1 (the service doesn't check that the text can be stored verbatim) | patch (grouped with 1) |
| 3 | verification-gap | The replay-race branch (insert → null, findById → null, retry) has no test | medium | Pre-verified: no test builds the service with a stub repository, and no DELETE route exists | patch |
| 4 | blind + edge | "writes no row for any of them" always passes, because the outer `beforeEach` truncates right before it | low | `todos.test.ts` framework-errors block; `beforeEach(() => truncateTodos(t.pool))` at the outer describe | patch |
| 5 | blind | A test comment says "Classification still sees the untouched originals", but it asserts on the sanitized copy | low | `errors.test.ts:417-418` calls `isDatabaseUnavailable(safe)` | patch |
| 6 | blind | No concurrency test for the same `id` with different Descriptions | low | Only identical concurrent payloads are tested; this path would regress if the insert-then-select logic changes, and the fix is one test | patch |
| 7 | blind + edge | After a vanished row, a retried insert that conflicts again throws `INTERNAL` instead of re-reading | low | The approved Decision says "retry the insert once, then throw `INTERNAL`". Needs a delete-and-recreate race, and no DELETE exists until Epic 2 | reject |
| 8 | blind | Normalization ignores U+2028/U+2029/U+0085 and NFC/NFD equivalence | false | AD-3 defines normalization exactly as `\r\n`/`\r`/`\n` → space, then trim | reject |
| 9 | blind | `toLoggableError` keeps driver messages that could quote values (22xxx) or inlined SQL | low | All queries are parameterized through Drizzle; the only 22xxx reachable (NUL) is fixed by row 1 and its message has no text | reject |
| 10 | blind | A thrown function passes through `toLoggableError` unchanged | low | Nothing in the codebase throws functions; the fix adds a branch | reject |
| 11 | blind | No tests for non-object JSON bodies, a missing content type, or `charset=utf-8`; `text/plain` removal is global | low | Zod strict-object validation covers non-objects; GET routes take no body; the fix adds tests for paths no client uses | reject |
| 12 | blind | The 503 test's name overstates recovery, and `not.toContain("params")` is brittle | low | Cosmetic; the assertion holds today | reject |
| 13 | blind | The `UNAVAILABLE` message differs between the log test and the response | false | `toAppError` deliberately sets "The database is unreachable." for DB errors; the unit test builds `AppError("UNAVAILABLE")` with its default message | reject |

## Design Notes

Drizzle's `DrizzleQueryError` message is ``Failed query: ${query}\nparams: ${params}`` and it keeps `.params`. Today the error handler logs it as `err`, so a failed insert would put the Description in the log. That's why the scrubbing belongs in `errors.ts`: it covers every current and future write. The scrubbing must not modify the thrown error before `toAppError` classifies it. One way is to log a sanitized copy of the chain (`name`, `message` without the params suffix, `code`, `stack` without the params lines, and `cause`).

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: all exit 0
- `docker compose up -d --wait && pnpm test` -- expected: all shared, API, and web tests pass, none skipped
- `pnpm --filter @todos/api db:generate` -- expected: no schema changes
- `curl -s -XPOST -H 'content-type: application/json' -d '{"id":"0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b","description":" hi\n"}' localhost:${WEB_PORT:-8080}/api/v1/todos -w ' %{http_code}'` -- expected: the Todo with `"description":"hi"` and `201`; running it again returns `200`
