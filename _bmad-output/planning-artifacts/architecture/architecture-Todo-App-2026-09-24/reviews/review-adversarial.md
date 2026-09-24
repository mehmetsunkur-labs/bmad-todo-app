# Adversarial Review — Architecture Spine (Todos)

- **Target:** `../ARCHITECTURE-SPINE.md` (status: draft)
- **Lens:** construct two units one level down (stories, likely built by different agents) that each obey every AD to the letter yet build incompatibly.
- **Date:** 2026-09-24
- **Verdict:** **Not ready to finalize.** The shape is sound, but AD-6 (client mutation discipline) is under-specified at the exact points where FR-10 rollback lives, and AD-2/AD-5/AD-9 leave framework-default behaviour (Fastify error shapes, nginx prefix handling, empty-body DELETE) open to divergent literal readings.

| Severity | Count |
| --- | --- |
| Critical | 2 |
| High | 7 |
| Medium | 9 |
| Low | 6 |
| **Total** | **24** |

Assumed story units: S-List (GET + list states + Try again), S-Add (create + add row + counter), S-Toggle, S-Edit (inline edit + counter), S-Delete, S-Errors (toasts, Retry, error-copy mapping), S-HttpClient (`apps/web/src/api` fetch wrapper), S-API-* (per-route route+service+repo), S-ErrHandler (Fastify error handler), S-Compose (Dockerfiles, nginx, compose), S-Tests (API test harness, e2e).

---

## Critical

### ADV-1 — "Last confirmed state" has no defined home or writer

- **Unit A (S-Toggle):** takes `previous = getQueryData(['todos']).find(id)` in `onMutate` and returns it as mutation context; on error restores `context.previous`. Obeys AD-6 step 2/4 literally: it "restores the last confirmed state" it recorded.
- **Unit B (S-Edit):** keeps a module-level `Map<id, Todo>` of confirmed Todos, written in `onSuccess` (step 3 "records it as that Todo's last confirmed state"). Obeys AD-6 step 3 literally.
- **Collision:** In TanStack Query v5, `onMutate` of a scoped mutation runs immediately (only `mutationFn` waits for the scope). So when the user toggles then edits the same Todo, S-Edit's context snapshot, or S-Toggle's, captures the *previous mutation's optimistic value*, not a confirmed one. Toggle (pending) → edit fails → rollback shows the unconfirmed toggle, which breaks FR-10 ("never keeps showing the unconfirmed change"). Unit B's Map is arguably a second Todo store, which AD-6 forbids, so Unit A can claim B violates AD-6 and B can claim A never recorded anything. The two units cannot share a rollback path, and a failed create has no confirmed state in either model.
- **AD text to add (AD-6, replace steps 3–4):**
  > The last confirmed state lives in one module, `apps/web/src/api/confirmed-store.ts`, which is the only exception to "no other store holds Todo data". It maps each `id` either to the last `Todo` the API returned (from the list GET or a mutation response) or to `ABSENT`, which covers a create that was never confirmed and a confirmed delete. Only the list query's `queryFn` and mutation `onSuccess` handlers write it, through `confirm(todo)` and `confirmAbsent(id)`. Rollback never uses an `onMutate` snapshot. It calls `rollback(id)`, which puts the confirmed value (or its absence) back into `['todos']` for that id only. All four mutation hooks use the shared helper `createTodoMutation({ apply, request, ... })` from `apps/web/src/api/todo-mutation.ts`, not their own `onMutate`/`onError`/`onSuccess` wiring.

### ADV-2 — "Cancel still-queued mutations for that scope" has no mechanism and no defined side effects

- **Unit A (S-Toggle):** implements cancellation by walking `queryClient.getMutationCache().findAll({ scope })` and calling `mutation.destroy()`/`remove`, so queued mutations disappear silently.
- **Unit B (S-Delete):** implements cancellation with a per-id "generation" counter checked inside `mutationFn`, which throws `CancelledError` so the queued mutation rejects and its `onError` fires. That `onError` shows "Couldn't delete that todo" and runs its own rollback.
- **Collision:** TanStack v5 has no public "cancel queued scoped mutation" API, so each story builds its own. A toggle fails with a delete queued behind it: Unit A's cancel path doesn't know about Unit B's generation counter, so the DELETE still runs after the rollback (the row reappears, then vanishes). Or, with Unit B's approach, the user gets two toasts and two rollbacks, the second from a stale context. Either way, UX "If one fails, the queued actions after it are dropped" and "one toast per failed action" are both broken.
- **AD text to add (AD-6 step 4):**
  > Cancellation is implemented once, in `todo-mutation.ts`. A per-id `epoch` is incremented when a mutation for that id fails. Each mutation captures the epoch in `onMutate`, and its `mutationFn` resolves to a `DROPPED` sentinel without making any network call if the epoch has changed. A dropped mutation shows no toast, runs no rollback of its own (the failing mutation's `rollback(id)` already restored the confirmed state), and doesn't write the confirmed store. Only the first failing mutation in a chain shows a toast.

---

## High

### ADV-3 — Success write clobbers a newer optimistic change in the same scope

- **Unit A (S-Toggle):** `onSuccess: (todo) => setQueryData(['todos'], list => replaceById(list, todo))` (AD-6 step 3, literally "writes the server's returned Todo into the cache").
- **Unit B (S-Edit):** user edits the description while the toggle is in flight. Its `onMutate` applied the new text immediately, and the PATCH is queued.
- **Collision:** The toggle response still carries the *old* description, and Unit A writes it over Unit B's optimistic text. The row flickers back to the old text until the edit completes, or stays that way if the edit then fails and rolls back. This breaks "Pending looks exactly like a confirmed Todo".
- **AD text to tighten (AD-6 step 3):**
  > On success, the hook calls `confirm(todo)`. The cache entry for that id is then recomputed as the confirmed Todo with every *still-pending* mutation's optimistic patch for that id re-applied in order. The raw server Todo is written directly only when no later mutation for that id is pending.

### ADV-4 — Whole-list snapshot rollback or write reverts other Todos' concurrent changes

- **Unit A (S-Delete):** follows the canonical TanStack optimistic example: `previous = getQueryData(['todos'])`, and `onError: setQueryData(['todos'], previous)`, which restores the row "in its original position".
- **Unit B (S-Add):** a create for a *different* id (different scope, so it runs in parallel) succeeds during the delete.
- **Collision:** Unit A's rollback writes back a list captured before B's create, so B's confirmed Todo disappears from the UI. Nothing refetches (AD-6 forbids invalidation), so it stays gone until reload. Scopes only serialize work per id, and the list key is shared by all ids.
- **AD text to add (AD-6):**
  > Every cache write is a functional per-id update (`setQueryData(['todos'], list => ...)` that touches exactly one id). Writing a captured list back into `['todos']` is forbidden. When a deleted Todo is restored, it's inserted at the index given by the canonical order (`createdAt DESC, id DESC`, using the shared `compareTodos` from `packages/shared`), not at a remembered array index.

### ADV-5 — Query defaults let the list refetch behind optimistic state

- **Unit A (S-List):** `useQuery({ queryKey: ['todos'], queryFn })` with defaults, and `refetchOnWindowFocus` and `refetchOnReconnect` turned off as AD-6 requires.
- **Unit B (S-Add):** the Empty state component unmounts and `<TodoList>` mounts with its own `useTodos()` observer on the first create.
- **Collision:** With the default `staleTime: 0` and `refetchOnMount: true`, the new observer triggers a background GET. It can resolve without the pending Todo and overwrite the optimistic row, or bring back a Todo whose delete is still in flight. Also, the default query `retry: 3` with exponential backoff means Load error appears after about 40 s or more, not "took longer than 10 s" (FR-3). AD-6 says only "fetched on page load and Try again", and neither unit breaks that on purpose.
- **AD text to add (AD-6):**
  > The single `QueryClient` in `apps/web/src/api/query-client.ts` sets these defaults for queries: `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnMount: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry: false`, and `networkMode: 'always'`. For mutations it sets `retry: false` and `networkMode: 'always'`. No hook overrides them. "Try again" calls `queryClient.resetQueries({ queryKey: ['todos'] })`, which returns the query to `pending` so the Loading state renders. `refetch()` can't be used here, because it keeps `status: 'error'`.

### ADV-6 — PATCH body content is ambiguous: full-row edits revert concurrent toggles

- **Unit A (S-Toggle):** sends `{ completed: true }`.
- **Unit B (S-Edit):** sends `{ description, completed: todo.completed }` built from the row props it captured when edit mode opened. This is valid under AD-2 (`description?, completed?`, at least one).
- **Collision:** If the user toggles and then saves an edit, B's PATCH carries the *pre-toggle* `completed` and silently reverts the toggle on the server. The response confirms the revert. There is also a server-side split: S-API-Patch uses `z.strictObject` (unknown keys give 400), while S-Edit sends `id`, `createdAt`, and `updatedAt` along with the row, which AD-3 says are "ignored if a client sends them" (so the schema should strip them). A `null` value is also undefined: is it "clear" or a 400?
- **AD text to add (AD-2 / AD-3):**
  > A PATCH body contains only the fields the user action changed. Toggle sends only `completed` (an absolute value, never a flip), and edit sends only `description`. `UpdateTodoSchema` in `packages/shared` is `z.object({ description: DescriptionSchema.optional(), completed: z.boolean().optional() })` with `.refine(atLeastOne)`. Unknown keys are stripped, not rejected, and `null` is invalid (400 `VALIDATION_ERROR`). `CreateTodoSchema` also strips unknown keys.

### ADV-7 — Framework-generated errors bypass the AD-5 envelope

- **Unit A (S-API-Create):** validates the body through `@fastify/type-provider-zod` exactly as AD-1 requires. A schema failure throws Fastify's `FST_ERR_VALIDATION` (`{ statusCode, code: 'FST_ERR_VALIDATION', error, message }`), not an `AppError`.
- **Unit B (S-ErrHandler):** maps `AppError` to its code, and anything else to `INTERNAL` 500, as AD-5 says ("Unhandled errors map to INTERNAL").
- **Collision:** A description that is too long returns 500 `INTERNAL`, so the web never shows "That todo is too long". Other framework-generated errors have no mapping either: malformed JSON (400 `FST_ERR_CTP_INVALID_JSON_BODY`), an empty JSON body (`FST_ERR_CTP_EMPTY_JSON_BODY`), a body over `bodyLimit` (413), a wrong content type (415), and an unknown route (404 from Fastify's default not-found handler, which `setErrorHandler` never sees). Each gets either the Fastify default shape, which the web's envelope parse rejects, or a code outside the enum.
- **AD text to add (AD-5):**
  > One `setErrorHandler` and one `setNotFoundHandler` in `apps/api/src/server.ts` produce every non-2xx response. They map errors as follows:
  > - `err.validation` (a schema failure in body, params, or query), `FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`, `FST_ERR_CTP_BODY_TOO_LARGE`, and `FST_ERR_CTP_INVALID_MEDIA_TYPE` → 400 `VALIDATION_ERROR`
  > - unknown route → 404 `NOT_FOUND`
  > - `AppError` → its own code
  > - anything else → 500 `INTERNAL`
  >
  > An API test asserts the envelope for each of these cases.

### ADV-8 — nginx strips `/api/` and Vite doesn't

- **Unit A (S-Compose):** `location /api/ { proxy_pass http://api:3000/; }`. AD-9 says "reverse-proxies `/api/` to `api:3000`", and this does exactly that. The trailing `/` makes nginx replace the `/api/` prefix.
- **Unit B (S-API-*):** registers routes at `/api/v1/todos` per AD-2. Vite's dev proxy forwards `/api/v1/todos` unchanged.
- **Collision:** Everything works in dev. In the production-like stack the API receives `/v1/todos` and returns 404, which only the e2e run catches. The opposite pairing, where the API registers `/v1` and nginx strips, breaks dev instead.
- **AD text to tighten (AD-9):**
  > The `/api` prefix is never stripped or rewritten anywhere. The API registers its routes at the full path `/api/v1/...`, taken from `API_PREFIX` in `packages/shared`. nginx uses `location /api/ { proxy_pass http://api:3000; }` with no URI part. The Vite proxy entry is `'/api': 'http://api:3000'` with no `rewrite`. The SPA fallback `try_files $uri /index.html` applies only to `location /`.

### ADV-9 — The HTTP client's generic JSON handling breaks DELETE both ways

- **Unit A (S-HttpClient):** a generic `request(method, path, body?)` that always sends `content-type: application/json` and always calls `res.json()` before parsing with the schema (AD-1: "parses every response with the same schema").
- **Unit B (S-Delete):** calls `request('DELETE', ...)` and expects `204`.
- **Collision:** Fastify rejects a request that has `content-type: application/json` and an empty body with 400 `FST_ERR_CTP_EMPTY_JSON_BODY`. After ADV-7 that becomes `VALIDATION_ERROR`, so every delete fails and rolls back. If the server accepted it, `res.json()` on a 204 would throw, the client would classify the delete as failed, and it would roll back a delete that actually succeeded. Unit A also has no defined way to classify a non-JSON 502 page from nginx.
- **AD text to add (AD-1 or a new client-data AD):**
  > `apps/web/src/api/http.ts` is the only `fetch` caller. It sets `content-type: application/json` only when a body is present. For 204 it returns `undefined` without reading the body. For any other 2xx it parses the body with the caller's schema. For a non-2xx response whose body parses as `ErrorEnvelopeSchema`, it throws `ApiError{ kind: 'api', status, code }`. For a non-2xx response that doesn't parse, it throws `ApiError{ kind: 'api', code: 'INTERNAL' }`. For a fetch rejection, an abort, or a timeout, it throws `ApiError{ kind: 'NETWORK' }`. A response that fails its schema parse is treated as `INTERNAL`.

---

## Medium

### ADV-10 — Failed create with same-scope follow-ups queued

- **Unit A (S-Add):** when the create fails, it removes the row and puts the text back in the Add input.
- **Unit B (S-Edit or S-Toggle):** the user toggles or edits the still-pending row, and the mutation is queued in scope `{ id }`. If ADV-2's cancel isn't wired into the create hook, the PATCH runs, gets 404, and AD-4 says to "remove that Todo from its cache and show the toggle or edit failure copy". That produces a second toast. It's also unclear which text goes back into the input: the original text, or the text from the queued edit.
- **AD text to add (AD-6 + AD-4):**
  > Create uses the same shared mutation helper and the same scope `{ id }`, so a failed create drops every queued follow-up (ADV-2). The text restored to the Add input is the Description from the create request, not any later optimistic edit.

### ADV-11 — `VALIDATION_ERROR` can't select the "too long" copy

- **Unit A (S-Errors):** maps `VALIDATION_ERROR` to "That todo is too long. The limit is 500 characters." for add and edit.
- **Unit B (S-Add):** maps `VALIDATION_ERROR` to the add failure copy. This is also valid, because the code can also mean an empty description after trimming, a bad id, or (after ADV-7) malformed JSON.
- **Collision:** The same server response produces different copy depending on which unit's map runs. Code plus action isn't enough to identify the "too long" case that the UX requires.
- **AD text to add (AD-5):**
  > The envelope has an optional `error.field` (`'description' | 'id' | 'body'`) and `error.reason` (`'too_long' | 'empty' | 'invalid'`), which are additive fields. The web shows the "too long" copy only for `VALIDATION_ERROR` with `field: 'description', reason: 'too_long'`. The code-plus-action → copy map lives in exactly one module, `apps/web/src/api/error-copy.ts`.

### ADV-12 — A 404 on PATCH triggers both the generic rollback and a removal

- **Unit A (shared mutation helper):** on any failure, calls `rollback(id)`, which puts the confirmed Todo back (AD-6 step 4).
- **Unit B (S-Edit):** on 404, removes the Todo and shows the edit failure copy (AD-4). It also reopens edit mode with the attempted text, as the UX says for a failed edit.
- **Collision:** Whether the row ends up restored, removed, or in edit mode on a row that no longer exists depends on handler order. The UX "Failed edit" state and AD-4's removal contradict each other.
- **AD text to tighten (AD-4):**
  > On a 404 from PATCH, `confirmAbsent(id)` runs *instead of* the rollback. The row is removed, edit mode doesn't reopen, the "Retry" toast isn't offered, and the plain failure copy for the action is shown. A DELETE 404 runs `confirmAbsent(id)` and counts as success.

### ADV-13 — Retry and resubmitting after a timeout create duplicates

- **Unit A (S-Errors):** the Retry action calls `addTodo.mutate({ description })`, and the hook generates a fresh UUIDv7, as S-Add does for every submit.
- **Unit B (S-API-Create):** the timed-out first POST actually committed on the server.
- **Collision:** A second Todo with a new id is created, and both appear on reload. AD-4's idempotency only works if the id is reused. The same thing happens when the user presses Add again on text that was restored after a timeout.
- **AD text to add (AD-4):**
  > Retry resubmits the failed mutation with its *original variables, including its id*. When the Add row submits text identical to the most recent failed create (after trimming), it reuses that create's id. A new id is generated only for new text.

### ADV-14 — The idempotent POST check-then-insert race gives 500

- **Unit A (S-API-Create service):** `findById`, then `insert` if not found. Each call is one statement, which satisfies AD-7 per call.
- **Unit B (a retry arriving while the first request is still in the DB, possible after the client's 10 s abort):** both requests miss the lookup, and the second insert hits PK violation `23505`, which becomes `INTERNAL`.
- **AD text to add (AD-4 / AD-7):**
  > Create is `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING *`. If it returns no row, the service selects the stored row and compares descriptions (after trimming) to decide between 200 and 409. A unique-violation error never escapes as `INTERNAL`.

### ADV-15 — Timestamp source, precision, and driver mode

- **Unit A (S-API-Create repo):** `created_at timestamptz DEFAULT now()`, which stores microseconds. The Drizzle column uses `mode: 'string'` and returns `2026-09-24 09:14:03.120456+00`, which fails the `z.iso.datetime()` response schema and becomes a 500.
- **Unit B (S-API-Patch service):** sets `updatedAt = new Date()` from the API container clock, while `createdAt` comes from the DB clock (`now()`). A skewed container clock gives `updatedAt < createdAt`. Two rows created in the same millisecond order by microsecond in SQL but compare equal in JSON, so any client-side sort (ADV-4's `compareTodos`) falls back to `id DESC` and disagrees with the server's order.
- **AD text to add (AD-3 / AD-7):**
  > Columns are `timestamptz(3)`, which stores millisecond precision so JSON round-trips exactly. Both timestamps come from the DB (`now()`, set in the same statement). Drizzle uses `mode: 'date'`, and serialization is `toISOString()`. Change detection happens in SQL, in the same UPDATE, using `IS DISTINCT FROM`.

### ADV-16 — UUID strictness differs across schema, column, and seed data

- **Unit A (packages/shared):** `id: z.uuidv7()`, the strictest reading of AD-4.
- **Unit B (S-API migration):** `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, a v4 default. Test fixtures use `crypto.randomUUID()` (v4). Separately, a route whose params use `z.string()` passes `"abc"` to Postgres, which raises `22P02`, which becomes `INTERNAL` rather than 404/400.
- **Collision:** Any v4 row makes the web's whole-list parse fail, which shows the Load error state for the entire list.
- **AD text to add (AD-3 / AD-4):**
  > `TodoIdSchema = z.uuid()` (any RFC 9562 version) is used for responses, create bodies, and `:id` params. UUIDv7 is how the web *generates* ids, not what the server validates. The column is `uuid PRIMARY KEY` with no default. A malformed `:id` returns 400 `VALIDATION_ERROR`. Test fixtures use `uuid` v7.

### ADV-17 — API test DB provisioning and isolation

- **Unit A (S-Compose):** creates `todos_test` with an `initdb.d` script. That script only runs on an empty volume, so existing developer volumes never get the database.
- **Unit B (S-API tests for create and for list, written by different agents):** each runs `TRUNCATE todos` in `beforeEach`. Vitest runs files in parallel, so list-order assertions become flaky. Separately, e2e tests run against the default compose project and wipe the real `todos-data` volume.
- **AD text to add (Testing convention):**
  > A Vitest `globalSetup` in `apps/api` creates `todos_test` if it doesn't exist and runs migrations once. API tests run with `fileParallelism: false`, and each test cleans up with `TRUNCATE` in `beforeEach`. E2E uses its own compose project (`-p todos-e2e`) with its own volume, and never the `todos-data` volume.

### ADV-18 — Offline mutations pause instead of failing

- **Unit A (S-Toggle):** uses the TanStack default `networkMode: 'online'`.
- **Unit B (S-Errors e2e):** expects a toast and a rollback when the phone is offline. With the default, the mutation is *paused*, `mutationFn` never runs, `AbortSignal.timeout` never starts, and the row stays pending until the connection comes back. Then it fires, possibly hours later. This is covered by the ADV-5 defaults (`networkMode: 'always'`), and is listed separately because it's the one default that silently breaks FR-10.

---

## Low

### ADV-19 — There are two `AppError`s, and the repository not-found signal differs

S-API-Patch defines `AppError` in `services/errors.ts`, and S-API-Delete defines another in `lib/errors.ts`. `instanceof` fails in the handler, so the response is 500. The repository `update` returns `null` on a miss while `delete` throws, and the shared service file mixes both. **Fix:** "`AppError` is defined once in `apps/api/src/errors.ts`. Repositories return `null` (or `false` for delete) on a miss and never throw `AppError`. Services translate a miss to `NOT_FOUND`."

### ADV-20 — The counter threshold comparison and measured length

S-Add shows the counter at `len > COUNTER_THRESHOLD` on raw input, and S-Edit at `len >= COUNTER_THRESHOLD` on trimmed text. **Fix:** "`shouldShowCounter(len)` is exported from `packages/shared` as `len >= COUNTER_THRESHOLD`, measured on the raw, untrimmed input value. The Add row and the Inline edit field render one shared `CharacterCounter` component."

### ADV-21 — Health endpoint semantics

S-API-Health returns a static `{ status: 'ok' }`, which is literally true because migrations ran before `listen`. S-Compose uses it as a readiness probe after the DB has died, and needs a failing status, which has no code in the closed enum. The Node image may also lack `curl`. **Fix:** "Health runs `SELECT 1` with a 1 s timeout. On failure it returns 503 `{ error: { code: 'UNAVAILABLE' } }`, and `UNAVAILABLE` is added to `ErrorCode`. The compose healthcheck uses `node -e "fetch(...)"`."

### ADV-22 — The closed `ErrorCode` enum vs additive-only v1

AD-2 allows additive changes, but a web client that parses with `z.enum([...])` rejects any new code. Under ADV-9 that becomes `INTERNAL`, which is survivable but accidental. **Fix:** "The web parses `code` with `.catch('INTERNAL')`, so unknown codes degrade to `INTERNAL` explicitly."

### ADV-23 — Migrations on startup with more than one API instance

AD-7 runs migrations on startup, and the `drizzle-orm` migrator takes no lock. A `docker compose up --scale api=2` or a watch-restart overlap can run them concurrently. **Fix:** "`api` runs as exactly one replica in v1. The migrate step is wrapped in `pg_advisory_lock(<const>)`."

### ADV-24 — Logging of validation failures

S-ErrHandler logs `err` at `error`/`warn` level. The Fastify validation error carries the Zod issues, which can include the received `input` value (the description text), and that breaks AD-11. **Fix:** "Validation errors are logged at `info` level with only `code` and the issue paths. Zod `reportInput` stays off. Unhandled errors log their stack but never `err.validation` or the request body."
