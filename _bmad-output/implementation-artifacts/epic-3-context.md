# Epic 3 Context: Run it on the network and hand it over

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the working app from Epics 1–2 into something the owner can deploy and hand over. The owner runs a production-like stack (built SPA behind nginx, production API, PostgreSQL) on one host with a single command and uses it from a phone on the same network. A new developer can get it running and understand its data flow within 15 minutes from the README and generated API docs. An end-to-end suite running against the real Compose stack proves the core flows, failure rollback, keyboard operation, and durability across restarts. A final accessibility, polish, and performance pass confirms the product feels finished rather than like a demo.

## Stories

- Story 3.1: Run the production-like stack on one host and use it from my phone
- Story 3.2: Documented API and a README that gets a new developer running in 15 minutes
- Story 3.3: End-to-end suite proving the core flows, rollback, and durability
- Story 3.4: Finished-product, accessibility, and performance check

## Requirements & Constraints

- **Durability:** every acknowledged change survives refresh, browser restart, a second device, API restart, and `docker compose down` then `up`, with timestamps unchanged. Target is zero lost or reverted Todos. Concurrent tabs resolve last-write-wins with no corruption.
- **Deployment scope:** manual deploy on one host over plain HTTP. No TLS, public hosting, CI/CD, backups, monitoring, auth, or more than one API replica. Anyone who can reach the URL can use the list; this is an accepted risk.
- **Three parts only:** frontend, Todo API, persistent store. No extra services. nginx is the web container's static server, not a separate proxy service.
- **Documented API:** every endpoint, its request and response schemas, and every error code are documented in the repository.
- **Onboarding:** a developer who did not build the app runs it locally and explains its data flow within 15 minutes using only the README and API docs. This is checked once as a documented walkthrough.
- **Test coverage:** automated tests cover every FR's consequences at the API level plus the core UI flows: add, edit, toggle, delete, and failure rollback.
- **Browsers:** latest two versions of Chrome, Edge, Firefox, and desktop Safari, plus iOS Safari and Android Chrome.
- **Performance:** each UI action shows within 100 ms. With 1,000 Todos, the list is interactive within 2 s on office broadband. API p95 is 300 ms or less at the server under single-user load.
- **Accessibility:** WCAG 2.1 AA, meaning full keyboard operation, visible focus, accessible labels, and text contrast of at least 4.5:1. The app stays usable at 200% zoom and 320 px width, with no horizontal scroll and touch targets of at least 44×44 px.
- **Finish:** "Todos" in the header and tab title, a favicon, one consistent design across List States, no placeholder text, no console errors, and no layout jumps.

## Technical Decisions

- **Production compose (`compose.yaml`):** `name: todos`, with services `web`, `api`, and `db`.
  - `web` is the Vite production build served by `nginx:1.30-alpine` (`apps/web/Dockerfile` plus `nginx.conf`).
  - `api` is a Node 24 production build (`apps/api/Dockerfile`) that applies committed Drizzle migrations before it listens.
  - `db` is `postgres:18-alpine`, with the named volume `todos-data` mounted at `/var/lib/postgresql`. Never mount it at `/var/lib/postgresql/data`, and never override `PGDATA`.
  - Only `web` publishes a host port, `${WEB_PORT:-8080}`. Every service has `restart: unless-stopped`, and `api` and `web` have `init: true`.
  - `db` has the healthcheck `pg_isready -h 127.0.0.1 -U $POSTGRES_USER`. `api` depends on `db: service_healthy` and has its own healthcheck on `/api/v1/health`.
  - Run it with `docker compose -f compose.yaml up -d`. Plain `docker compose up` must still give the Epic 1 dev stack through `compose.override.yaml`, and the two modes must not conflict.
- **Same-origin delivery:** nginx uses `try_files $uri /index.html` for the SPA fallback and `location /api/` with `resolver 127.0.0.11 valid=10s ipv6=off; set $api_upstream http://api:3000; proxy_pass $api_upstream;` with no URI part, so the `/api` prefix is kept and `api` is re-resolved at request time (a recreated `api` with a new IP keeps working). CORS stays off and the build contains no API base URL. An nginx HTML error page, such as a 502, reaches the client as a non-envelope body and is classified `INTERNAL`.
- **Plain-HTTP phones:** ids come from the `uuid` package (UUIDv7), not `crypto.randomUUID`, so no secure context is needed.
- **Config:** the API reads only `DATABASE_URL`, `PORT`, and `LOG_LEVEL`, validated at startup, and exits on bad values. `.env.example` is committed and `.env` is not. The README must explain every setting in `.env.example`.
- **OpenAPI:** `@fastify/swagger` 9.9 generates the document from the shared Zod schemas and serves it at `GET /api/v1/openapi.json`. `pnpm api:docs` writes the committed snapshot `docs/api/openapi.json`, and a test fails when the snapshot drifts from the current schemas. Don't hand-write schemas; the shared package is the single source.
- **README:** it covers prerequisites, the dev stack, tests and lint, running the production-like stack on one host and reaching it from other devices, every env setting, where data lives (`todos-data`), upgrading without data loss, a prominent warning that `docker compose down -v` permanently deletes all Todos, a link to the OpenAPI snapshot, and a one-paragraph repo map: web → shared ← api, plus the `todo-sync` protocol.
- **E2E:** Playwright 1.63 lives in `e2e/` and runs via `pnpm test:e2e` against the Compose stack.
  - Browsers: Chromium, Firefox, and WebKit at desktop width, plus a 360 px mobile viewport.
  - Inject failures with route interception.
  - Restart the stack with `down` then `up`, never `down -v`.
  - Fail any test that triggers a browser console error.
- **Accessibility scan:** `@axe-core/playwright`, with the version verified at implementation time. Run it in light and dark mode; dark mode follows `prefers-color-scheme` only, with no in-app toggle.
- **Stack pins are binding** (Node 24, pnpm 12.6, TS 6.0, Playwright 1.63, and the rest). Allowed imports are only web → shared and api → shared.
- **Existing smoke-test gap:** the proxy has only been checked by manual curl. Add an automated test that requests `/api/v1/health` through the proxy (nginx in the Compose stack), expects `{"status":"ok"}`, and confirms the path arrives unchanged.

## UX & Interaction Patterns

- **Failure copy under test:** each injected failure rolls the Todo back to its last confirmed state and shows exactly one toast with the exact Voice and Tone strings. The API `message` is never rendered. A failed add restores the typed text, and Retry resends the same `id` and payload. The Retry quote is the Description as-is when it has 40 characters or fewer, otherwise its first 40 characters plus "…".
- **Keyboard-only flow:** add, toggle, edit, and delete work with only Tab, Enter, Space, and Escape.
  - Tab order is input, Add, then each row's checkbox, Edit, and Delete.
  - Escape cancels an open edit first, then dismisses a toast.
  - After a delete, focus goes to the next row's checkbox, else the previous row's, else the input. Focus is never lost to `<body>`.
- **Edit semantics to exercise:** Enter or blur saves, Escape cancels and returns focus to Edit, and saving empty or unchanged text cancels.
- **List States to cover:** Empty ("Nothing here yet."), Load error with "Try again" going back to Loading, and Populated including Completed Todos (checked box, line-through, muted text).
- **Visual finish:** match `ux-designs/.../mockups/todo-list.html`. Where the mockup and the architecture or UX spines disagree, the spines win. Log each gap found in Story 3.4 as a follow-up with an owner, or fix it in that story.

## Cross-Story Dependencies

- Depends on Epics 1–2 being complete: the dev Compose stack, the shared contract, all CRUD endpoints, `todo-sync`, and every UI flow.
- 3.1's production stack is the target that 3.3's E2E suite, including the `down`/`up` durability test, and 3.4's performance and accessibility checks run against.
- 3.2's README documents 3.1's deploy command and volume behaviour, so write it after 3.1 settles or update it once 3.1 lands.
- 3.3 and 3.4 share the Playwright setup in `e2e/`. 3.4's axe scan and 1,000-Todo seed run can build on 3.3's harness.
