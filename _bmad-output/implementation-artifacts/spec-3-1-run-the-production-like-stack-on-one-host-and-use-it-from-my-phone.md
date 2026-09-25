---
title: 'Story 3.1: Run the production-like stack on one host and use it from my phone'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'e001a55acc988ffc05b6283fe24906d104764958'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Dev and prod share the `todos` Compose project, containers, host port 8080 and the `todos-data` volume, so switching modes replaces the other mode's containers, and a prod-first volume leaves dev without `todos_test`.
    evidence: |-
      AD-10 defines one topology with `name: todos`; `docker/db-init/01-todos-test.sql` runs only when dev initialises an empty volume. Raised by blind and edge-case review in both Story 3.1 passes. Needs an architecture decision (separate prod project/volume, or documented one-mode-at-a-time rule in the Story 3.2 README).
    location: >-
      compose.yaml:7
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `compose.yaml` is the production-like base, but it can't run on its own. Both Dockerfiles have only a `dev` stage, there is no `nginx.conf`, and neither service sets an image tag. Because of that, `docker compose -f compose.yaml up -d` would quietly reuse the dev-built `todos-api:latest` and `todos-web:latest` images, which run `tsx watch` and Vite.

**Approach:** Add a production final stage to each Dockerfile. `web` builds the SPA with Vite and serves it from `nginx:1.30-alpine` using a committed `apps/web/nginx.conf` that handles the SPA fallback and the same-origin `/api/` proxy. `api` runs on Node 24 with production dependencies only and applies migrations before it listens. Give each mode its own image tags so dev and prod never share a built image.

## Boundaries & Constraints

**Always:**
- Keep the AD-9 (as amended 2026-09-25) and AD-10 rules as written:
  - `try_files $uri /index.html`
  - `location /api/` with `resolver 127.0.0.11 valid=10s ipv6=off; set $api_upstream http://api:3000; proxy_pass $api_upstream;`. There is no URI part, so the prefix stays, and nginx re-resolves `api` at request time instead of pinning its startup IP
  - no CORS headers
  - only `web` publishes a host port, `${WEB_PORT:-8080}`, on all interfaces so a phone can reach it
  - `todos-data` is mounted at `/var/lib/postgresql`, and `PGDATA` is never set
  - every service has `restart: unless-stopped`, and `api` and `web` have `init: true`
  - the existing healthchecks and `depends_on` stay as they are
- The production stage is the **last** stage in each Dockerfile, so building with no target produces it. The `dev` stage stays byte-for-byte identical in behaviour.
- The API still reads only `DATABASE_URL`, `PORT`, and `LOG_LEVEL`. Migrations run in-process through the existing `runMigrations` in `server.ts`.
- nginx listens on container port `8080`, so the `8080` in `"${WEB_PORT:-8080}:8080"` stays correct in both modes.

**Never:**
- Don't add services, a TLS or edge proxy, CI/CD, or a web healthcheck.
- Don't bake an API base URL into the web build.
- Don't change the application source under `apps/*/src` or `packages/shared/src`.
- Leave the README to Story 3.2, and `test:e2e` and the Playwright browser suite to Story 3.3. This story adds only an HTTP-level stack smoke test (`pnpm test:stack`), which closes the nginx half of the deferred-work proxy item.
- Never mount the volume at `/var/lib/postgresql/data`, and never run `down -v` against the user's `todos` project.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SPA root | `GET /` | `200`, the built `index.html` (title "Todos") | — |
| SPA deep link | `GET /some/route` | `200`, the same `index.html` | — |
| Hashed asset | `GET /assets/<file>` | `200`, the file | — |
| API via proxy | `GET /api/v1/health` | `200` `{"status":"ok"}`. The API log line shows `route: /api/v1/health`, so the path arrived unchanged. | — |
| CRUD via proxy | POST/PATCH/DELETE on `/api/v1/todos…` | Same status codes and bodies as calling the API directly. No `Access-Control-*` headers. | — |
| API down | `api` stopped, `GET /api/v1/todos` | nginx `502` HTML. The client already classifies this as `INTERNAL`. | existing `http.ts` |
| Restart | Todos exist, then `down` and `up -d` | Every Todo is still present, with unchanged `createdAt` and `updatedAt` | — |
| API recreated | `api` recreated with a different container IP while `web` keeps running | `/api/v1/health` through nginx returns `200` again within 20 s, without restarting `web` | resolver re-lookup |
| Mode switch | the dev images exist, then `-f compose.yaml up -d` | Builds and runs the prod images. It doesn't reuse the dev ones. | — |

</intent-contract>

## Code Map

- `compose.yaml` -- the production-like base. It is already AD-10-correct. Add `image:` tags for `api` and `web`, and update the header comment that says it's "not runnable on its own".
- `compose.override.yaml` -- the dev overlay. It already sets `build.target: dev`. Add matching dev `image:` tags. Compose uses `image` as the build tag, so the dev and prod images stay separate.
- `apps/api/Dockerfile` -- stages `base` → `dev`. Reuse the manifest-copy pattern (all workspace `package.json` files, needed by `--frozen-lockfile`). Update the header comment.
- `apps/web/Dockerfile` -- same shape as the API one. `pnpm --filter @todos/web build` runs `tsc -b && vite build` and writes to `apps/web/dist`. `.dockerignore` already excludes `**/dist` and `**/node_modules`.
- `apps/api/src/server.ts` -- config, then `runMigrations`, then `listen` on `0.0.0.0`. It handles SIGTERM and SIGINT. Read-only.
- `apps/api/src/db/migrate.ts` -- `MIGRATIONS_FOLDER` resolves to `../../drizzle` from `src/db`. The image must keep the `apps/api/{src,drizzle}` layout. Read-only.
- `apps/api/package.json` -- `tsx` is already a runtime dependency, and `build` is only `tsc --noEmit`. `@todos/shared` exports raw `.ts`. Read-only.
- `apps/web/vite.config.ts` -- the dev proxy (`/api/` → `API_PROXY_TARGET`, no rewrite). nginx mirrors it. Read-only.
- `apps/web/src/features/todos/add-row.tsx:2` -- ids already use `v7` from `uuid`, so plain HTTP on a phone works. No change needed.
- `apps/web/src/api/http.ts` -- already classifies a non-envelope response, such as the nginx 502, as `INTERNAL`. Read-only.

## Tasks & Acceptance

**Execution:**
- **Start from the saved attempt:** run `git apply _bmad-output/implementation-artifacts/spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone-attempt-1.patch`. It already implements the tasks below except for the amendments listed in the Spec Change Log. Then apply those amendments; don't rewrite what the patch already gets right.
- `apps/web/nginx.conf` -- create one `server` block:
  - `listen 8080`, `root /usr/share/nginx/html`, and `server_tokens off`
  - `location /` with `try_files $uri /index.html`
  - `location /api/` with `resolver 127.0.0.11 valid=10s ipv6=off;`, `set $api_upstream http://api:3000;`, `proxy_pass $api_upstream;`, `proxy_http_version 1.1`, and `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers
  - `index.html` served with `Cache-Control: no-cache`, and `/assets/` with long-lived immutable caching
  - no CORS directives

  -- This is AD-9 same-origin delivery.
- `apps/web/Dockerfile` -- add a `build` stage (from `base`: copy the manifests, `pnpm install --frozen-lockfile --filter @todos/web...`, copy `packages/shared` and `apps/web`, `pnpm --filter @todos/web build`). Then add a final `prod` stage `FROM nginx:1.30-alpine` that copies `nginx.conf` to `/etc/nginx/conf.d/default.conf`, copies `dist` to `/usr/share/nginx/html`, and sets `EXPOSE 8080`. -- This is the Vite build served by nginx.
- `apps/api/Dockerfile` -- add a final `prod` stage from `base`:
  - set `NODE_ENV=production`
  - copy the same manifests
  - run `pnpm install --frozen-lockfile --prod --filter @todos/api...`
  - copy `packages/shared` and `apps/api`, then set `WORKDIR /app/apps/api`
  - `EXPOSE 3000`
  - also copy `tsconfig.base.json` (the API tsconfig extends it, so tsx transpiles with the same options as dev)
  - run as `USER node`
  - `CMD ["node", "--import", "tsx", "src/server.ts"]`, with no watch and no inspector

  -- This gives a production runtime on Node 24 with no dev dependencies, and it applies migrations before listening.
- `compose.yaml` -- set `image: todos-api:prod` and `image: todos-web:prod`, and refresh the header comment. -- This keeps dev images from being reused in prod mode.
- `compose.override.yaml` -- set `image: todos-api:dev` and `image: todos-web:dev`. -- The two modes don't conflict.
- `scripts/stack-smoke.test.mjs` (new) and root `package.json` -- add a `node:test` suite with no new dependencies, run by the new script `"test:stack"`. It is not part of `pnpm test`, because it needs Docker.
  - **Setup:** in `before`, run `docker compose -p todos-smoke -f compose.yaml up -d --build --wait`, with `WEB_PORT` defaulting to `18080` and credentials taken from the environment or `.env`.
  - **Checks:** it drives the stack through `fetch` against the host's non-loopback IPv4 (from `os.networkInterfaces()`, falling back to `127.0.0.1`) and covers every I/O-matrix row:
    - `/`, `/some/route`, and one `/assets/*` file taken from `index.html`
    - health, including the API log `route` from `docker compose logs api`
    - the full CRUD round trip, with no `Access-Control-*` headers
    - `down` then `up -d --wait`, checking the Todos and their timestamps are unchanged
    - `stop api`, expecting a `502` non-JSON HTML body within 8 s; the api logs then contain `database pool closed` (graceful SIGTERM); then `start api`
    - API recreated: `stop` and `rm -f api`, start a throwaway container (for example `alpine sleep`) on the project network to hold the old IP, `up -d --no-deps --wait api`, assert the api IP changed, and poll `/api/v1/health` through nginx until `200` (at most 20 s) without touching `web`; always remove the throwaway container
    - `docker compose config --format json` for both modes. Prod: `:prod` images, no build target, ports on `web` only (all interfaces), `restart: unless-stopped` on all three, `init: true` on `api` and `web`, the `todos-data` volume at `/var/lib/postgresql`, and no `PGDATA`. Dev: `target: dev` and `:dev` images
    - `docker image inspect todos-api:prod`: `Cmd` is `["node","--import","tsx","src/server.ts"]`, `Env` has `NODE_ENV=production`, `User` is `node`
  - **Robustness:** the persistence test asserts the ids it created (not a total count); every `fetch` in the helpers has an `AbortSignal.timeout`; a non-JSON API body is reported with its status instead of throwing a bare `SyntaxError`; and the suite prints a warning when it falls back to `127.0.0.1`, since the LAN path is then not exercised
  - **Teardown:** in `after`, always run `down -v`, and only for `todos-smoke`.

  -- This is the automated evidence for the matrix, and it closes the nginx half of the deferred-work proxy item. Mark that item resolved in `_bmad-output/implementation-artifacts/deferred-work.md`.

**Acceptance Criteria:**
- Given a host with Docker and `.env`, when I run `docker compose -f compose.yaml up -d`, then `web` (nginx serving the built SPA), `api` (reaches healthy after applying migrations), and `db` (reaches healthy) all start. `docker compose -f compose.yaml config` shows a published port only on `web`.
- Given the prod stack is running, when I request `/`, `/some/route`, and `/api/v1/health` on the web port from another interface's IP (not only localhost), then I get `index.html` twice and then `{"status":"ok"}`, with no `Access-Control-*` headers.
- Given the prod stack is running, when I create, toggle, edit, and delete a Todo through `http://<host-ip>:<port>/api/v1/todos`, then every call returns the documented status. The page loads in a browser over plain HTTP with no console errors.
- Given Todos exist, when I run `down` and then `up -d`, then they are all still there with unchanged timestamps.
- Given the dev override, when I run plain `docker compose config`, then `api` and `web` build `target: dev` with the `:dev` images, and the dev commands and mounts are unchanged.

## Spec Change Log

### 2026-09-25 — Owner decision on the review intent gap (AD-9 amended)
- **Trigger:** `[high]` review finding, confirmed by experiment. The literal `proxy_pass http://api:3000;` pins the IP nginx resolved at startup, so after `api` was recreated on a new IP (172.16.7.3 → .5) every `/api` request returned 502 until `web` restarted.
- **Amended (owner-approved option 1):**
  - Intent-contract Always rule and the nginx task: `resolver 127.0.0.11 valid=10s ipv6=off; set $api_upstream http://api:3000; proxy_pass $api_upstream;`. AD-9 in `ARCHITECTURE-SPINE.md`, `epics.md`, and `epic-3-context.md` were amended to match.
  - I/O matrix: a new "API recreated" row, plus a smoke test that forces a new IP.
  - The queued patch findings from the first review pass were folded into the tasks: prod-stage image assertions, the SIGTERM log check, the fail-fast timing, `USER node`, `tsconfig.base.json` in the API prod stage, topology assertions, id-based persistence checks, fetch timeouts, a tolerant parse, the loopback warning, and a recorded browser check.
- **Known-bad state avoided:** an nginx that pins a stale `api` IP and serves 502s until someone restarts `web`.
- **KEEP:**
  - The attempt-1 patch's Dockerfile stages, `:prod`/`:dev` image tags, cache headers, and isolated `todos-smoke` project with `down -v` only on that project.
  - The `node --import tsx` single-process runtime.
  - The health-route log check.

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 36 findings — high 3, medium 6, low 23, false 4, maybe-false 0
- attempt patch: [spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone-attempt-1.patch](spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone-attempt-1.patch). Code reverted to `baseline_revision`. The patch reapplies cleanly (`git apply --check`).
- findings:
  - `[medium]` `[patch]` (intent-alignment) The phone and browser surface is never exercised: no rendered page, no JS, no recorded manual browser check. — Real, because the spec's manual check has no record. Moot this pass because of the intent_gap.
  - `[false]` `[reject]` (intent-alignment) "Production build" was reinterpreted as the tsx loader. — The spec's Design Notes record this as a deliberate choice that Story 1.1 delegated to 3.1. The image carries production dependencies and `NODE_ENV=production`, and no bad outcome was shown.
  - `[false]` `[reject]` (intent-alignment) The client's `INTERNAL` classification for an nginx 502 isn't exercised. — `apps/web/src/api/http.test.ts:329` already covers a 502 HTML body → `INTERNAL`.
  - `[low]` `[reject]` (intent-alignment) The mode switch is tested only through `compose config` image names. — Compose picks the image to reuse by its name alone, so distinct `:dev` and `:prod` tags decide it. The existing dev images are tagged `todos-*:latest` and differ from `:prod`.
  - `[low]` `[reject]` (intent-alignment) The dev stack is never actually run. — The override diff only adds `image:` lines, and the user's dev stack was running throughout.
  - `[low]` `[patch]` (intent-alignment) The prod config test doesn't assert restart, `init`, the volume target, or `PGDATA`. — A direct assertion addition. Moot (intent_gap).
  - `[high]` `[intent_gap]` (blind) nginx resolves `api` once at startup, so a recreated `api` with a new IP gets 502 forever. — **Confirmed empirically.** In project `todos-dnscheck`, the api was recreated while another container held its old IP. The new api got 172.16.7.5 (was .3), and `GET /api/v1/health` through nginx returned `502` until `web` restarted. Any fix changes a literal that the intent contract locks in: `proxy_pass http://api:3000;`, and "depends_on stay as they are".
  - `[low]` `[reject]` (blind) `web` starts before `api` is healthy, so there are 502s at startup. — Only at startup. `depends_on` is fixed by the contract, and the UI shows Load error with Try again.
  - `[low]` `[patch]` (blind) Both prod images run as root. — Adding `USER node` to the API prod stage is a one-line fix. Moot (intent_gap).
  - `[false]` `[reject]` (blind) The API doesn't trust the proxy, so `X-Forwarded-For` is wasted. — The AD-11 log line has no client IP, and nothing reads `req.ip`.
  - `[low]` `[reject]` (blind) There is no gzip and no hardening headers. — This is a performance or hardening improvement, not a defect. It belongs to Story 3.4's performance pass.
  - `[low]` `[patch]` (blind) The persistence test asserts `todos.length === 2`, so it depends on the CRUD test's cleanup. — Assert the created ids instead. Moot (intent_gap).
  - `[low]` `[reject]` (blind) There's no README or phone instructions. — Out of scope by the epic's intent: Story 3.2 owns the README.
  - `[low]` `[patch]` (blind) The loopback fallback silently weakens the LAN check. — Warn when falling back to `127.0.0.1`. Moot (intent_gap).
  - `[low]` `[reject]` (blind) An inherited `WEB_PORT` isn't probed. — Compose fails loudly with a bind error, and it's rare.
  - `[low]` `[reject]` (blind) `/api` without a trailing slash falls through to the SPA. — No client ever calls it.
  - `[low]` `[reject]` (blind) The manifest copies have no comment, and there's no pnpm cache mount. — This mirrors the existing dev stage. It only affects build speed.
  - `[medium]` `[patch]` (verification-gap) Nothing checks that the API image is the prod stage (Cmd, `NODE_ENV`). — Pre-verified. Add a `docker image inspect todos-api:prod` assertion. Moot (intent_gap).
  - `[medium]` `[patch]` (verification-gap) SIGTERM graceful shutdown isn't checked. — Pre-verified. Assert `database pool closed` after `stop api`. Moot (intent_gap).
  - `[low]` `[patch]` (verification-gap) The fail-fast of `proxy_connect_timeout 5s` isn't timed. — Pre-verified. Assert elapsed < 8 s. Moot (intent_gap).
  - `[high]` `[intent_gap]` (verification-gap, other) nginx caches the resolved `api` IP. — Same root cause and evidence as the blind finding above.
  - `[false]` `[reject]` (verification-gap, other) The health `route` log proves less than claimed. — `/api/v1/health` has no params. A stripped prefix would reach `/v1/health` and 404, so a `route: /api/v1/health` line does prove the prefix arrived.
  - `[high]` `[intent_gap]` (edge-case) nginx pins the `api` IP. — Same root cause and evidence as the blind finding above.
  - `[low]` `[reject]` (edge-case) `/api` and missing root files return `index.html`. — `favicon.svg` exists, and no client requests `/api`.
  - `[medium]` `[defer]` (edge-case) If prod first creates `todos-data`, `todos_test` is missing for dev. — The shared project and volume come from AD-10's one-topology decision, which predates this story. Moot this pass because of the intent_gap, and not yet added to `deferred`.
  - `[medium]` `[defer]` (edge-case) Running prod while dev is up replaces dev's containers. — Same AD-10 root cause as the finding above.
  - `[low]` `[patch]` (edge-case) The API prod stage omits `tsconfig.base.json`, so tsx transpiles without the base options. — Copy it, as the web build stage already does. Moot (intent_gap).
  - `[low]` `[reject]` (edge-case) The port probe ignores `[::]` and has a race. — It fails loudly, and it's rare.
  - `[low]` `[patch]` (edge-case) Loopback fallback. — Same root cause as the blind loopback finding. Moot (intent_gap).
  - `[low]` `[patch]` (edge-case) `JSON.parse` on a non-JSON body hides the status. — Use a tolerant parse. Moot (intent_gap).
  - `[low]` `[patch]` (edge-case) The `waitForHealth` fetch has no timeout. — Use `AbortSignal.timeout`. Moot (intent_gap).
  - `[low]` `[patch]` (edge-case) The persistence test depends on the CRUD test's cleanup. — Same root cause as the blind finding. Moot (intent_gap).
  - `[low]` `[reject]` (edge-case) A rejected `start api` in `finally` masks the original error. — Unlikely, and it's diagnostic only.
  - `[low]` `[reject]` (edge-case) The smoke run overwrites the `todos-*:prod` tags. — It builds from the same tree, so the images are equivalent.
  - `[medium]` `[defer]` (edge-case, claim) "Two modes don't conflict" holds only for images. — Same AD-10 root cause as the shared-volume finding.
  - `[low]` `[patch]` (edge-case, claim) The test accepts 504 as well as 502. — Same root cause as the fail-fast timing finding: bounding the elapsed time keeps it fail-fast. Moot (intent_gap).

### 2026-09-25 — Review pass (after the AD-9 amendment)
- verdicts: 33 findings — high 0, medium 2, low 27, false 4, maybe-false 0
- findings:
  - `[medium]` `[defer]` (blind) Dev and prod share the `todos` project, the `todos-data` volume and port 8080, so switching modes replaces the other mode's containers. — carried: shared-volume/mode-conflict rows of the first pass (AD-10 one-topology decision). Added to `deferred`.
  - `[low]` `[reject]` (blind) `web` has no healthcheck and doesn't wait for a healthy `api`. — carried: the startup-only 502 window; `depends_on` is fixed by the contract, and the Never list forbids a web healthcheck.
  - `[low]` `[reject]` (blind) nginx sets no `proxy_read_timeout`/`proxy_send_timeout`, so a hung API holds requests for 60 s. — The client aborts at 10 s regardless (`http.ts`, `NETWORK`), and the API bounds DB calls with `query_timeout` 5 s → 503. There is no user-visible difference.
  - `[false]` `[reject]` (blind) The "path unchanged" log check can't tell proxied requests from healthcheck ones. — carried: a stripped prefix would 404, and the test requires the whole 5-request burst in its window.
  - `[low]` `[patch]` (blind) The graceful-shutdown check scans the container's whole log history. — Fixed: the test records `stoppedAt` before `stop api` and only accepts a `database pool closed` line with `time >= stoppedAt`.
  - `[low]` `[reject]` (blind) An inherited `WEB_PORT` isn't probed. — carried: compose fails loudly, and it's rare.
  - `[low]` `[reject]` (blind) There's no README or phone instructions. — carried: Story 3.2 owns the README.
  - `[false]` `[reject]` (blind) The spec file is modified but not in the diff. — The workflow leaves the spec out of the diff on purpose (it is the edge-case layer's claims file).
  - `[low]` `[reject]` (blind) The nginx image runs as root. — The stock image's master runs as root, and its workers already drop to `nginx`. Nothing is exposed beyond port 8080. Hardening is out of this story's scope.
  - `[low]` `[reject]` (blind) There is no gzip, no security headers, and no `Cache-Control` on root files. — carried: this belongs to Story 3.4's performance and hardening pass.
  - `[low]` `[reject]` (blind) `Host $host` drops the port, and `proxy_http_version 1.1` does nothing without keepalive. — The API builds no absolute URLs. The directive is harmless.
  - `[low]` `[reject]` (blind) The prod API image carries its tests and configs. — This only affects image size, and there is no runtime effect.
  - `[false]` `[reject]` (blind) nginx listens on IPv4 only, so IPv6 phones can't connect. — Docker publishes the host port on `::` as well (`[::]:port` seen in `docker ps`) and forwards to the container's IPv4 port, so IPv6 clients reach it.
  - `[low]` `[reject]` (intent-alignment) The mode switch is checked only as `compose config` tag names. — carried: distinct tags decide reuse deterministically.
  - `[low]` `[reject]` (intent-alignment) The smoke run overwrites the global `todos-*:prod` tags. — carried: it builds from the same tree, so the images are equivalent.
  - `[low]` `[reject]` (intent-alignment) API down widens 502 to 502/504 on the first request. — A 504 is possible only in the ≤10 s resolver-cache window right after `stop`. The steady stopped state is asserted as exactly 502, which is the matrix row. The client classifies both as `INTERNAL` (status-agnostic non-JSON handling in `http.ts`).
  - `[low]` `[reject]` (intent-alignment) The phone path never leaves the host. — The test uses the host's LAN IP plus an all-interfaces publish assertion, and a headless browser check was recorded. Another physical device can't be automated here.
  - `[false]` `[reject]` (intent-alignment) CRUD is compared with fixed codes, not a direct API call. — The API has no host port by design (AD-10). The codes asserted are the documented contract.
  - `[low]` `[reject]` (intent-alignment) Restart, `init`, volume and `PGDATA` are checked only in config. — For compose topology, the resolved config is the authoritative surface.
  - `[low]` `[reject]` (verification-gap) `proxy_connect_timeout 5s` isn't pinned by a hanging-connect test. — Filed disposition defer. If it regressed, a hanging connect would still end at the client's 10 s abort (`NETWORK`), and closing the gap needs an iptables SYN-drop rig. It's low, so it's rejected rather than deferred.
  - `[low]` `[patch]` (verification-gap) `server_tokens off` isn't asserted. — Fixed: GET / asserts `Server: nginx` with no version, and the steady 502 body must not match `/nginx\/\d/`.
  - `[low]` `[reject]` (verification-gap, other) Nothing runs `pnpm test:stack` automatically. — By design: it needs Docker, and CI/CD is out of scope (NFR).
  - `[medium]` `[patch]` (edge-case) `up -d` without `--build` after a code change reuses stale `:prod` images. — Fixed: the `compose.yaml` header now says to use `up -d --build` after pulling or changing code. The Story 3.2 README must repeat this in its upgrade section.
  - `[low]` `[reject]` (edge-case) The smoke run overwrites global image tags. — carried.
  - `[low]` `[patch]` (edge-case) The recreate test's `{status:"ok"}` assertion was swallowed by `catch`. — Fixed: the body is captured in the loop and asserted after it, outside the try/catch.
  - `[low]` `[reject]` (edge-case) An exported `WEB_PORT` isn't probed. — carried.
  - `[low]` `[reject]` (edge-case) The port probe ignores `[::]` and has a race. — carried.
  - `[low]` `[reject]` (edge-case) VPN and other virtual NICs aren't in the virtual-NIC regex. — Host-specific, and the test still runs, just not over the LAN.
  - `[low]` `[reject]` (edge-case) Container/host clock skew could push log lines out of the window. — Linux Docker shares the host clock. There's a 1 s margin, and it's rare elsewhere.
  - `[low]` `[reject]` (edge-case) There is no `proxy_read_timeout`. — Same root cause and evidence as the blind timeout row above.
  - `[low]` `[reject]` (edge-case) `/api` without a slash returns the SPA. — carried.
  - `[low]` `[reject]` (edge-case) Unconsumed poll response bodies. — This is a short-lived test process, and undici frees them on GC.
  - `[low]` `[reject]` (edge-case, claim) The first request accepts 504. — Same evidence as the intent-alignment API-down row above.

## Design Notes

- **API "production build":** Story 1.1 left this choice to Story 3.1. We run TypeScript through tsx's loader (`node --import tsx`) with production dependencies only, and we don't bundle. `@todos/shared` ships raw `.ts`, and `MIGRATIONS_FOLDER` depends on the source layout, so bundling would mean rewiring both. Running the loader in-process (rather than the `tsx` CLI) keeps a single Node process, so `init: true` delivers SIGTERM straight to `server.ts`'s shutdown handler. Type safety is still gated by `pnpm typecheck` and the tests.
- **Shared volume:** dev and prod share the `todos` project and the `todos-data` volume by design (AD-10: one topology). The `todos_test` database exists only when dev initialised the volume.

## Verification

Verify in an **isolated project** so the user's running dev stack and its data are untouched. The smoke suite uses `-p todos-smoke` with a free `WEB_PORT` (default `18080`).

**Commands:**
- `pnpm test:stack` -- expected: every test passes (isolated `todos-smoke` project, torn down afterwards).
- `docker compose config` and `docker compose -f compose.yaml config` -- expected: dev uses `target: dev` and `:dev` images; prod uses `:prod` images and publishes ports only on `web`.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. The source is unchanged, so this is a regression guard.

**Manual checks (record the outcome in the report):**
- Open the prod page in a real browser (headless Chromium through Playwright is fine) at the host's LAN IP. Add, toggle, edit, and delete a Todo, and confirm there are no console errors.

## Auto Run Result

Status: blocked
Blocking condition: intent gap

**What was attempted:**
- Production final stages in `apps/api/Dockerfile` (`node --import tsx`, production dependencies only) and `apps/web/Dockerfile` (Vite build, then `nginx:1.30-alpine`).
- A new `apps/web/nginx.conf` with the SPA fallback, the unprefixed `/api/` proxy, and cache headers.
- `:prod` and `:dev` image tags in `compose.yaml` and `compose.override.yaml`.
- A `pnpm test:stack` smoke suite (`scripts/stack-smoke.test.mjs`) and a deferred-work resolution note.
- Everything is saved in `spec-3-1-run-the-production-like-stack-on-one-host-and-use-it-from-my-phone-attempt-1.patch`, and the code is reverted to baseline `390063af4c5954bb1066fa9ace688b5d27fbcb07`.

**Verification before review:**
- `pnpm test:stack`: 9/9 passed, in the isolated `todos-smoke` project, which was torn down afterwards.
- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: web 257/257 and shared 46/46 passed. api was 157/158: `test/server.test.ts` "on SIGTERM closes fastify…" timed out once and then passed on two reruns. It is a pre-existing timing flake, and no API source was changed.
- The user's `todos` dev stack and its `todos-data` volume were never touched.

**Why it is blocked:**
- Review found, and an experiment confirmed, that `proxy_pass http://api:3000;` makes nginx resolve `api` once at startup.
- In the experiment the API was recreated while another container held its old IP. The API came back on 172.16.7.5 instead of .3, and every `/api` request returned `502` until `web` restarted.
- Every fix has to change something the intent contract (and architecture AD-9/AD-10) states literally: the `proxy_pass http://api:3000;` directive, or "depends_on stay as they are".

**Questions for the owner or architect:**
1. May AD-9's nginx rule become runtime DNS resolution? The recommended form keeps the prefix unchanged:
   ```nginx
   resolver 127.0.0.11 valid=10s ipv6=off;
   set $api_upstream http://api:3000;
   proxy_pass $api_upstream;
   ```
   With a variable and no URI part, nginx passes the original request URI through.
2. If not, which alternative is preferred?
   - An `upstream api { zone api 64k; server api:3000 resolve; }` block, which needs nginx 1.27.3 or later.
   - `web.depends_on.api: { condition: service_healthy, restart: true }`. This covers only restarts that Compose itself drives, not an IP change after a crash restart.
3. Should AD-10's shared `todos` project and `todos-data` volume stay shared between dev and prod? Review found that prod-first creation leaves dev without `todos_test`, and that switching modes replaces the other mode's containers.

**Once resolved:** amend the intent contract's Always rule (and AD-9), reapply the attempt patch, then apply the queued patch findings from the triage log:
- the API image-stage and SIGTERM assertions
- timing the fail-fast
- `USER node`
- `tsconfig.base.json` in the API prod stage
- id-based persistence asserts
- a fetch timeout and a tolerant parse in the test
- a warning on loopback fallback
- topology assertions
- a recorded browser check

**Follow-up review recommendation:** false. This pass patched nothing, so there is nothing to follow up; the next run reviews fresh after re-derivation.

## Auto Run Result (rerun after the AD-9 amendment)

Status: done

**What was implemented:** the production-like stack runs from `compose.yaml` on its own, reachable from other devices on the LAN.

**Files changed:**
- `apps/web/nginx.conf` (new): the SPA fallback, cache headers, `server_tokens off`, and the same-origin `/api/` proxy. The proxy uses `resolver 127.0.0.11 valid=10s ipv6=off; set $api_upstream http://api:3000; proxy_pass $api_upstream;` (amended AD-9), so a recreated `api` on a new IP keeps working.
- `apps/web/Dockerfile`: a `build` stage (the Vite build) and a final `prod` stage on `nginx:1.30-alpine`.
- `apps/api/Dockerfile`: a final `prod` stage with production dependencies only, `NODE_ENV=production`, `tsconfig.base.json`, and `USER node`, running `node --import tsx src/server.ts`. Migrations are applied before it listens.
- `compose.yaml`: the `:prod` image tags, and header comments that include "use `up -d --build` after code changes".
- `compose.override.yaml`: the `:dev` image tags, so dev and prod never reuse each other's builds.
- `scripts/stack-smoke.test.mjs` (new) and `package.json` (`test:stack`): an 11-test HTTP-level suite. It runs in the isolated `todos-smoke` project, and its teardown runs `down -v` on that project only.
- `_bmad-output/implementation-artifacts/deferred-work.md`: the nginx half of the proxy smoke item is marked resolved.

**Review (after the amendment):** 33 findings.
- Patches applied (4):
  - medium: the stale-image upgrade note
  - low: a time-bounded shutdown log check
  - low: `Server` header and version assertions
  - low: the recreate-test assertion moved out of the catch
- Deferred (1, medium): dev and prod share a project and volume.
- Rejected: 24 lows and 4 falses, each with its reason in the triage log. There were no highs.
- Before the patches went in, verification had also tightened the API-down test: after the resolver cache expires, it now asserts exactly 502.

**Follow-up review recommendation:** false. The pass patched 1 medium and 3 lows, and no highs.

**Verification:**
- `pnpm test:stack`: 11/11 passed after the patches, including the new "API recreated on a new IP" test with the web container not restarted. The `todos-smoke` project was fully removed.
- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: shared 46/46 and web 257/257 passed. api was 157/158: `test/server.test.ts` "on SIGTERM…" fails in this environment only. The spawned server gets `EADDRINUSE` binding an ephemeral port on `0.0.0.0` because the host's ephemeral ports are exhausted. About 81k established connections to the dev API's inspector (`127.0.0.1:9229`) are held by the VS Code server process. The API source and tests are identical to baseline, and the test passed earlier today before the leak grew.
- The implementation subagent recorded a browser check: headless Chromium at 1280 px and 360 px at the host's LAN IP. Add, toggle, edit, delete, reload and the deep link all worked, with no console errors.

**Residual risks:**
- The shared dev/prod project and volume (deferred).
- `pnpm test:stack` runs only by hand.
- The VS Code inspector connection leak makes `server.test.ts` fail on this host until it is cleared, for example by closing the forwarded/auto-attach debug session for port 9229 or restarting the dev `api` container.

