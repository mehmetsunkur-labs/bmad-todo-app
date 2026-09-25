---
title: 'Epic 3 retro fix-now: dev-stack refresh, harness image tags and hardening, gateway error docs'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
baseline_commit: 'f03ca760fea6f37d30371e5218587b98fee48b61'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-retro-2026-09-25.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 3 retro (items 1–4; F1, F2, F3/F4, F7) found four problems:
- **Stale dev dependencies.** The README's dev-stack refresh (`docker compose up --build -V`) never renews the six named `*-node-modules` volumes, so a new dependency (Story 3.2's `@fastify/swagger`) crashes the dev API. Nothing ever boots the dev stack to catch it.
- **Shared image tags.** `pnpm test:stack` and `pnpm test:e2e` rebuild the owner's real `todos-*:prod` images.
- **Fragile harnesses.** The smoke harness reads a bare `WEB_PORT`, neither harness checks for `.env` up front, and both `.mjs` harness scripts are unlinted and untypechecked.
- **Overstated docs.** The OpenAPI document and README promise the JSON envelope for every non-2xx, but nginx can answer with HTML.

**Approach:**
- Make the dev refresh actually renew dependencies, and prove it with a dev-stack boot check in `test:stack`.
- Give every harness its own image tag.
- Namespace the smoke port, and add a `.env` preflight.
- Put both harness scripts under `pnpm lint` and `pnpm typecheck`.
- Qualify the docs for gateway-generated errors, and set nginx's body limit explicitly.

## Boundaries & Constraints

**Always:**
- The owner's `todos` project (containers, `todos_todos-data`, and its dev volumes) and the default `todos-*:prod` / `todos-*:dev` tags are never touched by any harness.
- Every Docker action by a harness runs under its own project name, and teardown is `down -v` for that project only.
- Default behaviour for humans stays the same: `docker compose up` and `docker compose -f compose.yaml up -d --build` still use the `:dev` and `:prod` tags, and the same ports.
- The AD-9 rules (unchanged proxy path, re-resolution, no CORS) and AD-10 (one topology, `todos-data` at `/var/lib/postgresql`) hold.
- Existing suites stay green: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:stack` (extended) and `pnpm test:e2e`.

**Never:**
- Don't change application behaviour under `apps/*/src` or `packages/shared/src`, apart from the `openapi.ts` description text.
- Don't add CI.
- Don't make nginx rewrite error bodies into JSON. AD-5 keeps nginx HTML errors classified as `INTERNAL`.
- Don't use `// @ts-nocheck` or lint-disable comments to pass the new checks.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev refresh after a dependency bump | existing dev stack, a new dep in the lockfile, README refresh command | the dev API starts and imports the new dep | — |
| Dev-stack boot check | `pnpm test:stack`, an isolated dev project | `/api/v1/health` and `/api/v1/openapi.json` return 200 through Vite's proxy; teardown leaves nothing behind | fails the suite |
| Harness image tags | `pnpm test:stack` / `pnpm test:e2e` | images built as `todos-*:smoke` / `todos-*:e2e`; `todos-*:prod` image IDs unchanged before and after | — |
| Default tags | plain `docker compose config` / `-f compose.yaml config`, no override variable | `todos-*:dev` / `todos-*:prod` | — |
| Smoke port | `WEB_PORT=8080` exported in the shell | smoke ignores it and uses `SMOKE_WEB_PORT` or a free port | — |
| Missing `.env` | no `.env` and no `POSTGRES_*` in the environment | both harnesses exit at once with "copy .env.example to .env" and never call `compose up` | clear error |
| Body just over the API limit | POST of about 20 KiB through nginx | `413` JSON `VALIDATION_ERROR` envelope from the API | existing handler |
| Body over the nginx limit | POST larger than `client_max_body_size` | `413` from nginx (HTML), as documented | gateway |

**Decisions (human, 2026-09-25):**
- **Dev `node_modules`:** use anonymous mounts. The six mounts in `compose.override.yaml` become anonymous (`- /app/node_modules`, …), so `docker compose up --build -V` renews them as the README says. The README gets a one-time cleanup line for the orphaned `todos_*-node-modules` volumes.
- **nginx body limit:** `client_max_body_size 32k`. Bodies up to 32 KiB reach the API, so anything just over 16 KiB gets its JSON 413. nginx returns HTML 413 above 32 KiB, and the docs say so.
- **Scope:** keep all four items in one spec, even though it's over the size guideline.

</frozen-after-approval>

## Code Map

- `compose.override.yaml` -- dev overlay:
  - `api` mounts `api-root-node-modules:/app/node_modules`, `api-node-modules:/app/apps/api/node_modules` and `api-shared-node-modules:/app/packages/shared/node_modules`; `web` has the three matching mounts. All six are declared under the top-level `volumes:`.
  - Fixed host ports: `127.0.0.1:9229:9229` (api) and `127.0.0.1:${DB_PORT:-5432}:5432` (db).
  - `image: todos-api:dev` / `todos-web:dev`.
- `compose.yaml` -- `image: todos-api:prod` / `todos-web:prod`, and `web` publishes `${WEB_PORT:-8080}:8080`. Compose v5.5 is installed, so `ports: !reset []` in an extra `-f` file works.
- `scripts/stack-smoke.test.mjs` -- the 3.1 harness (`node:test`, project `todos-smoke`).
  - `:31` reads bare `WEB_PORT`.
  - `:203-216` (prod config), `:244` (`docker image inspect todos-api:prod`) and `:263-264` (dev config) assert tag literals.
  - `:482` uses `todos-web:prod` as the IP-holder image.
  - `compose()` (`:75-83`), `firstFreePort` (`:47-58`) and `waitForHealth` (`:154-168`) are the helpers to reuse.
- `e2e/scripts/run-e2e.mjs` -- the 3.3 orchestrator (project `todos-e2e`).
  - `:77-83` sets `WEB_PORT` from `E2E_WEB_PORT` or a free port and builds `ENV`.
  - `compose()` (`:85-105`) and the teardown/leftover audit (`:183-229`) are here.
- `e2e/tests/fixtures.ts:303-321` and `e2e/tests/durability.spec.ts:25-45` -- compose invocations inside tests. They must inherit the harness tag so that `up` without `--build` reuses the e2e images.
- `eslint.config.js:33` -- the base block is `files: ["**/*.{ts,tsx,js}"]`, so `.mjs` files get 0 rules. The e2e block (`:45-51`) already lists `mjs`.
- `e2e/tsconfig.json` -- only `include`s `playwright.config.ts` and `tests/**/*.ts`. Root `typecheck` is `pnpm -r typecheck`, and `scripts/` belongs to no package. `@types/node` lives in `e2e` and the apps, not the root.
- `apps/api/src/openapi.ts:15-20` -- `DESCRIPTION` says "Every non-2xx response is the error envelope". Regenerate `docs/api/openapi.json` with `pnpm api:docs` after changing it.
- `README.md`:
  - `:50-56` and `:147` hold the dev refresh text.
  - `:170` holds the envelope claim.
  - The test table rows for `test:stack` and `test:e2e` need the new behaviour.
- `apps/web/nginx.conf` -- `location /api/` has no `client_max_body_size`. `BODY_LIMIT_BYTES = 16 * 1024` is in `apps/api/src/errors.ts:5`.

## Tasks & Acceptance

**Execution:**
- [x] `compose.yaml`, `compose.override.yaml` -- change the tags to `todos-api:${TODOS_IMAGE_TAG:-prod}` / `todos-web:${TODOS_IMAGE_TAG:-prod}`, and `${TODOS_IMAGE_TAG:-dev}` in the override. Make the six `node_modules` mounts anonymous (see Decisions), and drop their top-level `volumes:` entries. -- per-harness tags; dev refresh.
- [x] `scripts/compose.smoke-dev.yaml` (new) -- an extra overlay for the dev boot check that `!reset`s the fixed `api` and `db` host ports, so it can run beside the owner's dev stack. -- isolation.
- [x] `scripts/stack-smoke.test.mjs`:
  - Add a `.env` preflight.
  - Use `SMOKE_WEB_PORT`.
  - Set `TODOS_IMAGE_TAG=smoke`, and assert the `:prod` image IDs are unchanged across the run.
  - Change the tag literals to the harness tag, and keep one config test asserting the defaults with the variable unset.
  - Add a dev-stack boot test: project `todos-smoke-dev`, files `compose.yaml` + `compose.override.yaml` + the new overlay, `up -d --build -V --wait`, then poll `/api/v1/health` and `/api/v1/openapi.json` through the web port until 200, then `down -v`.
  - Add a JSON-413 test just over 16 KiB, and an HTML-413 test above the nginx limit.
- [x] `e2e/scripts/run-e2e.mjs`, `e2e/tests/fixtures.ts`, `e2e/tests/durability.spec.ts` -- `.env` preflight and `TODOS_IMAGE_TAG=e2e`, exported to every compose call.
- [x] `eslint.config.js`, `e2e/tsconfig.json`, and a `scripts/tsconfig.json` or root typecheck wiring -- lint `**/*.mjs` with node globals, and typecheck both `.mjs` harness scripts (`allowJs` + `checkJs`) from `pnpm typecheck`. Fix every resulting error.
- [x] `apps/api/src/openapi.ts`, `docs/api/openapi.json`, `README.md`:
  - Qualify the claim to "every non-2xx response the API generates". The gateway may return non-JSON 502, 504, or 413 above its limit.
  - Regenerate the snapshot.
  - Fix the README's dev refresh text and envelope line, and document the harness tags, `SMOKE_WEB_PORT` and the `.env` requirement.
- [x] `apps/web/nginx.conf` -- set `client_max_body_size 32k;` with a comment tying it to `BODY_LIMIT_BYTES`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- no edit. Retro items 1–4 are closed after merge through the retrospective script.

**Acceptance Criteria:**
- Given the repo, when I run `pnpm lint`, `pnpm typecheck` and `pnpm test`, then all pass, and both `.mjs` harness scripts are linted and typechecked with zero errors.
- Given the owner's `todos` stack and images, when I run `pnpm test:stack` and `pnpm test:e2e`, then both pass, and the `todos` containers, volumes and `todos-*:prod` / `todos-*:dev` image IDs are unchanged.
- Given the README, when I follow its dev-stack refresh after a dependency change, then the dev API starts with the new dependency.

## Implementation Notes

- The dev boot check builds under its own tag, `todos-*:smoke-dev`, so it never overwrites the `:smoke` images the prod checks use (or the owner's `:dev`). The final "harness isolation" suite asserts no `todos-smoke`/`todos-smoke-dev` containers, volumes or networks are left and that the `todos-*:prod`/`:dev` image IDs match a snapshot taken before any build.
- The e2e runner passes `E2E_IMAGE_TAG` to Playwright; `fixtures.ts` and `durability.spec.ts` require it and set `TODOS_IMAGE_TAG` from it on every compose call.
- Typecheck wiring: `scripts/tsconfig.json` (allowJs + checkJs) runs from the root `typecheck` (`pnpm -r typecheck && tsc -p scripts`); `@types/node` was added to the root devDependencies (lockfile +3 lines). `e2e/tsconfig.json` now includes `scripts/**/*.mjs`. Errors were fixed with JSDoc types only.
- Matrix-audit follow-up: the dev suite now proves a second `up --build -V` replaces a stale `node_modules` (marker file) and removes exactly the anonymous volumes it detached; a config test proves a shell `WEB_PORT=8080` is ignored (`smokeEnv()`); the preflight lives in `scripts/lib/env-preflight.mjs`, is used by both harnesses and is unit-tested by `scripts/env-preflight.test.mjs` (`test:stack` is now `node --test scripts/*.test.mjs`).
- Review follow-up: the documented dev refresh is `docker compose rm -fsv api web && docker compose up --build -V` (`rm -v` removes the two containers' anonymous `node_modules` volumes, so nothing is orphaned; no `docker volume prune` advice). The smoke refresh test runs exactly that sequence and asserts a new api container, a fresh `node_modules`, health via Vite, and that none of the old containers' volumes remain. The preflight parses `.env` (`util.parseEnv`) under the environment and needs all three `POSTGRES_*`; the port choice is `scripts/lib/smoke-port.mjs`; both unit tests also run from `pnpm test`. The 413 tests sit 64 bytes either side of 32 KiB. `run-e2e.mjs` fails on any change to the owner's `:prod`/`:dev` image IDs, and durability asserts the restarted containers run `todos-*:e2e`.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 28 findings — high 2, medium 6, low 19, false 1, maybe-false 0
- `[medium]` `[patch]` (verification-gap) The "WEB_PORT in the shell is ignored" test passes by construction, because it goes through `smokeEnv()`. — Fixed: added the pure `pickSmokePort(env, freePort)` in `scripts/lib/smoke-port.mjs` with its own unit tests, and removed the tautological test.
- `[medium]` `[patch]` (verification-gap) The e2e harness never checks the owner's images, or that durability restarts on the `:e2e` images. — Fixed: `run-e2e.mjs` compares the `:prod`/`:dev` image IDs before `up` and after teardown and fails the exit code on a change. `durability.spec.ts` asserts `compose ps` shows the `todos-*:e2e` images after the restart.
- `[low]` `[reject]` (verification-gap) No subprocess test shows the harness call sites exit early when `.env` is missing. — The filed disposition is defer (low). The call site is a few top-of-file lines, and a subprocess test would need a scratch repo root, so it's more than a direct fix.
- `[low]` `[patch]` (verification-gap, other) The Docker-free preflight unit test runs only through `pnpm test:stack`. — Same root cause as the blind "preflight test only runs with Docker" row: `pnpm test` now also runs `scripts/env-preflight.test.mjs` and `scripts/smoke-port.test.mjs`.
- `[high]` `[patch]` (blind) `docker volume prune`, as the README advised, also removes unused named volumes on Docker Engine < 23, which would delete `todos_todos-data`. It is host-wide on a shared host as well. — Fixed: every prune suggestion is removed. The refresh is `docker compose rm -fsv api web && docker compose up --build -V`, which removes only those two containers' anonymous `node_modules` volumes and never the db or `todos-data`.
- `[low]` `[patch]` (blind) The one-time cleanup assumes the project is named `todos`. — Fixed: the cleanup uses `P=todos` and `${P}_…-node-modules`, and mentions `docker volume ls --filter name=node-modules`.
- `[low]` `[reject]` (blind) A user-set `TODOS_IMAGE_TAG` would give dev and prod the same tag. — Hypothetical: the variable is harness-only, and the compose comment says to leave it unset. Per-mode variables would add surface for a case nobody meets.
- `[low]` `[patch]` (blind) The harness images `:smoke`, `:smoke-dev` and `:e2e` are never cleaned up. — Fixed: the README now has the `docker image rm` line for all six tags.
- `[medium]` `[patch]` (blind) The preflight passes when `.env` exists but lacks the `POSTGRES_*` keys. — Fixed: it parses `.env` with `util.parseEnv`, merged under the process env, and requires all three keys. The unit test now expects an incomplete `.env` to throw.
- `[low]` `[patch]` (blind) The Docker-free unit tests run only via `test:stack`. — Fixed: `pnpm test` now runs them too.
- `[medium]` `[patch]` (blind) The shell-`WEB_PORT` test always passes. — Same root cause as the verification-gap port-test row, fixed there.
- `[low]` `[patch]` (blind) The `-V` refresh test's assertions are weak: it counts volumes across services and never shows the container was recreated. — Fixed: it now runs the README sequence, requires exactly 3 volumes per service, asserts the api container ID changed, and asserts the old volumes are gone.
- `[low]` `[patch]` (blind) Replaced volumes leak if a run crashes, because they were tracked only in memory. — Same root cause as the refresh-assertions row: the `rm -fsv` sequence removes them itself, and the in-memory bookkeeping is gone.
- `[low]` `[reject]` (blind) The gateway responses exist only as prose in the OpenAPI document. — The approved decision was to qualify the document in prose. Declaring `text/html` responses per operation would change the documented contract and the snapshot for code generators.
- `[false]` `[reject]` (blind) The diff is missing `docs/api/openapi.json` and `pnpm-lock.yaml`. — They were left out of the review diff on purpose (generated or lockfile). The drift test passes on the regenerated snapshot, and `pnpm install` agrees with the lockfile.
- `[medium]` `[patch]` (blind) The e2e harness lacks the owner-image check. — Same root cause as the verification-gap e2e-image row, fixed there.
- `[low]` `[patch]` (blind) The 20 KiB and 40 KiB bodies don't pin the 32 KiB nginx limit. — Fixed: the tests now use 32 KiB − 64 bytes (the API's JSON 413) and 32 KiB + 64 bytes (nginx's HTML 413).
- `[low]` `[patch]` (blind) The README doesn't state the minimum Compose version needed for `!reset`. — Fixed: the `test:stack` Needs cell says "Compose 2.24.4 or later".
- `[low]` `[reject]` (blind) The README table cells are long. — Cosmetic; carried from the Story 3.3 and 3.4 rejects.
- `[low]` `[patch]` (edge-case) The cleanup misses volumes when `COMPOSE_PROJECT_NAME` is set. — Same root cause as the blind project-name row, fixed there.
- `[high]` `[patch]` (edge-case) Prune on Docker Engine < 23 deletes `todos-data`. — Same root cause as the blind prune row, fixed there.
- `[medium]` `[patch]` (edge-case) The preflight passes with an incomplete `.env`. — Same root cause as the blind preflight row, fixed there.
- `[low]` `[reject]` (edge-case) A `TODOS_IMAGE_TAG` in `.env` could override the default-config test. — Hypothetical, for the same reason as the blind tag row.
- `[low]` `[patch]` (edge-case) Anonymous volumes leak after an interrupted refresh test. — Same root cause as the refresh-assertions row, fixed there.
- `[low]` `[patch]` (edge-case) The isolation check passes vacuously when no volumes were collected. — Same root cause as the refresh-assertions row: the test now requires 3 volumes per service before asserting.
- `[low]` `[patch]` (edge-case) The before-hook timeout is smaller than the sum of the child timeouts. — Fixed: before is 120 s + 720 s within 900 s, after is 180 s within 200 s, and the test is about 1,055 s within 1,200 s.
- `[low]` `[patch]` (edge-case) The after hook's timeout is smaller than `down` plus the volume removals. — Same root cause as the before-hook timeout row, fixed there.
- `[low]` `[reject]` (edge-case) A non-numeric `SMOKE_WEB_PORT` fails deep inside Compose. — The value is user-supplied and Compose's error is loud. Validating it would add a guard for an unlikely input.

## Design Notes

- **Why an extra overlay for the dev check:** the dev overlay pins host ports (`9229`, `DB_PORT`) that the owner's running dev stack already holds. Using `!reset []` (Compose ≥ 2.24) in a harness-only file keeps `compose.override.yaml` unchanged for humans, while the check still exercises it.
- **Why tags, not project-scoped images:** Compose names built images from `image:`. One `TODOS_IMAGE_TAG` variable keeps human defaults untouched and gives each harness its own image namespace.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. If the owner's dev db is down, use a throwaway `TEST_DATABASE_URL` Postgres.
- `docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E 'todos-(api|web):(prod|dev)'` before and after both suites -- expected: identical.
- `pnpm test:stack` and `pnpm test:e2e` -- expected: all pass, including the new dev-boot and 413 tests, with no `todos-smoke*` or `todos-e2e` leftovers.
