---
title: 'Story 3.2: Documented API and a README that gets a new developer running in 15 minutes'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'eaf5183099926ce273576919dffd54a1892215e2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A developer joining the project has no README, and the API has no documentation. `pnpm api:docs` is a stub, and nothing describes the endpoints, schemas or error codes, how to run the dev stack and the production-like stack, or how the parts fit together.

**Approach:**
- Generate an OpenAPI document with `@fastify/swagger` from the existing shared Zod schemas. Serve it at `GET /api/v1/openapi.json`, and commit a snapshot at `docs/api/openapi.json` written by `pnpm api:docs`. A test fails when the snapshot drifts.
- Write a root `README.md` covering the checklist in the Story 3.2 acceptance criteria.
- Check the README once with a documented walkthrough.

## Boundaries & Constraints

**Always:**
- **One schema source.** Every request and response schema in the document comes from the `packages/shared` Zod schemas through the route `schema` definitions and `jsonSchemaTransform` from `@fastify/type-provider-zod`. Error responses use the shared `ErrorEnvelopeSchema`, whose `code` enum lists all five AD-5 codes. Nothing is hand-written.
- **Error statuses per route (AD-5, amended 2026-09-25):** each route documents every status the API can actually return, including the framework-level ones: 400 for a malformed URL on any route, and 413/415 wherever Fastify parses a body, which includes DELETE.
  - `GET /api/v1/health`: 200, 400, 500, 503
  - `GET /api/v1/todos`: 200, 400, 500, 503
  - `POST /api/v1/todos`: 200, 201, 400, 409, 413, 415, 500, 503
  - `PATCH /api/v1/todos/{id}`: 200, 400, 404, 413, 415, 500, 503
  - `DELETE /api/v1/todos/{id}`: 204, 400, 404, 413, 415, 500, 503

  Each error status has a description naming its AD-5 code and cause.
- **Unchanged API behaviour.** Every existing status code and response body stays the same. All existing API tests pass unchanged.
- **Runtime dependency.** `@fastify/swagger` is pinned at `~9.9.0` as an API runtime dependency, because the live endpoint is served in production too.
- **Snapshot format.** The snapshot is deterministic `JSON.stringify(doc, null, 2) + "\n"` and is excluded from Prettier.
- **README accuracy.** The README describes only what exists. It uses the real commands, ports and `.env.example` keys, and it says that `pnpm test:e2e` is still a stub owned by Story 3.3.

**Never:**
- Don't add `@fastify/swagger-ui` or any other UI.
- Don't change web code.
- Don't add new error codes.
- Don't change the compose topology or the Dockerfiles, beyond what the API image needs to include the new files automatically.
- Don't run `docker compose down -v`, or any disruptive command, against the user's `todos` project.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Live doc | `GET /api/v1/openapi.json` | `200` JSON, `openapi: 3.x`, the same document as the snapshot | — |
| Paths covered | the document's `paths` | exactly `/api/v1/health`, `/api/v1/todos` (get, post), and `/api/v1/todos/{id}` (patch, delete). The doc route itself is hidden. | — |
| Request schemas | POST and PATCH `requestBody` | JSON schemas from `CreateTodoRequestSchema` and `UpdateTodoRequestSchema`, with `additionalProperties: false` | — |
| Error responses | every operation | the statuses in the Always list, each with the `ErrorEnvelopeSchema` shape, and a `code` enum equal to `ErrorCodeSchema.options` | — |
| Documented = reachable | a malformed URL on GET health and GET todos; DELETE with a `text/plain` body; DELETE with a JSON body over 16 KiB | `400`, `415`, and `413` `VALIDATION_ERROR` envelopes. Each is listed for that operation in the document | existing handlers |
| Snapshot in sync | `docs/api/openapi.json` matches the current schemas | the drift test passes | — |
| Snapshot drift | a schema change without re-running `pnpm api:docs` | the drift test fails and names `pnpm api:docs` as the fix | test assertion |
| Existing errors | any existing error scenario (400/404/409/413/415/500/503) | the same status and envelope body as before the change | existing handlers |

</intent-contract>

## Code Map

- `apps/api/src/app.ts` -- `buildApp({ pool, logger })` registers compilers, error handlers, then `healthRoutes` and `todoRoutes`. Swagger must register **before** the routes, because it collects them via `onRoute`. The doc route goes here too.
- `apps/api/src/routes/todos.ts`, `apps/api/src/routes/health.ts` -- the route `schema` blocks currently declare only success responses. Add the error statuses here.
- `apps/api/src/errors.ts` -- `DEFAULT_STATUS` (L7) is the code→status table. `sendError` is the only error body writer, and `handleFrameworkError` covers the 400/413/415 parser errors. Read-only.
- `packages/shared/src/errors.ts` -- `ErrorCodeSchema`, `ErrorEnvelopeSchema` (non-strict response schema). Reuse; don't redefine.
- `packages/shared/src/paths.ts` -- `API_PREFIX` and the path constants. Add `OPENAPI_PATH` here.
- `node_modules/@fastify/type-provider-zod` (1.0.0) -- exports `jsonSchemaTransform`, and its README has a swagger example. `@fastify/swagger@9.9.0` is already in `pnpm-lock.yaml` as a resolved peer.
- `apps/api/test/helpers.ts` -- `createTestApp` for `inject`-based tests. Tests run against `todos_test` via `vitest.config.ts`.
- `package.json` (root) -- `"api:docs"` is a `console.log` stub. `.prettierignore` lists ignored paths.
- `.env.example` -- the keys the README must explain: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `WEB_PORT`, `DB_PORT`. `TEST_DATABASE_URL` is an optional override read by `apps/api/vitest.config.ts`.
- `compose.yaml`, `compose.override.yaml`, `scripts/stack-smoke.test.mjs` -- from Story 3.1. The prod stack runs with `-f compose.yaml up -d --build`, and `pnpm test:stack` is the Docker smoke suite. The dev inspector is fixed at `127.0.0.1:9229`.
- `apps/web/src/api/todo-sync.ts`, `apps/web/src/api/http.ts` -- the source for the README's one-paragraph `todo-sync` summary: the confirmed state, pending ops, a generation per id, rollback on failure, and `http.ts` as the only `fetch` caller. Read-only.

## Tasks & Acceptance

**Execution:**
- **Start from the saved attempt:** run `git apply _bmad-output/implementation-artifacts/spec-3-2-documented-api-and-a-readme-that-gets-a-new-developer-running-in-15-minutes-attempt-1.patch` and then `pnpm install`. The patch already implements the tasks below. Apply only the amendments in the Spec Change Log, and keep everything else the patch gets right.
- `apps/api/package.json` -- add `@fastify/swagger` `~9.9.0` to `dependencies`, and a script `"api:docs": "tsx scripts/write-openapi.ts"`. Run `pnpm install` so the lockfile records the direct dependency.
- `packages/shared/src/paths.ts` -- add `OPENAPI_PATH = \`${API_PREFIX}/openapi.json\``.
- `apps/api/src/openapi.ts` (new):
  - `registerOpenApi(app)` registers `@fastify/swagger` with `openapi: { info: { title: "Todos API", version: "1.0.0", description } }` and `transform: jsonSchemaTransform`.
  - It also adds a hidden (`schema: { hide: true }`) `GET OPENAPI_PATH` route that returns `app.swagger()`.
  - `errorResponses(...statuses)` returns `{ [status]: ErrorEnvelopeSchema.describe("<CODE> — <cause>") }` for the given statuses, based on AD-5.

  -- This keeps one place for doc wiring and the status descriptions.
- `apps/api/src/app.ts` -- call `registerOpenApi(app)` after the error handlers and before the routes. -- Swagger sees every route.
- `apps/api/src/routes/todos.ts`, `apps/api/src/routes/health.ts` -- spread `errorResponses(...)` into each `response` map, using the Always list. Document `204` for DELETE as an empty response (for example, `z.null().describe("No content")`), and confirm DELETE still sends an empty body. -- This documents every error code without changing behaviour.
- `apps/api/scripts/write-openapi.ts` (new) -- build the app with a pool on a placeholder `postgres://` URL (it never connects) and a silent logger. `await app.ready()`, write `docs/api/openapi.json` at the repo root, then close the app and the pool. Export the document builder from `src/openapi.ts`, for example `generateOpenApiDocument()`, so the test uses the same code. Add `scripts` to `apps/api/tsconfig.json` `include`.
- `package.json` (root) -- set `"api:docs": "pnpm --filter @todos/api api:docs"`. `.prettierignore` -- add `docs/api/openapi.json`.
- `docs/api/openapi.json` (new, generated) -- create it by running `pnpm api:docs`. Never edit it by hand.
- `apps/api/test/openapi.test.ts` (new) -- cover every I/O matrix row:
  - The live endpoint through `createTestApp().inject` matches `generateOpenApiDocument()`.
  - `paths` and methods are exactly the expected ones, and the doc route is absent.
  - The request bodies for POST and PATCH are strict.
  - Every operation lists exactly its statuses, and each error response's `code` enum equals `ErrorCodeSchema.options`.
  - The committed snapshot deep-equals the generated document, with a failure message telling you to run `pnpm api:docs`.
  - A drift case: mutate a copy of the generated document and assert the same comparison helper reports a mismatch.

  The "existing errors" row is covered by the unchanged existing suites passing.
- `README.md` (new, repo root) -- cover every item in the Story 3.2 acceptance criteria:
  - **Prerequisites:** Docker with Compose v2, Node 24, and pnpm 12.6 via corepack.
  - **Dev stack:** `cp .env.example .env`, then `docker compose up`. Name the URLs and ports, the inspector on `127.0.0.1:9229`, and `docker compose up --build -V` after dependency changes.
  - **Tests and lint:** `pnpm test` (needs the dev db for `todos_test`), `pnpm lint`, `pnpm typecheck`, `pnpm test:stack` (Docker), and `pnpm test:e2e` (Story 3.3 stub).
  - **Production-like stack:** `docker compose -f compose.yaml up -d --build`. Explain reaching it from a phone at `http://<host-LAN-IP>:${WEB_PORT}`: finding the IP, host firewall, plain HTTP.
  - **Settings:** a table covering every `.env.example` key.
  - **Data:** where it lives (the `todos-data` volume, and `docker volume ls`).
  - **Upgrading without losing data:** `git pull`, then `up -d --build` (without it the old images keep running). Migrations apply automatically. Never use `-v`.
  - **Warning:** a prominent `> [!WARNING]` block saying that `docker compose down -v` permanently deletes all Todos.
  - **One mode at a time:** dev and prod share the `todos` project, containers, port and volume. Switching modes replaces the other mode's containers, and a volume first created by prod has no `todos_test` database.
  - **API docs:** a link to `docs/api/openapi.json` and to the live `/api/v1/openapi.json`.
  - **Repo map:** one paragraph covering web → shared ← api, where things live, the `/api/v1` same-origin proxy, and the `todo-sync` protocol.
- `_bmad-output/implementation-artifacts/spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone.md` -- read-only. Its deferred shared-volume item is answered here by the README's one-mode-at-a-time rule.

**Acceptance Criteria:**
- Given the API is running (dev stack or `createTestApp`), when I request `GET /api/v1/openapi.json`, then I get the generated OpenAPI document covering every endpoint, request and response schema, and all five AD-5 error codes.
- Given the repository, when I run `pnpm api:docs`, then `docs/api/openapi.json` is rewritten, and `git diff` is empty when the schemas haven't changed.
- Given the README, when I read it, then every item in the Story 3.2 checklist is present and every command in it works as written.
- Given a developer who did not build the app, when they follow only the README, then within 15 minutes they have the app running and can explain its data flow. This is recorded once in `docs/onboarding-walkthrough.md`.

## Spec Change Log

### 2026-09-25 — Owner decision on the review intent gap (per-route statuses)
- **Trigger:** a `[medium]` review finding, confirmed with `inject`. `DELETE /api/v1/todos/{id}` returns 415 for a `text/plain` body and 413 for a body over 16 KiB. A malformed URL returns 400 on every route. The contract's per-route list left these out, so the document under-reported and the test locked that in.
- **Amended (owner-approved option 1):**
  - The Always list now documents every reachable status: 400 added to GET health and GET todos, and 413/415 added to DELETE.
  - A new matrix row, "Documented = reachable".
  - The queued first-pass patches are folded in:
    - Build the error descriptions from `DESCRIPTION_MAX` (`packages/shared/src/limits.ts`) and `BODY_LIMIT_BYTES` (`apps/api/src/errors.ts`), not literals.
    - When `docs/api/openapi.json` is missing, the snapshot test fails with a message to run `pnpm api:docs`, not a bare ENOENT.
    - The generator closes the pool even if `app.close()` rejects (nested `try`/`finally`).
    - `docs/onboarding-walkthrough.md` is marked **partial**: agent walker, cached images, prod path only because the dev stack couldn't start while the owner's dev stack held port 9229. It lists the skipped stop and `createdb` steps, names a human walkthrough as the follow-up (owner: Msunkur), and is linked from the README.
  - `openapi.test.ts`: `EXPECTED_STATUSES` is updated to the amended list. New behaviour tests pin each "Documented = reachable" case (status and envelope) through `inject`.
- **Known-bad state avoided:** an OpenAPI document and test that claim "exactly the statuses" while the API returns undocumented 413, 415, and 400.
- **KEEP:**
  - The attempt-1 patch's `registerOpenApi`/`errorResponses` wiring, the hidden doc route, `OPENAPI_PATH`, and the byte-stable snapshot excluded from Prettier.
  - The DB-free generator, and the 204 `z.null()` with the empty-body test.
  - The README structure and content, including the `down -v` warning, the one-mode-at-a-time rule, and the upgrade with `--build`.
  - Do not re-run the walkthrough. Amend the existing record as above.

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 30 findings — high 0, medium 4, low 22, false 4, maybe-false 0
- attempt patch: [spec-3-2-documented-api-and-a-readme-that-gets-a-new-developer-running-in-15-minutes-attempt-1.patch](spec-3-2-documented-api-and-a-readme-that-gets-a-new-developer-running-in-15-minutes-attempt-1.patch). Code reverted to `baseline_revision`, and the patch reapplies cleanly (`git apply --check`).
- findings:
  - `[medium]` `[intent_gap]` (blind) DELETE omits 413 and 415, although Fastify parses DELETE bodies. — Confirmed by verification-gap via `inject`: `text/plain` gives 415 and a 17 KB JSON body gives 413, both with the `VALIDATION_ERROR` envelope. The intent contract's Always list fixes DELETE at 204/400/404/500/503.
  - `[low]` `[intent_gap]` (blind) `handleFrameworkError` returns 400 for a bad URL (for example a bad percent-encoding) on any route, but GET health and GET todos document no 400. — Same root cause as the DELETE finding: the contract's per-route status list leaves out the framework-level AD-5 errors.
  - `[low]` `[patch]` (blind) The error descriptions hard-code "1–500 characters" and "16 KiB" instead of `DESCRIPTION_MAX` and `BODY_LIMIT_BYTES`. — A direct fix. Moot (intent_gap).
  - `[low]` `[reject]` (blind) There are no shared components or `$ref`s, so the error envelope is inlined everywhere. — This is style and size only, and the document is still correct.
  - `[low]` `[reject]` (blind) Each `.describe()` text appears twice (as the response description and the schema description). — Cosmetic.
  - `[low]` `[reject]` (blind) There are no `operationId`s, summaries, examples or `servers`. — An enhancement. Neither the story nor AD-5 requires it.
  - `[low]` `[reject]` (blind) `openapi.ts` and `app.ts` import each other. — Nothing runs at module load, and `createPool`/`createLogger` are already in the production module graph. It has no runtime effect.
  - `[low]` `[reject]` (blind) The drift test needs the database, and there's no CI. — Every API test in this repo runs against `todos_test`, and CI is out of scope (NFR).
  - `[low]` `[patch]` (blind) The walkthrough record reads as a pass, but the dev-stack path wasn't run, the images were cached, and the walker was an agent. — Mark the record "partial" and name a human follow-up. Moot (intent_gap).
  - `[low]` `[patch]` (blind) The walkthrough table skips the stop step and the `createdb` step, and contradicts the README. — Moot (intent_gap).
  - `[low]` `[patch]` (blind) The README doesn't link `docs/onboarding-walkthrough.md`. — Moot (intent_gap).
  - `[low]` `[reject]` (blind) There's no backup or restore recipe. — Not in the Story 3.2 checklist. Worth a follow-up, not a defect.
  - `[false]` `[reject]` (blind) The epic-context edit is out of scope. — That file was regenerated by the workflow's compile step (it's cached planning context), not written by the story.
  - `[low]` `[reject]` (blind) Error replies are now validated by the serializer and could turn into a 500. — Verification-gap confirmed that the existing envelope tests cover every error status through the real routes (400/413/415/404/409/503), so no current path fails.
  - `[false]` `[reject]` (intent-alignment) The committed snapshot is missing from the patch. — It was left out of the review diff on purpose because it is generated. It was on disk and is in the attempt patch.
  - `[low]` `[reject]` (intent-alignment) Criterion (a) is tested in-process, not through the proxy. — The walkthrough's `curl` through nginx matched the snapshot, and `pnpm test:stack` covers the proxy. Low.
  - `[low]` `[reject]` (intent-alignment) The status→code mapping lives only in the descriptions. — The descriptions name the code, the test checks them, and the enum is complete.
  - `[low]` `[reject]` (intent-alignment) The drift test needs the database. — Same root cause and evidence as the blind drift-test row.
  - `[low]` `[reject]` (intent-alignment) The README is verified only by the walkthrough. — By design (SM-5 is a documented walkthrough).
  - `[low]` `[patch]` (intent-alignment) SM-5 used an AI agent and the prod path only. — Same root cause as the walkthrough-record row. Moot.
  - `[false]` `[reject]` (intent-alignment) There are changes outside the story. — The epic context is a workflow artifact, and `send(null)` is pinned by a test that checks an empty body with no content-type.
  - `[medium]` `[intent_gap]` (verification-gap, other) DELETE's 413 and 415 are undocumented. — Same root cause as the blind DELETE row. Evidence: the `inject` reproduction.
  - `[false]` `[reject]` (verification-gap, other) The snapshot isn't in the diff. — Same as the intent-alignment snapshot row.
  - `[medium]` `[intent_gap]` (edge-case) DELETE's 413 and 415 are undocumented. — Same root cause as the blind DELETE row.
  - `[low]` `[patch]` (edge-case) The hard-coded limits in the descriptions. — Same root cause as the blind limits row. Moot.
  - `[low]` `[reject]` (edge-case) An envelope that stops matching the schema would become a 500. — Same evidence as the blind serializer row.
  - `[low]` `[patch]` (edge-case) A missing snapshot throws a bare ENOENT instead of the `pnpm api:docs` hint. — A direct fix. Moot.
  - `[low]` `[patch]` (edge-case) If `app.close()` rejects, `pool.end()` is skipped in the generator. — Nest the `try`/`finally`. Moot.
  - `[low]` `[reject]` (edge-case, claim) "Without changing behaviour" isn't exactly true. — The wire behaviour is unchanged, and the existing suites pass unchanged.
  - `[medium]` `[intent_gap]` (edge-case, claim) "Every operation lists exactly its statuses" is false for DELETE. — Same root cause as the blind DELETE row.

### 2026-09-25 — Review pass (after the per-route status amendment)
- verdicts: 24 findings — high 0, medium 4, low 19, false 1, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) The snapshot file isn't in the diff. — carried: it's left out of the review diff because it's generated, and it is committed with the change.
  - `[medium]` `[patch]` (blind) The DELETE 204 is documented as an `application/json` null body, but the API sends no body. — Fixed: the swagger `transform` wraps `jsonSchemaTransform` and turns any 204 into `{ type: "null", description: "No content" }`, so the snapshot now shows `{"description":"No content"}` with no `content`. A new snapshot test pins it, and the runtime empty-body test is unchanged.
  - `[low]` `[reject]` (blind) There's no OpenAPI validator run over the snapshot. — The 204 issue was valid OpenAPI, so a validator wouldn't have caught it. An enhancement.
  - `[low]` `[reject]` (blind) The reachability tests cover only the matrix cases, and the auto-generated `HEAD` routes are undocumented. — The other statuses are covered by the existing route suites (verification-gap confirmed this in pass 1). `HEAD` is Fastify's automatic mirror of GET, not an API operation. Documenting it would contradict the contract's exact-paths row, and disabling it would change behaviour.
  - `[low]` `[reject]` (blind) Error replies are now serialized by the envelope schema. — carried: the existing `expectValidationError` tests check the envelopes byte-for-byte, including `details`.
  - `[low]` `[reject]` (blind) The drift check depends on a database. — carried.
  - `[low]` `[reject]` (blind) `openapi.ts` and `app.ts` import each other. — carried.
  - `[low]` `[reject]` (blind) The 400 description is the same on every route. — It says "depending on the route" and lists the causes. Per-route text would be cosmetic.
  - `[low]` `[reject]` (blind) There's no summary, `operationId` or tags, and the version is hard-coded. — carried (an enhancement).
  - `[low]` `[patch]` (blind) The 413 test hard-codes 17 KiB. — Fixed: the payload is `BODY_LIMIT_BYTES + 1`, and the title is built from the constant.
  - `[low]` `[patch]` (blind) The onboarding record has a stale test count and is partial. — Fixed: the count is now 474 and the staleness caveat is gone. "Partial" plus the human follow-up (owner Msunkur, the sprint-status owner convention) is intended, per the Spec Change Log.
  - `[low]` `[reject]` (blind) Minor README details could go stale (`api:docs` prerequisites, and foreground vs `-d`). — Cosmetic, and both forms work.
  - `[medium]` `[patch]` (intent-alignment) The 204 in the document doesn't match the wire. — Same root cause as the blind 204 finding, fixed by that patch.
  - `[low]` `[reject]` (intent-alignment) The response schemas are now on the serialization path. — carried.
  - `[low]` `[reject]` (intent-alignment) Reachability is tested only for the matrix rows. — Same as the blind reachability row.
  - `[low]` `[reject]` (intent-alignment) The drift test mutates the document, not a schema. — The committed-file comparison covers the real scenario, and the helper test covers the failure message.
  - `[low]` `[reject]` (intent-alignment) "Live equals snapshot" is checked in-process. — carried. It was also checked through nginx during implementation (`todos-docscheck` project).
  - `[low]` `[reject]` (intent-alignment) The walkthrough surface is an agent on the prod path. — By design, per the Spec Change Log: the record is marked partial, and a human follow-up is named.
  - `[low]` `[reject]` (intent-alignment) The descriptions and the API-local `z.null()` break "nothing hand-written". — The contract's rule is about schemas. The descriptions are prose that the contract itself requires, and the 204 marker now renders body-less.
  - `[medium]` `[patch]` (edge-case) The 204 is documented with a JSON body. — Same root cause as the blind 204 finding, fixed.
  - `[low]` `[reject]` (edge-case) The `HEAD` routes are undocumented. — Same as the blind reachability row.
  - `[low]` `[reject]` (edge-case) A missing `properties` would throw a TypeError in the test. — Unlikely, and the failure would still point at the schema.
  - `[low]` `[patch]` (edge-case) The 413 payload breaks if the limit is raised. — Same root cause as the blind 413 finding, fixed.
  - `[medium]` `[patch]` (edge-case, claim) The snapshot's 204 contradicts "empty response". — Same root cause as the blind 204 finding, fixed.

## Design Notes

- **Why document errors in the route schemas, not a post-processing transform:** it keeps the shared Zod schemas as the only source, and Fastify serializes error replies through the same `ErrorEnvelopeSchema`, which every envelope already satisfies. The unchanged existing error tests are the guard.
- **Walkthrough:** the owner's dev stack holds the `todos` project, port 9229 and the dev ports. The walkthrough therefore follows the README against an isolated Compose project, `COMPOSE_PROJECT_NAME=todos-walkthrough` with free `WEB_PORT`/`DB_PORT`, and records any deviation the README forced. A context-free agent plays "a developer who did not build the app". A human walkthrough is still recommended, and the record says so.

## Verification

**Commands:**
- `pnpm api:docs && git diff --exit-code docs/api/openapi.json` -- expected: the second run is a no-op.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass, including `apps/api/test/openapi.test.ts`. `server.test.ts` "on SIGTERM" is a known environmental failure on this host (ephemeral-port exhaustion from a leaked inspector connection; see the Story 3.1 result).
- `pnpm test:stack` -- expected: 11/11 still pass. The API image now includes swagger.
- `curl -s http://<web>/api/v1/openapi.json` on the smoke or walkthrough stack -- expected: the same document as the snapshot.

**Manual checks:**
- Walkthrough: a context-free agent with only `README.md` (and the linked docs) runs the app in the isolated `todos-walkthrough` project, explains the data flow, and reports the elapsed time and any README gaps. Fix the gaps, then record it in `docs/onboarding-walkthrough.md` and tear down that project with `down -v`.

## Auto Run Result

Status: blocked
Blocking condition: intent gap

**What was attempted:** everything in the Tasks list, saved in `spec-3-2-...-attempt-1.patch`. The code is reverted to baseline `978d202c5971294a439778a3843e12bb46ba20c7`.
- `@fastify/swagger` 9.9 serving `GET /api/v1/openapi.json` (OpenAPI 3.0.3), generated from the shared Zod schemas.
- A `pnpm api:docs` snapshot at `docs/api/openapi.json` that is byte-stable across runs.
- `apps/api/test/openapi.test.ts`, 8 tests.
- A root `README.md` covering every checklist item.
- `docs/onboarding-walkthrough.md`, written by a context-free agent on an isolated `todos-walkthrough` stack: running in 74 s and done in about 3 minutes. It used cached images and the prod path only.

**Verification before review:**
- lint, typecheck, and prettier: clean
- `pnpm test`: 469/469
- `pnpm test:stack`: 11/11
- `pnpm api:docs`: idempotent

**Why it is blocked:**
- Review confirmed with `inject` that `DELETE /api/v1/todos/{id}` also returns **413** (body over 16 KiB) and **415** (non-JSON content type), because Fastify parses DELETE bodies.
- A malformed URL gives a framework **400** on any route, including GET health and GET todos.
- The intent contract's Always list fixes each route's statuses, and it leaves these out. So the generated document under-reports, and the test locks the gap in.
- Fixing it means changing that list.

**Question for the owner:**
1. Should the per-route status list document every status the API can really return? Recommended:
   - DELETE: 204, 400, 404, 413, 415, 500, 503
   - GET health and GET todos: add 400 (malformed URL)
2. Or should DELETE be changed to reject or ignore request bodies? That is a behaviour change the contract currently forbids.

**Once resolved:** amend the Always list and the matrix, reapply the attempt patch, and add the queued patches:
- descriptions built from `DESCRIPTION_MAX` and `BODY_LIMIT_BYTES`
- a clear message when the snapshot file is missing
- `pool.end()` guaranteed in the generator
- the walkthrough record marked partial (prod path, cached images, agent walker) with a human follow-up, and linked from the README
- the walkthrough table's missing steps

**Side effects on the owner's machine:**
- **Dev database:** the `todos_todos-data` volume was deleted and recreated at 18:29:26, before this story's implementation started, and it now holds 0 Todos. No command in this session's agent transcripts removes it, and Docker's event log here keeps only about 1 s of history, so the cause is unknown.
- **Dev API crash:** while the patch was applied, the dev `api` container crashed on the new `@fastify/swagger` import, because its `node_modules` volume predates the dependency. Reverting removes the import. Re-applying will need `docker compose up --build -V`.

## Auto Run Result (rerun after the per-route status amendment)

Status: done

**What was implemented:**
- `@fastify/swagger` 9.9 serves `GET /api/v1/openapi.json` (OpenAPI 3.0.3), generated from the shared Zod schemas.
- Every route documents every status the API can actually return, and each error uses the shared envelope with a description naming its AD-5 code.
- `pnpm api:docs` writes the byte-stable snapshot `docs/api/openapi.json`, and a drift test guards it.
- A root README covers the full Story 3.2 checklist.
- An onboarding walkthrough is recorded, marked partial.

**Files changed:**
- `apps/api/src/openapi.ts` (new): swagger registration and a transform that makes the 204 body-less. It also holds `errorResponses` (built from `DESCRIPTION_MAX`/`BODY_LIMIT_BYTES`) and the database-free generator.
- `apps/api/src/app.ts`: registers the OpenAPI plugin before the routes.
- `apps/api/src/routes/health.ts`, `apps/api/src/routes/todos.ts`: the documented responses per route. DELETE now uses `send(null)`, and the wire output is identical.
- `apps/api/scripts/write-openapi.ts` (new), `apps/api/package.json`, `apps/api/tsconfig.json`, root `package.json`, `pnpm-lock.yaml`: `pnpm api:docs` and the `@fastify/swagger ~9.9.0` dependency.
- `packages/shared/src/paths.ts`: adds `OPENAPI_PATH`.
- `.prettierignore`: excludes the snapshot.
- `docs/api/openapi.json` (generated).
- `apps/api/test/openapi.test.ts` (new): 13 tests, covering structure, statuses, the reachability probes, snapshot drift, a missing snapshot, the empty 204 on the wire and the body-less 204 in the document.
- `README.md` (new).
- `docs/onboarding-walkthrough.md` (new).

**Review (after the amendment):** 24 findings.
- Patches applied (3):
  - medium: the 204 documented body-less
  - low: the 413 test built from `BODY_LIMIT_BYTES`
  - low: the walkthrough test count
- Deferred: none.
- Rejected: 20 lows and 1 false, each with its reason in the triage log.

**Follow-up review recommendation:** false. The pass patched 1 medium and 2 lows, and no highs.

**Verification:**
- `pnpm api:docs`: byte-identical across runs.
- `pnpm lint`, `pnpm typecheck` and `prettier --check .`: clean.
- `pnpm test`: 474/474 (shared 46, web 257, api 171). It ran against a throwaway `postgres:18-alpine` on `127.0.0.1:25432` via `TEST_DATABASE_URL`, because the owner's dev db was stopped.
- `pnpm test:stack`: 11/11.
- The live document through nginx deep-equals the snapshot (isolated `todos-docscheck` project, torn down afterwards).

**Residual risks:**
- SM-5 still needs the human walkthrough named in `docs/onboarding-walkthrough.md` (owner Msunkur).
- HEAD mirrors of the GET routes are reachable but undocumented.
- The owner's `todos` dev stack was found recreated (18:29 BST, new empty `todos-data` volume) and later killed (19:29 BST, exit 137/143). No command in this session did either; the one-hour spacing suggests an external job on the host.
- Restarting the dev stack needs `docker compose up --build -V`, because its `node_modules` volumes predate `@fastify/swagger`.

