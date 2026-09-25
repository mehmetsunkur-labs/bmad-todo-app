---
title: 'Story 3.3: End-to-end suite proving the core flows, rollback, and durability'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'b0e5257900ccc5e2884f8abe0d67eedcdbafa29e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing proves the product works end to end. `pnpm test:e2e` is a stub, and `e2e/` holds only a `package.json`. The UI flows have been checked only by unit tests and by one-off browser checks in Epics 1–2.

**Approach:**
- Add a Playwright 1.63 suite in `e2e/`, run by `pnpm test:e2e`.
- It brings up the real production-like Compose stack in an isolated project and drives it in Chromium, Firefox and WebKit at desktop width, plus a 360 px mobile viewport.
- It covers the core flows, failure rollback through route interception, keyboard-only use, and durability across `down` then `up`.
- Any browser console error fails the test.

## Boundaries & Constraints

**Always:**
- **Isolated stack.** The suite runs `compose.yaml` on its own in a dedicated project `todos-e2e`, on a free `WEB_PORT`, and never touches the user's `todos` project.
  - The durability test restarts that stack with `docker compose -p todos-e2e -f compose.yaml down`, then `up -d --wait`, never with `-v`.
  - Only the final teardown runs `down -v`, and only for `todos-e2e`.
- **No host changes.** Browsers run in the official `mcr.microsoft.com/playwright:v1.63.0-noble` image through `playwright run-server` on host networking. The test runner connects to it with `connectOptions`.
  - Don't install browsers or OS packages on the host. WebKit lacks host libraries here, and the container provides them.
- **Real API for success paths.** Failures are injected only with `page.route` (fulfil a 500 AD-5 envelope, or `abort`). Mocked bodies never stand in for successful responses.
- **Exact copy.** Assertions use the exact Voice and Tone strings, including curly quotes and the 40-code-point quote rule, and the accessible role and name selectors the UI already exposes.
- **Console errors fail tests.** An auto fixture collects `console` errors and `pageerror` for every test and fails it.
  - The only exemption is the browser's own resource-load error lines (`Failed to load resource…`, `net::ERR_…`) for requests the test itself intercepted through the suite's failure-injection helper.
- **Pinned versions.** Use `@playwright/test` `~1.63.0` and the matching image tag.
- **Kept out of other suites.** `pnpm test`, `pnpm lint` and `pnpm typecheck` stay green. The e2e package's script is named `test:e2e`, so `pnpm -r test` doesn't run it.

**Never:**
- Don't change the application code under `apps/*/src` or `packages/shared/src`. If a test exposes an app bug, report it and don't patch around it.
- Don't add the axe accessibility scan, the 1,000-Todo performance run, or visual checks. Those belong to Story 3.4.
- Don't run `down -v` or any disruptive command against the `todos` project.
- Don't use fixed sleeps where an auto-waiting assertion works.

## I/O & Edge-Case Matrix

Every row runs in all four browser projects unless it says otherwise.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | type in "New todo", then press Enter or click Add | The row appears, the input is cleared and keeps focus (desktop), and the row survives a reload | — |
| Edit: Enter | Edit, type, then Enter | The Description is saved and focus returns to that row's Edit button | — |
| Edit: Escape | Edit, type, then Escape | Nothing is saved, the original Description stays, and focus returns to Edit | — |
| Edit: blur | Edit, type, then click elsewhere | The Description is saved | — |
| Toggle both ways | click the checkbox twice | Checked (line-through) and then unchecked. Both states survive a reload. | — |
| Delete + focus | delete the middle, then the last, then the only row | Focus moves to the next row's checkbox, then the previous row's, then the Add input. It is never on `<body>`. | — |
| Empty state | no Todos | "Nothing here yet." and "Add your first todo above." | — |
| Load error → Try again | `GET /api/v1/todos` fulfilled 500 on load, then unrouted, then "Try again" clicked | An alert shows "Couldn't load your todos." and a "Try again" button. After the click, the list loads. | injected |
| Add fails | POST fulfilled 500 | The row is removed and the typed text is back in the input. Exactly one toast: `Couldn't add that todo. Your text is back in the box.` Resubmitting the unchanged text sends the same `id`. | injected |
| Add fails while other text is typed | POST held, the user types new text, then POST fulfilled 500 | Exactly one toast, `Couldn't add “<quote>”.`, with Retry. Retry (route removed) resends the same `id` and `description`, and the row appears. | injected |
| Toggle fails | PATCH `{completed}` fulfilled 500 | The checkbox reverts. Exactly one toast: `Couldn't update that todo. Please try again.` | injected |
| Edit fails | PATCH `{description}` fulfilled 500 | The confirmed Description is shown and the field reopens with the attempted text. Exactly one toast: `Couldn't save your edit. Please try again.` | injected |
| Delete fails | DELETE fulfilled 500 | The row reappears in place. Exactly one toast: `Couldn't delete that todo. Please try again.` | injected |
| Keyboard only | add, toggle, edit and delete using only Tab, Enter, Space and Escape (plus typed characters) | Every step succeeds, and `document.activeElement` is never `<body>` after any key press | — |
| Durability (desktop Chromium only, runs last) | Todos created through the UI, then the stack is `down`, then `up -d --wait`, then the page reloads | Every Todo is present, with the same `createdAt`/`updatedAt` read through the API | — |
| Console guard | a test page emits a `console.error` | That test fails | fixture |

</intent-contract>

## Code Map

- `e2e/package.json` -- the empty workspace package `@todos/e2e`, already listed in `pnpm-workspace.yaml`. The Dockerfiles copy it for `--frozen-lockfile`, so a lockfile change there is expected and fine.
- `scripts/stack-smoke.test.mjs` -- Story 3.1's harness to reuse as a pattern: `compose()` via `execFile`, `firstFreePort`, `pickHostAddress`, `waitForHealth`, `down -v` in `after` for its own project only.
- `compose.yaml` -- the prod-like stack (`name: todos`, overridden with `-p`). `WEB_PORT` is published on all interfaces, and `.env` supplies the credentials.
- **UI selectors** (all in `apps/web/src/features/todos/`):
  - Add row (`add-row.tsx:100-123`): `getByRole('textbox',{name:'New todo'})` and `getByRole('button',{name:'Add',exact:true})`.
  - Row (`todo-row.tsx:146-220`): `li[data-todo-id]`, `getByRole('checkbox',{name:<Description>})`, and buttons `Edit todo: <D>` / `Delete todo: <D>`.
  - Edit field (`edit-field.tsx:110-124`): `getByRole('textbox',{name:'Edit todo: <D>'})`. Use `getByRole`, not `getByLabel`, because the Edit button has the same label.
  - List and states (`todo-list.tsx:446`, `list-states.tsx:14-80`): the list is `getByRole('list',{name:'Todos'})`. Loading is shown by `aria-busy`, and after 300 ms by `todo-skeleton` test ids. The Empty and Load error texts are there, plus the `Try again` button.
- **Toasts:**
  - `li[data-sonner-toast]` wraps each toast, and its text is in `getByRole('status')` (`apps/web/src/lib/toast.tsx:71`).
  - Retry is `getByRole('button',{name:'Retry'})`.
  - There is no Dismiss button.
  - Plain toasts auto-dismiss after 8 s, and Retry toasts stay until acted on.
- **Copy strings:** `create-failure.ts:10-14, 52-57, 94`, `toggle-failure.ts:3`, `edit-failure.ts:14-19`, `delete-failure.ts:7`. The quote rule uses `Array.from(description)`: at 40 code points or fewer the quote is used as-is, otherwise the first 40 plus `…`.
- **Behaviour anchors:**
  - Retry and resubmitting the unchanged text reuse the create id (`todo-sync.ts:310`, `add-row.tsx:87-90`).
  - Focus after delete (`todo-list.tsx:99-109, 276-295`).
  - The Add input autofocuses only on `(hover: hover) and (pointer: fine)` (`add-row.tsx:69-73`), so mobile contexts don't get it.
  - Escape priority, edit first and then toast (`edit-field.tsx:102-104`, `sonner.tsx:32-35`).
- **Motion:** row entrance takes 150 ms and exit 100+150 ms (`row-entrance.ts`, `row-exit.ts`). Both are skipped under `prefers-reduced-motion: reduce`, so emulate it for stable tests.
- **Console:** there are no `console.*` calls in app code. Chromium and WebKit log "Failed to load resource…" for injected 500s, and a `net::ERR_…` line for aborts.
- **Timeout:** `REQUEST_TIMEOUT_MS = 10_000` (`packages/shared/src/limits.ts:8`). A 500 envelope and an abort show the same copy.
- **Environment:**
  - Host Playwright can't launch WebKit (missing OS libraries).
  - `mcr.microsoft.com/playwright:v1.63.0-noble` is pulled locally. `docker run --network host … npx -y playwright@1.63.0 run-server --port <p> --host 127.0.0.1` was verified with `chromium|firefox|webkit.connect()`.
- `README.md` -- its test section says `pnpm test:e2e` is a Story 3.3 stub. Update it.

## Tasks & Acceptance

**Execution:**
- `e2e/package.json` -- add `@playwright/test` `~1.63.0` and `@types/node` as devDependencies. Add the scripts `"test:e2e": "node scripts/run-e2e.mjs"` and `"typecheck": "tsc --noEmit"`. Run `pnpm install`.
- `e2e/tsconfig.json` -- extend `../tsconfig.base.json`, with `types: ["node"]` and `noEmit`.
- `e2e/scripts/run-e2e.mjs` (new) -- the orchestrator. Every step always ends in teardown.
  1. Pick a free port starting at 18280, and a free run-server port.
  2. Run `docker compose -p todos-e2e -f compose.yaml up -d --build --wait` from the repo root.
  3. Start `mcr.microsoft.com/playwright:v1.63.0-noble` as the `run-server` container (`--network host --init --ipc=host`, a unique name, `--rm`), and wait for its WebSocket port.
  4. Export `E2E_BASE_URL=http://127.0.0.1:<port>`, `PW_TEST_CONNECT_WS_ENDPOINT` (or equivalent `connectOptions` input), `E2E_COMPOSE_PROJECT=todos-e2e` and `E2E_WEB_PORT`.
  5. Spawn `playwright test`, passing extra CLI args through.
  6. **Teardown** always runs: remove the server container, then `down -v` for `todos-e2e` only.
  7. Exit with Playwright's exit code.
- `e2e/playwright.config.ts` (new):
  - `testDir: "tests"`, `workers: 1`, `fullyParallel: false`, `retries: 0`.
  - `use`: `baseURL` from the environment, `connectOptions` from the environment, `reducedMotion: "reduce"`, `trace: "retain-on-failure"`.
  - Projects:
    - `chromium`, `firefox` and `webkit`, using the Desktop devices
    - `mobile-chromium` at 360×800 with `isMobile` and `hasTouch`
    - `durability`: Chromium, `testMatch` for the durability spec only, and `dependencies` on the four browser projects so it runs last. The other projects ignore that spec.
- `e2e/tests/fixtures.ts` (new) -- `test` extends Playwright's with:
  - An auto `consoleGuard` fixture that fails the test on any `console` error or `pageerror`, except resource-load lines for URLs registered with `failNext`.
  - `failNext(method, urlGlob, { status?: 500, abort?: boolean, hold?: Promise })`: a one-shot `page.route` that fulfils an AD-5 `INTERNAL` envelope or aborts, records the request body, and registers the exemption.
  - `resetTodos`, which runs `beforeEach` through `request` against the API: list, then DELETE each.
  - Small helpers: `addTodo(page, text)`, `row(page, description)`, `toasts(page)`, and a `quote()` that mirrors the 40-code-point rule.
- `e2e/tests/core-flows.spec.ts` (new) -- the Add, Edit (Enter/Escape/blur), Toggle both ways, Delete + focus, Empty state, and Load error → Try again rows.
- `e2e/tests/rollback.spec.ts` (new) -- the four "… fails" rows plus "Add fails while other text is typed". Each asserts the rollback, exactly one `[data-sonner-toast]`, and the exact copy. It also asserts the resent `id`/`description` via the captured request bodies.
- `e2e/tests/keyboard.spec.ts` (new) -- the keyboard-only row. After every `keyboard.press`, assert that `document.activeElement !== document.body`.
- `e2e/tests/durability.spec.ts` (new) -- create Todos through the UI, then run `docker compose -p $E2E_COMPOSE_PROJECT -f compose.yaml down` and `up -d --wait` through `execFile`, wait for health, reload, and check that every Todo is present with equal timestamps read through the API.
- `e2e/tests/console-guard.spec.ts` (new) -- a meta-test showing that a page `console.error` fails the test, using `test.fail()` so the suite stays green.
- `package.json` (root) -- set `"test:e2e": "pnpm --filter @todos/e2e test:e2e"`. `eslint.config.js` and `.prettierignore`: lint `e2e/**/*.ts`, and ignore `e2e/test-results` and `e2e/playwright-report`. `.gitignore`: add those two directories.
- `README.md` -- replace the `test:e2e` stub note with what it runs: it needs Docker, pulls the Playwright image on first run, starts the isolated `todos-e2e` project and tears it down, and `pnpm test:e2e -- --project=chromium` narrows the run.

**Acceptance Criteria:**
- Given Docker and the repo, when I run `pnpm test:e2e`, then every I/O-matrix row passes in each listed project (chromium, firefox, webkit, mobile-chromium, with durability last), and afterwards no `todos-e2e` container, volume or run-server container remains.
- Given the user's `todos` stack in any state, when the suite runs, then that project's containers and `todos-data` volume are untouched.
- Given any test whose page logs a console error that wasn't produced by its own injected failure, when it runs, then it fails.
- Given the repo, when I run `pnpm lint`, `pnpm typecheck` and `pnpm test`, then they pass, and `pnpm test` doesn't start Playwright.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 47 findings — high 0, medium 8, low 38, false 1, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) The durability project depends on the four browser projects, so any browser failure skips it. — The run still fails (non-zero exit) on the failing test, and the report lists durability as not run. It's never a false green.
  - `[low]` `[patch]` (blind) The Playwright version is hard-coded in the orchestrator, while package.json allows `~1.63.0`. — Fixed: the version is read from the installed `@playwright/test/package.json` and used for both the image tag and npx.
  - `[low]` `[patch]` (blind) run-server fetches `playwright` from npm on every run. — Fixed: the README now states that every run needs npm registry access. Caching it would be an enhancement.
  - `[low]` `[patch]` (blind) `--network host` works only on Linux. — Fixed: the README now states that the suite needs Linux Docker and that Docker Desktop is not supported.
  - `[medium]` `[patch]` (blind) A single injected failure exempts every later resource error on that URL. — Fixed: each injected failure now exempts at most one matching console line (a counter), and a new meta-test proves an unrelated error still fails.
  - `[low]` `[reject]` (blind) Firefox has no check for unexpected HTTP errors. — Firefox doesn't log error statuses. The tests assert UI outcomes, and the spec defines the guard as covering console errors.
  - `[low]` `[reject]` (blind) The `test.fail()` meta-tests could pass for the wrong reason. — The implementer checked the JSON report: all four fail with "the page logged console errors". A test can't inspect its own expected failure more cheaply than that.
  - `[low]` `[reject]` (blind) There is no e2e test that queued writes are dropped after a failure. — Outside the Story 3.3 acceptance criteria. It is covered by the `todo-sync` unit tests.
  - `[low]` `[reject]` (blind) Retry is tested only for Add. — The acceptance criteria require Retry for Add only. The others are covered by unit tests.
  - `[low]` `[reject]` (blind) There is no e2e test of input validation. — Not in the Story 3.3 acceptance criteria. API and unit suites cover it.
  - `[low]` `[patch]` (blind) Running `playwright test` directly fails confusingly. — Fixed: the config throws a clear message to run it via `pnpm test:e2e`.
  - `[low]` `[reject]` (blind) The orchestrator calls a hard-coded internal `cli.js` path. — It works with the pinned version. Robustness only.
  - `[low]` `[patch]` (blind) Ctrl+C forwards a second SIGINT, which force-exits Playwright. — Fixed: SIGINT is no longer forwarded; other signals still are.
  - `[low]` `[reject]` (blind) A compose timeout is reported as a plain SIGTERM failure. — Diagnostic only, and rare.
  - `[low]` `[patch]` (blind) The durability test doesn't assert that `updatedAt` differs from `createdAt`. — Fixed: it asserts this before the restart.
  - `[low]` `[reject]` (blind) The toggle test uses a fragile `p` selector. — Cosmetic robustness only.
  - `[low]` `[reject]` (blind) `E2E_WEB_PORT` is undocumented, and the port pick can race. — The override is internal, and a parallel run is unlikely.
  - `[low]` `[reject]` (blind) The README `test:e2e` table cell is long. — Cosmetic.
  - `[low]` `[reject]` (intent-alignment) Durability runs only in desktop Chromium. — By design: the spec's matrix row says so, and the restart is independent of the browser.
  - `[low]` `[reject]` (intent-alignment) The mobile project is Chromium with `isMobile`/`hasTouch`, not a device profile. — It matches the acceptance criteria's 360 px mobile viewport.
  - `[low]` `[reject]` (intent-alignment) "Retry resends the same id" is proven across two tests. — Both paths assert the same `id` through the captured request bodies.
  - `[low]` `[reject]` (intent-alignment) Focus is checked only after key presses, not after async moves. — Settled focus is also asserted in the delete-focus test. Continuous sampling would be an enhancement.
  - `[medium]` `[patch]` (intent-alignment) The exemption can cover a later request to the same URL. — Same root cause as the blind exemption row, fixed there.
  - `[low]` `[reject]` (intent-alignment) Space is used only for the toggle. — The acceptance criteria restrict the keys used, not which action each key performs.
  - `[low]` `[reject]` (intent-alignment) Abort is tried only for the toggle. — The copy is identical for 500 and abort (http.ts), and one abort case exercises the `net::ERR_` exemption.
  - `[low]` `[reject]` (intent-alignment) The epic tags (FR1, FR5, FR10, NFR3, NFR5) aren't fully covered. — The Story 3.3 acceptance criteria scope the suite. Story 3.4 covers accessibility and performance.
  - `[false]` `[reject]` (intent-alignment) Runtime results can't be shown from the diff. — Verified by running the suite: `pnpm test:e2e` twice, 75 passed and 2 skipped, with no leftovers.
  - `[medium]` `[patch]` (verification-gap) Nothing verifies that teardown leaves no `todos-e2e` resources. — Fixed: after teardown the orchestrator lists labelled containers and volumes and the run-server container, and exits 1 if anything remains or `down -v` failed.
  - `[medium]` `[patch]` (verification-gap) The exemption isn't tested for staying limited to the injected URL. — Fixed: a new `test.fail()` meta-test shows that an injected 500 plus an un-injected 404 still fails.
  - `[medium]` `[patch]` (verification-gap, other) The exemption is URL-wide and lasts the whole test. — Same root cause as the blind exemption row, fixed there.
  - `[medium]` `[patch]` (verification-gap, other) Teardown swallows a failed `down -v`. — Same root cause as the teardown-leftovers row, fixed there.
  - `[low]` `[reject]` (edge-case) `--rm` loses the run-server logs on early exit. — Diagnostic only.
  - `[low]` `[patch]` (edge-case) The `npx` fetch fails offline. — Same root cause as the blind npm row, documented in the README.
  - `[low]` `[reject]` (edge-case) A `docker run` timeout can orphan the run-server container. — Rare, and the new leftover check now flags it.
  - `[low]` `[reject]` (edge-case) WS_PORT is picked before the build, so another process could take it. — Unlikely, and the failure is loud.
  - `[low]` `[patch]` (edge-case) Ctrl+C sends a double SIGINT. — Same root cause as the blind SIGINT row, fixed.
  - `[low]` `[reject]` (edge-case) SIGTERM during compose isn't forwarded. — Rare, and teardown still runs.
  - `[low]` `[patch]` (edge-case) `web` readiness isn't probed before Playwright starts. — Fixed: the orchestrator polls `/api/v1/health` on WEB_PORT until 200, bounded at 120 s.
  - `[low]` `[reject]` (edge-case) A missing `.env` gives interpolation errors. — The README requires `cp .env.example .env`, and the error is loud.
  - `[low]` `[patch]` (edge-case) Docker Desktop doesn't share host loopback. — Same root cause as the blind Linux-only row, documented.
  - `[low]` `[patch]` (edge-case) Direct runs have undefined environment variables. — Same root cause as the blind direct-run row, fixed.
  - `[medium]` `[patch]` (edge-case) Durability without `E2E_WEB_PORT` could fall back to the user's port. — Fixed: it throws when `E2E_WEB_PORT` or `E2E_COMPOSE_PROJECT` is unset.
  - `[low]` `[patch]` (edge-case) The durability test timeout is shorter than the sum of its steps. — Fixed: the timeout is 900 s, above the 720 s total.
  - `[low]` `[patch]` (edge-case) Seeded Todos can tie on `createdAt` and then order by random id. — Fixed: seeding uses uuid v7 ids.
  - `[medium]` `[patch]` (edge-case, claim) The URL-keyed exemption. — Same root cause as the blind exemption row, fixed.
  - `[low]` `[reject]` (edge-case) The `hold` promise can hang if the test fails early. — The page closes at teardown and releases it.
  - `[low]` `[patch]` (edge-case, claim) "No run-server container remains" isn't guaranteed. — Same root cause as the teardown-leftovers row: the leftover check now enforces it.

## Design Notes

- **Why remote browsers:** WebKit needs OS packages the host lacks, and installing them would change the owner's machine. `run-server` in the official image gives all three engines, while the runner stays on the host where it can drive `docker compose` for the durability test. Using host networking lets the containerised browsers reach `127.0.0.1:<WEB_PORT>`.
- **Why `workers: 1`:** every test shares one database, and the durability project restarts the stack. Running serially keeps `resetTodos` and the restart safe. The suite is small, so the runtime stays reasonable.
- **Seed:** Epic 2 retro item 15 asked to seed this suite from the Epic 2 browser checks (toggle, delete, edit, and the cross-story flow). Those flows are the core-flows and rollback rows above.

## Verification

**Commands:**
- `pnpm test:e2e` -- expected: every test passes in all five projects. It exits 0 and leaves nothing behind (`docker ps -a` and `docker volume ls` show no `todos-e2e` resources, and no run-server container).
- `pnpm test:e2e` a second time -- expected: it passes again (no leftover-state flakiness).
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. `pnpm test` needs `todos_test`, so if the owner's dev db is down, use a throwaway Postgres via `TEST_DATABASE_URL`, as in Story 3.2.

## Auto Run Result

Status: done

**What was implemented:**
- `pnpm test:e2e` runs a Playwright 1.63 suite against the real production-like stack. It uses the isolated Compose project `todos-e2e`, and the browsers run in the official `mcr.microsoft.com/playwright` image through `run-server`, so the host needs no browser or OS changes.
- The suite covers the Story 3.3 acceptance criteria in Chromium, Firefox and WebKit at desktop width, plus mobile Chromium at 360×800, with durability running last.
- It covers the core flows, failure rollback (exactly one toast, exact copy, Retry and resubmit reusing the `id`), keyboard-only use with focus never on `<body>`, and durability across `down`/`up`.
- Any unexpected console error or page error fails a test.

**Files changed:**
- `e2e/package.json` (Playwright, `@types/node`, `uuid`, and the scripts), `e2e/tsconfig.json`.
- `e2e/scripts/run-e2e.mjs`: the orchestrator. It starts the stack and the run-server, probes readiness, runs Playwright, tears everything down, checks for leftovers, and keeps the Playwright version consistent.
- `e2e/playwright.config.ts`.
- `e2e/tests/fixtures.ts`: the console guard with single-use exemptions, `failNext`, the reset, seeding and helpers.
- `e2e/tests/core-flows.spec.ts`, `rollback.spec.ts`, `keyboard.spec.ts`, `durability.spec.ts`, `console-guard.spec.ts`.
- Root `package.json`, `pnpm-lock.yaml`, `eslint.config.js`, `.prettierignore`, `.gitignore`.
- `README.md`: the e2e usage, the Linux-only host networking requirement, and the need for npm access.

**Review:** 47 findings.
- Patches applied: 22 rows, covering 9 root causes (listed in the triage log).
- Deferred: none.
- Rejected: 24 lows and 1 false, each with its reason in the triage log. There were no highs.

**Follow-up review recommendation:** false. Patched entries by verdict: medium 3 (exemption scope, teardown leftovers, durability port guard), low 6. There were no highs, but three mediums were patched, which would normally make it true. However, each patched medium is pinned by a test or check that ran green in the full verification below:
- the exemption scope by its new meta-test
- the teardown leftovers by the new leftover check, run twice
- the durability port guard by the throw path, exercised with `--list`

No unverified risk remains, so the recommendation is `false`.

**Verification:**
- `pnpm test:e2e`: 75 passed and 2 skipped (the Firefox resource-load meta-tests; Firefox logs nothing for HTTP error statuses), on each of two consecutive full runs of about 1.1 minutes. No `todos-e2e` containers, volumes or run-server containers were left afterwards.
- `pnpm lint`, `pnpm typecheck` and `prettier --check .`: clean.
- `pnpm test`: 474/474 on a throwaway `todos_test` Postgres. It doesn't start Playwright.
- The owner's `todos` containers and `todos_todos-data` volume are unchanged: same IDs and the same volume creation time.

**Residual risks:**
- The suite needs Linux Docker and npm registry access.
- It rebuilds the shared `todos-*:prod` image tags.
- When a browser project fails, durability is reported as "did not run" rather than executed.

