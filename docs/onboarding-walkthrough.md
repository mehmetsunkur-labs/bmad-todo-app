# Onboarding walkthrough (Story 3.2, SM-5)

A one-time check that a developer who did not build the app can get it running and explain its data flow within 15 minutes, using only `README.md` and the docs it links to.

- **Status:** **partial.** This is not yet the full SM-5 check; see [Limits of this run](#limits-of-this-run) and [Follow-up](#follow-up).
- **Date:** 2026-09-25
- **Who:** a context-free AI agent playing "a developer who did not build the app". It had no prior knowledge of the project and read only the README and `docs/api/openapi.json`. It was not a human developer.
- **Where:** a fresh copy of the repository (tracked files only, no `.env`, no `node_modules`) on the owner's host, as the isolated Compose project `todos-walkthrough` with `WEB_PORT=18180` and `DB_PORT=15532`, so the owner's `todos` stack was never touched. Torn down afterwards with `down -v`, for that project only.
- **Result:** the production-like path worked as written. **74 s** from start to the app running and usable, **179 s** for the whole walkthrough including tests and teardown. Docker images were cached on this host, so these times do not include a first image build.

## Limits of this run

- **Agent walker, not a human.** The agent followed the README literally and fast; it does not show how long a person needs to read the README cold and understand it.
- **Cached images.** A first build on a clean machine takes a few more minutes, which is not measured here.
- **Production-like path only.** The dev stack (`docker compose up`) could not start, because the owner's own dev stack held the fixed inspector port `127.0.0.1:9229`. Hot reload, the dev ports and the inspector were not exercised.
- **Steps the README asks for that were not recorded:**
  - _Stop the production-like stack before `docker compose up -d db`._ The README says to stop it first (otherwise only `db` swaps into dev mode). The run went straight from the production-like stack to `up -d db`, and the record does not say whether it was stopped.
  - _Create `todos_test` once when the production-like stack created the volume._ In this run the production-like stack created the `todos-walkthrough` volume first, so the README's `createdb` step applies, but the record does not show it being run before `pnpm test`.

## Follow-up

A **human** walkthrough is still needed to close SM-5: a developer who did not build the app, on a machine without cached images, following only the README through **both** the dev stack and the production-like stack, including the stop and `createdb` steps, and timing it end to end. Owner: **Msunkur**.

## What was run, following the README

| Step                                                                                                               | Outcome                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose version`, `corepack enable`, `pnpm install`                                                        | Worked as written (Node 24.21, pnpm 12.6.0).                                                                                                                                                        |
| `cp .env.example .env`, then `docker compose up -d` (dev stack)                                                    | Could not start in this environment: the owner's dev stack already holds `127.0.0.1:9229` (the inspector port). Forced by the isolation, not a README error. The README now says the port is fixed. |
| `docker compose -f compose.yaml up -d --build`, then `ps` until `api` is healthy                                   | Worked.                                                                                                                                                                                             |
| `/`, `/api/v1/health` at `http://localhost:18180`                                                                  | SPA HTML served by nginx; `{"status":"ok"}`.                                                                                                                                                        |
| Create, repeat-create, list, update and delete a Todo, with request shapes taken only from `docs/api/openapi.json` | 201, 200, 200, 200, 204, all as documented. A bad id gave 400 `VALIDATION_ERROR`, and an unknown id gave 404 `NOT_FOUND`, both in the documented envelope.                                          |
| Live `GET /api/v1/openapi.json` vs `docs/api/openapi.json`                                                         | The same document (the live one is compact JSON).                                                                                                                                                   |
| Upgrade: `up -d --build`, then `down` and `up -d`                                                                  | The Todo created beforehand survived both. `git pull` was skipped because the copy is not a git checkout.                                                                                           |
| Phone path: LAN IP from `hostname -I`, then `curl http://<LAN-IP>:18180/api/v1/health`                             | 200 `{"status":"ok"}`.                                                                                                                                                                              |
| `pnpm lint`, `pnpm typecheck`                                                                                      | Passed.                                                                                                                                                                                             |
| `pnpm api:docs`, then diff against the committed file                                                              | No change.                                                                                                                                                                                          |
| `pnpm test:e2e`                                                                                                    | Printed the "not yet implemented" stub message, as the README says.                                                                                                                                 |
| Stop the production-like stack (README: "Stop that stack first")                                                   | **Not recorded** (see [Limits of this run](#limits-of-this-run)).                                                                                                                                   |
| `docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" todos_test'` (volume created by the prod stack)        | **Not recorded** (see [Limits of this run](#limits-of-this-run)).                                                                                                                                   |
| `docker compose up -d db`, then `pnpm test`                                                                        | 474 tests passed (shared 46, web 257, api 171).                                                                                                                                                     |

## The walker's explanation of the data flow

The browser loads a React app. Every call it makes to the server goes through one small HTTP helper and uses relative `/api/v1/...` URLs. In production nginx forwards these to the API (in dev, the Vite server does), so there is one origin and no CORS. The Fastify API checks each request against Zod schemas that the browser also uses (from `packages/shared`). It then hands the request to a service layer, which applies the rules (for example tidying the Description, and treating a repeated create with the same id and text as a no-op instead of a conflict). The service calls a repository that reads and writes PostgreSQL through Drizzle. The database files live in the `todos-data` volume. The response goes back the same way, and any failure is turned into one error shape: `{error:{code,message,details?}}`.

For writes, the browser does not wait. For each Todo it keeps the last state the server confirmed, plus a queue of pending changes shown on screen straight away. Changes to the same Todo are sent in order. If one fails, that Todo's generation counter is bumped, its remaining queued changes are dropped without being sent, and the Todo goes back to its last confirmed state. One toast appears, and its Retry sends the same id and payload again. Because the same id is reused, a retried create is safe to send twice.

## README gaps found, and what was done

| Gap the walker reported                                                                                  | Fix                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The inspector port `127.0.0.1:9229` is fixed, with no hint when it is taken                              | The README now says it is fixed and that the dev stack can't start while the port is in use.                                           |
| Running a second copy (`COMPOSE_PROJECT_NAME`) isn't covered                                             | Added to "One mode at a time", including free `WEB_PORT`/`DB_PORT`.                                                                    |
| Image tags (`todos-api:prod`, …) are global to the host, so copies overwrite each other's builds         | Documented: always use `--build` after switching copies (`pnpm test:stack` rebuilds the `:prod` tags too).                             |
| `docker compose up -d db` while the production-like stack runs swaps only `db` into dev mode             | The README now says to stop that stack first.                                                                                          |
| The live document is compact while the snapshot is pretty-printed                                        | Stated in "API documentation".                                                                                                         |
| `pnpm db:generate` / `pnpm db:migrate` were only mentioned in the Settings table                         | Explained under "Tests and lint".                                                                                                      |
| `hostname -I`: on hosts with many virtual interfaces, the first address may not be the LAN one           | Now says to pick the Wi-Fi or Ethernet address, e.g. from `ip -4 addr`.                                                                |
| A `.env.example` comment says "port 5432" even after `DB_PORT` changes                                   | Not changed: the comment next to it already says to change both together.                                                              |
| The request schema has no `maxLength` for the Description; the 1–500 rule is only in the 400 description | Not changed: the service checks the length after normalization, so the shared request schema has no length check to generate one from. |
