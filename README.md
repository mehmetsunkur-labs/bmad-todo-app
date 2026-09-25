# Todos

A single shared Todo list: a React SPA, a Fastify API and PostgreSQL, run with Docker Compose. Changes show instantly (optimistic updates) and roll back with a toast if the server refuses them.

- [Prerequisites](#prerequisites)
- [Run the dev stack](#run-the-dev-stack)
- [Tests and lint](#tests-and-lint)
- [Run the production-like stack](#run-the-production-like-stack)
- [Settings (`.env`)](#settings-env)
- [Where the data lives](#where-the-data-lives)
- [Upgrading without losing data](#upgrading-without-losing-data)
- [One mode at a time](#one-mode-at-a-time)
- [API documentation](#api-documentation)
- [Onboarding check](#onboarding-check)
- [How the repository fits together](#how-the-repository-fits-together)

> [!WARNING]
> **`docker compose down -v` permanently deletes all Todos.** The `-v` flag removes the `todos-data` volume, which holds the database. There is no backup. To stop the app, use `docker compose down` (no `-v`) or `docker compose stop`.

## Prerequisites

- **Docker** with the **Compose v2 plugin or later** (the `docker compose` command, not the old `docker-compose`; check with `docker compose version`). This is all you need to run the app.
- **Node 24** and **pnpm 12.6**, only for running tests, lint and scripts on the host. pnpm comes through corepack, which ships with Node:

  ```sh
  corepack enable        # pnpm now resolves to the version pinned in package.json (12.6.0)
  pnpm install
  ```

## Run the dev stack

```sh
cp .env.example .env
docker compose up
```

The first run builds the images and takes a few minutes. When the API logs `Server listening`, open **http://localhost:8080** (the port is `WEB_PORT` in `.env`).

`docker compose up` loads `compose.yaml` plus `compose.override.yaml`, which gives you:

| What                                  | Where                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Web app (Vite dev server, hot reload) | `http://localhost:${WEB_PORT}` (default 8080)                              |
| API (`tsx watch`, restarts on save)   | not published; reached through the web app at `/api/v1/...`                |
| Node inspector for the API            | `127.0.0.1:9229` (attach your debugger here; fixed, not an `.env` setting) |
| PostgreSQL                            | `127.0.0.1:${DB_PORT}` (default 5432), user/password/db from `.env`        |

The source is bind-mounted, so edits in `apps/` and `packages/` apply without a rebuild. The API applies database migrations itself on startup.

**After a dependency change** (a `package.json` or `pnpm-lock.yaml` change, including after `git pull`), rebuild and renew the containers' `node_modules` volumes:

```sh
docker compose rm -fsv api web && docker compose up --build -V
```

The containers' `node_modules` are anonymous volumes (filled from the image). `rm -fsv api web` stops and removes only the `api` and `web` containers together with their anonymous `node_modules` volumes, so nothing is left behind; the `db` container and the named `todos-data` volume are never touched. `up --build -V` then rebuilds the images and starts the two containers with fresh `node_modules`. Without this, the containers keep the old `node_modules`, and the API or Vite can crash on a missing package.

**Once, if your checkout predates this layout:** earlier versions kept `node_modules` in six named volumes, which never got renewed. Remove them after stopping the dev stack. Their names start with the Compose project name, `todos` by default (or your `COMPOSE_PROJECT_NAME`); `docker volume ls --filter name=node-modules` lists them. Your Todos are in `<project>_todos-data`, which this leaves alone:

```sh
docker compose down
P=todos   # your Compose project name
docker volume rm ${P}_api-root-node-modules ${P}_api-node-modules ${P}_api-shared-node-modules \
  ${P}_web-root-node-modules ${P}_web-node-modules ${P}_web-shared-node-modules
```

Stop with `Ctrl+C`, or `docker compose down` (never `-v`, see the warning above).

## Tests and lint

Run these on the host after `pnpm install`:

| Command           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`       | Unit and API tests for every package (Vitest), plus the Docker-free unit tests of the harness helpers in `scripts/` (`node:test`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The dev stack's `db` running: the API tests use the `todos_test` database on `DB_PORT`, found through `DATABASE_URL` in `.env` (or `TEST_DATABASE_URL`, see [Settings](#settings-env))                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm lint`       | ESLint over the repo, including the `.mjs` harness scripts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm typecheck`  | `tsc` in every package, plus the `.mjs` harness scripts (`scripts/`, `e2e/scripts/`) through their JSDoc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm format`     | Prettier, rewriting files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm test:stack` | Smoke test of the production-like stack: builds and runs `compose.yaml` in a separate Compose project (`todos-smoke`) and checks it through nginx on your LAN address, including the JSON 413 just over the API's 16 KiB body limit and nginx's HTML 413 above its 32 KiB limit. Then boots the dev stack (`compose.yaml` + `compose.override.yaml`, with `scripts/compose.smoke-dev.yaml` dropping its fixed host ports) in `todos-smoke-dev` with `up --build -V`, checks `/api/v1/health` and `/api/v1/openapi.json` through Vite's proxy, and checks that the README's dev refresh (`rm -fsv api web`, then `up --build -V`) replaces a stale `node_modules` and leaves no volume behind. Also runs the Docker-free unit tests of the harnesses' `.env` preflight and port choice (which `pnpm test` runs too). Builds its own `todos-*:smoke` and `todos-*:smoke-dev` images and checks that your `todos-*:prod` and `todos-*:dev` images are unchanged. The web port is `SMOKE_WEB_PORT` if set, otherwise a free port from 18080 (`WEB_PORT` is ignored). Tears both projects down (with their volumes); leaves your own stack and data alone. The harness images stay cached for the next run; remove them with `docker image rm todos-api:smoke todos-web:smoke todos-api:smoke-dev todos-web:smoke-dev todos-api:e2e todos-web:e2e` | Docker with Compose 2.24.4 or later (the dev check's overlay uses `!reset`); `.env` with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` (or those exported), otherwise it exits at once with "copy .env.example to .env"; takes a few minutes                                                                                                                                                                                                                                                                                               |
| `pnpm test:e2e`   | Playwright end-to-end suite: builds and runs `compose.yaml` in a separate Compose project (`todos-e2e`) on `E2E_WEB_PORT` or a free port from 18280, with its own `todos-*:e2e` images (never your `todos-*:prod` ones), then drives it in Chromium, Firefox and WebKit at desktop width and Chromium at 360 px (add, edit, toggle, delete, failure rollback, keyboard-only use, no console errors), then runs the `quality` project in desktop Chromium (axe WCAG 2.1 AA scans in light and dark mode, 320 px width, 200% zoom and 44×44 touch targets, 1,000-Todo load and per-action timing on emulated office broadband, a 200-request API p95 read from the API's own log, layout stability and finish; the measured numbers appear as annotations in the HTML report, see [docs/finish-review.md](docs/finish-review.md)), and finally restarts the stack with `down` then `up` to check durability. Tears the `todos-e2e` project down (with its volume) at the end; leaves your own stack and data alone. Narrow it with `pnpm test:e2e -- --project=chromium`, or run only the quality checks with `pnpm test:e2e -- --project=quality`                                                                                                                                                                                              | Docker; `.env` with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` (or those exported), otherwise it exits at once with "copy .env.example to .env"; the first run pulls the `mcr.microsoft.com/playwright:v1.63.0-noble` image (about 2.5 GB), which provides the browsers, so nothing is installed on the host. It uses `--network host`, so it needs Docker on Linux (Docker Desktop on macOS or Windows is not supported), and npm registry access on every run (the container fetches `playwright` through `npx`). Takes a few minutes |
| `pnpm api:docs`   | Rewrites the OpenAPI snapshot `docs/api/openapi.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

You don't need the whole dev stack for `pnpm test`, only the database: `docker compose up -d db`. (Don't do this while the production-like stack is running: it swaps only `db` into dev mode. Stop that stack first; see [One mode at a time](#one-mode-at-a-time).)

The schema commands `pnpm db:generate` (write a new Drizzle migration into `apps/api/drizzle/` after editing `apps/api/src/db/schema.ts`) and `pnpm db:migrate` (apply migrations to the dev db) also run on the host, using `DATABASE_URL` from `.env`. You rarely need `db:migrate`, since the API applies migrations on startup.

## Run the production-like stack

This is how the app is meant to run on one host (for example a home server) and be used from phones and laptops on the same network. It serves the built SPA with nginx, runs the production API, and keeps PostgreSQL private; only the web port is published.

```sh
cp .env.example .env     # if you haven't already; change POSTGRES_PASSWORD
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps      # wait until api shows (healthy)
```

`-f compose.yaml` is what makes this the production-like stack: it skips `compose.override.yaml`. Open `http://localhost:${WEB_PORT}` on the host (default `http://localhost:8080`). Containers restart on their own after a crash or a host reboot (`restart: unless-stopped`).

Useful commands:

```sh
docker compose -f compose.yaml logs -f api     # API logs (JSON, one line per request)
docker compose -f compose.yaml down            # stop; data is kept (never add -v)
```

### Reach it from a phone or another device

1. **Find the host's LAN IP address.**
   - Linux: `hostname -I` (usually the first address, often `192.168.x.x` or `10.x.x.x`; on hosts with Docker, VPN or other virtual interfaces, pick the one on your Wi-Fi or Ethernet network, e.g. from `ip -4 addr`)
   - macOS: `ipconfig getifaddr en0` (Wi-Fi; try `en1` if empty)
   - Windows: `ipconfig`, the "IPv4 Address" of your Wi-Fi or Ethernet adapter
2. **Open `http://<host-LAN-IP>:<WEB_PORT>`** on the phone, for example `http://192.168.1.20:8080`. The phone must be on the same network.
3. **If it doesn't load, check the host firewall.** It must allow inbound TCP on `WEB_PORT`. For example, on Ubuntu with ufw: `sudo ufw allow 8080/tcp`. On macOS and Windows, allow Docker through the system firewall for private networks.
4. **It is plain HTTP**, with no TLS and no login. Type `http://` explicitly if the browser tries `https://`. Anyone who can reach the URL can read and change the list, so only run it on a network you trust.

## Settings (`.env`)

Copy `.env.example` to `.env` and edit it. `.env` is git-ignored; never commit it. Docker Compose reads it for both stacks, and host-side commands (`pnpm test`, `pnpm db:*`) read it too.

| Key                 | Default                                       | Used by                                                                      | What it does                                                                                                                                                                                                                                                                    |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`     | `todos`                                       | `db` and `api` containers                                                    | Database user. The API container builds its own connection URL from this and the next two values, pointing at the `db` service.                                                                                                                                                 |
| `POSTGRES_PASSWORD` | `todos`                                       | `db` and `api` containers                                                    | Database password. Change it for a real deployment. Must be URL-safe (no `@ : / ? # %`), since it is put into the URL unencoded.                                                                                                                                                |
| `POSTGRES_DB`       | `todos`                                       | `db` and `api` containers                                                    | Database name.                                                                                                                                                                                                                                                                  |
| `DATABASE_URL`      | `postgres://todos:todos@localhost:5432/todos` | Host-side commands only (`pnpm test`, `pnpm db:generate`, `pnpm db:migrate`) | Connection URL for the dev db from your machine. Its port must match `DB_PORT`, and its credentials the three values above. `pnpm test` uses the same URL with the database swapped for `todos_test`. The containers ignore it.                                                 |
| `PORT`              | `3000`                                        | API run outside Docker                                                       | Port the API listens on. Compose doesn't read this key: the containers always listen on 3000. It applies only if you run the API on the host with the variables exported, e.g. `set -a; . ./.env; set +a; pnpm --filter @todos/api start` (the API itself doesn't read `.env`). |
| `LOG_LEVEL`         | `info`                                        | API (both stacks)                                                            | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.                                                                                                                                                                                                            |
| `WEB_PORT`          | `8080`                                        | Both stacks                                                                  | Host port for the web app (dev: Vite; prod: nginx). The only port the production-like stack publishes.                                                                                                                                                                          |
| `DB_PORT`           | `5432`                                        | Dev stack only                                                               | Host port for PostgreSQL, bound to `127.0.0.1` only. Change it (and the port in `DATABASE_URL`) if 5432 is taken.                                                                                                                                                               |

One more variable is not in `.env.example`: `TEST_DATABASE_URL`, an optional full URL for the database `pnpm test` uses. It overrides the `DATABASE_URL`-derived `todos_test` URL.

The API validates `DATABASE_URL`, `PORT` and `LOG_LEVEL` at startup and exits with a clear log line if one is invalid.

## Where the data lives

All Todos are in PostgreSQL, whose data directory is the Docker named volume **`todos-data`** (Compose names it `todos_todos-data`, after the `todos` project):

```sh
docker volume ls | grep todos-data
```

It survives `docker compose down`, `up`, rebuilds, and host reboots. Only `docker compose down -v` or `docker volume rm` delete it.

## Upgrading without losing data

```sh
git pull
docker compose -f compose.yaml up -d --build
```

- **`--build` is required.** Without it, Compose keeps running the old images, and you are still on the old version.
- **Migrations apply automatically.** The API applies any new committed database migrations before it starts listening. There is no manual step.
- **Never add `-v`** to `down` or `up`. Your data stays in `todos-data` across upgrades.

For the dev stack after a pull, use `docker compose rm -fsv api web && docker compose up --build -V` (see [Run the dev stack](#run-the-dev-stack)).

## One mode at a time

Dev (`docker compose up`) and production-like (`docker compose -f compose.yaml up -d`) are the **same Compose project, `todos`**. They share the containers' names, `WEB_PORT` and the `todos-data` volume, so the same Todos appear in both. Run one mode at a time:

- Starting one mode replaces the other mode's containers. That is expected; your data is kept.
- The `todos_test` database (used by `pnpm test`) is created only when the **dev** stack initialises a new `todos-data` volume. If the production-like stack created the volume first, `pnpm test` fails because `todos_test` doesn't exist. Create it once with the dev stack's `db` running:

  ```sh
  docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" todos_test'
  ```

- The dev stack always publishes the inspector on `127.0.0.1:9229`, so it can't start while anything else holds that port (for example another checkout's dev stack).
- **A second copy on the same host** (another checkout, a test run) needs its own project: add `COMPOSE_PROJECT_NAME=<name>` to that copy's `.env` and give it free `WEB_PORT`/`DB_PORT`. Its containers and volume are then separate. The image tags (`todos-api:prod`, `todos-web:dev`, …) are shared by every copy on the host, so always use `--build` after switching copies. (The test harnesses set `TODOS_IMAGE_TAG` to build their own `:smoke`, `:smoke-dev` and `:e2e` tags, so `pnpm test:stack` and `pnpm test:e2e` never rebuild yours; leave that variable unset for your own stacks.)

## API documentation

The API is described by an OpenAPI 3 document, generated from the shared Zod schemas (never written by hand):

- **Committed snapshot:** [`docs/api/openapi.json`](docs/api/openapi.json). Regenerate it with `pnpm api:docs` after changing a route or a schema in `packages/shared`; a test in `pnpm test` fails when it is out of date.
- **Live document:** `GET /api/v1/openapi.json` on any running stack, for example `http://localhost:8080/api/v1/openapi.json`. It is the same document as the snapshot, served as compact JSON rather than pretty-printed.

It covers `GET /api/v1/health`, `GET` and `POST /api/v1/todos`, and `PATCH` and `DELETE /api/v1/todos/{id}`, with every request and response schema. Every error response the API generates is the envelope `{ "error": { "code", "message", "details"? } }`, where `code` is one of `VALIDATION_ERROR` (400, 413, 415), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL` (500) or `UNAVAILABLE` (503). The gateway in front of it can answer on its own with a non-JSON (HTML) page instead: nginx in the production-like stack returns 502 or 504 when the API is unreachable, and 413 for a request body over its `client_max_body_size` of 32 KiB (bodies between the API's 16 KiB limit and 32 KiB reach the API and get its JSON 413). Clients should treat any error body without the envelope as `INTERNAL`, as the web app does. Paste the file into any OpenAPI viewer (for example editor.swagger.io) to browse it.

## Onboarding check

This README was checked once against the goal of a new developer running the app and explaining its data flow within 15 minutes: see [`docs/onboarding-walkthrough.md`](docs/onboarding-walkthrough.md). That record is **partial** (an AI walker, cached images, production-like path only), and a human walkthrough is still to do.

## How the repository fits together

This is a pnpm workspace with three packages, and imports only go **web → shared ← api**: `packages/shared` holds the Zod schemas, the `/api/v1` paths, the error codes and the limits that both sides use, so the browser and the server agree on one contract, and `apps/web` and `apps/api` never import each other. `apps/api` is Fastify: `src/routes/` validate requests with the shared schemas and call `src/services/` (the rules, such as Description normalization and idempotent create), which call `src/repositories/` (Drizzle over PostgreSQL, schema in `src/db/`, migrations in `drizzle/`); `src/errors.ts` is the one place that turns failures into the error envelope. `apps/web` is React with TanStack Query, and it only ever calls relative `/api/v1/...` URLs: in dev the Vite server proxies them, in production nginx does, so the SPA and the API share one origin and there is no CORS. In the browser, `src/api/http.ts` is the only code that calls `fetch`, and `src/api/todo-sync.ts` is the sync protocol behind every add, edit, toggle and delete. For each Todo id it keeps the **confirmed** state (what the server last returned), a queue of **pending** optimistic operations (rendered immediately on top of the confirmed state) and a **generation** counter. Writes to the same Todo run in order; when one fails, the generation is bumped, queued writes for that Todo are dropped without being sent, the Todo rolls back to its confirmed state, and exactly one toast appears, with Retry resending the same id and payload. Tests live next to the web code (`*.test.ts[x]`) and in `apps/api/test/` and `packages/shared/test/`, with `e2e/` holding the Playwright suite (`e2e/tests/`, run by `e2e/scripts/run-e2e.mjs`) and `scripts/` holding the stack smoke test.
