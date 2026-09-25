---
title: 'Story 3.4: Finished-product, accessibility, and performance check'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'cb003a3ee665348e26f387775cadfbb815917a44'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing yet proves that Todos meets its finish, accessibility and speed targets:
- NFR-1: 100 ms per action, and interactive within 2 s with 1,000 Todos.
- NFR-2: API p95 of 300 ms or less, measured at the server.
- NFR-4: WCAG 2.1 AA.
- FR-12: 320 px width, 200% zoom, and 44×44 px touch targets.
- NFR-12: finish, meaning tab title, favicon, no placeholder text, no layout jumps, and matching the mockup.

**Approach:**
- Add a `quality` project to the Story 3.3 Playwright suite, running desktop Chromium against the same isolated `todos-e2e` stack. It covers:
  - axe scans in light and dark mode
  - responsive and touch-target checks
  - 1,000-Todo load timing and per-action timing
  - a 200-request API run with a server-side p95
  - layout-stability checks
- Do a recorded finish review against DESIGN.md and the mockup.
- Fix every gap found in this story, or log it as a follow-up with an owner.

## Boundaries & Constraints

**Always:**
- **Accessibility:** `@axe-core/playwright` `~4.13.0`, the latest version as of 2026-09-25, with tags `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa`.
  - Zero violations is reached only by fixing the app. Never disable axe rules, exclude elements, or lower the tag set to get there.
- **Targets are the PRD numbers, asserted by tests:**
  - Load: interactive in 2,000 ms or less.
  - Actions: the UI reflects each action within 100 ms, at p95 (SM-3).
  - API: the server-measured p95 is 300 ms or less.
  - Width: `scrollWidth <= clientWidth`.
  - Touch targets: the effective hit area is at least 44×44.
- **Measurement definitions:**
  - **Office broadband:** Chromium CDP `Network.emulateNetworkConditions`, with 20 ms latency, 50 Mbps down and 10 Mbps up.
  - **Interactive:** time from navigation start until the list shows all 1,000 rows and the Add input is enabled and focusable.
  - **Action latency:** measured in the page with `performance.now()`, from the triggering input event to the first animation frame after the DOM reflects the change. Covers add, toggle, edit-save and delete, with 20 samples each against 1,000 Todos.
  - **API p95:** taken from the API's own per-request log `responseTime` (AD-11) for exactly the 200 scripted requests, sent through nginx: list, create, patch and delete, mixed.
  - **Touch targets:** in a 320 px `hasTouch` context, each control's effective hit area is sampled with `document.elementFromPoint` over a 44×44 square centred on it. Every sample must hit the control or one of its descendants. This covers the input, Add, checkbox, Edit, Delete, Retry and Try again.
  - **200% zoom:** a 640×400 CSS px viewport with `deviceScaleFactor: 2`, which is equivalent to 1280 px at 200%.
- **"Placeholder text" (NFR-12)** means lorem ipsum, TODO or stub copy. The designed input placeholder "Add a todo…" is not placeholder text.
- **App fixes stay inside the architecture:**
  - Tokens and components follow DESIGN.md and the UX spine.
  - Where the mockup and the spine disagree, the spine wins.
  - All existing unit tests and e2e specs still pass.
- **Isolation:** everything runs through `pnpm test:e2e` on the isolated `todos-e2e` project, and the user's `todos` project is never touched.

**Never:**
- Don't add a Lighthouse or CI performance pipeline, real-device testing, or the SM-1 hallway test. SM-1 is human-run; this story only makes the product ready for it.
- Don't add new product features or change the copy strings. If a copy string causes a gap, log it; don't change it.
- Don't lower any PRD target, or make a measurement pass by excluding the slow path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Axe: Empty | light and dark | 0 violations | — |
| Axe: Populated | Active and Completed Todos, light and dark | 0 violations | — |
| Axe: Load error | list GET fulfilled 500, light and dark | 0 violations | injected |
| Axe: Inline edit | one row in edit mode, light and dark | 0 violations | — |
| 320 px width | every List State plus a 500-character Description with no spaces | no horizontal scroll, and the long Description wraps | — |
| 200% zoom | 640 px at `deviceScaleFactor: 2`, every action | no horizontal scroll, and every action works | — |
| Touch targets | 320 px `hasTouch`, every control listed in Always | an effective 44×44 hit area for each | — |
| Interactive | 1,000 seeded Todos, office-broadband throttling | interactive in 2,000 ms or less | — |
| Action latency | 1,000 Todos; 20 each of add, toggle, edit-save and delete | p95 of 100 ms or less per action kind | — |
| API p95 | 200 mixed requests through nginx | server `responseTime` p95 of 300 ms or less | — |
| No layout jump | add, complete and remove, including removing the last Todo (→ Empty) | the header and Add row keep their positions, a toggled row keeps its height, and there's no horizontal shift | — |
| Finish | every List State | `<title>Todos</title>`, the favicon link resolves (200, SVG), the header "Todos", and no placeholder text | — |

</intent-contract>

## Code Map

- `e2e/playwright.config.ts` -- the projects are chromium, firefox, webkit, mobile-chromium, and durability, which runs last with dependencies. Add a `quality` project (desktop Chromium, `testMatch: quality/**`), and make the other projects ignore `quality/**`. `workers: 1` and `reducedMotion: "reduce"` are set globally. The timing tests may override `reducedMotion` locally only if needed; say so in a comment.
- `e2e/tests/fixtures.ts` -- the `test` export has an auto console guard, `failNext` (one-shot injection whose exemption is used up once), `resetTodos` in `beforeEach`, uuid v7 seeding, and helpers such as `addTodo`, `row` and `toasts`. Reuse all of them. Add a bulk `seedTodos(n)` that seeds through the API (it may run requests concurrently in small batches).
- `e2e/scripts/run-e2e.mjs` -- the orchestrator. It exports `E2E_BASE_URL`, `E2E_WS_ENDPOINT`, `E2E_COMPOSE_PROJECT` and `E2E_WEB_PORT`. The API log is read with `docker compose -p $E2E_COMPOSE_PROJECT -f compose.yaml logs --no-log-prefix api`, the pattern used in `scripts/stack-smoke.test.mjs` (`apiLogLines`).
- **App UI, where fixes happen if a check fails:**
  - `apps/web/src/features/todos/todo-row.tsx`: the row uses `min-h-touch-target`, and the checkbox wrapper is `size-touch-target` with an `after:-inset-3.5` hit extender. Edit and Delete are `size-touch-target`.
  - `add-row.tsx`: the input and Add button use `h-(--spacing-touch-target)`.
  - `list-states.tsx`: the Empty and Load error states.
  - `components/ui/*`, `lib/toast.tsx` (Sonner), `src/index.css` (the UX-DR1 tokens, light and dark).
  - `index.html`: `<title>Todos</title>` and `/favicon.svg` (`apps/web/public/favicon.svg`).
- `_bmad-output/planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/DESIGN.md`, `EXPERIENCE.md`, `mockups/todo-list.html` -- the finish reference. The spine wins over the mockup.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- where follow-ups go, as `source_spec` / `summary` / `evidence` plus an owner field.
- `README.md` -- its e2e section lists the projects. Mention `quality`.

## Tasks & Acceptance

**Execution:**
- `e2e/package.json` -- add `@axe-core/playwright` `~4.13.0` as a devDependency, then run `pnpm install`.
- `e2e/playwright.config.ts` -- add the `quality` project and exclude `quality/**` from the other projects.
- `e2e/tests/fixtures.ts` -- add `seedTodos(n)`, and helpers for `axe` (with the fixed tag set) and API p95 log reading. Keep every existing helper's behaviour.
- `e2e/tests/quality/a11y.spec.ts` (new) -- the four axe rows. Use `page.emulateMedia({ colorScheme })` for light and dark. On failure, attach the violations.
- `e2e/tests/quality/responsive.spec.ts` (new) -- the 320 px, 200% zoom and touch-target rows.
- `e2e/tests/quality/performance.spec.ts` (new) -- the Interactive, Action latency and API p95 rows. Report each measured value as a test annotation, so the numbers appear in the report.
- `e2e/tests/quality/finish.spec.ts` (new) -- the No layout jump and Finish rows.
- **App files, only as needed** -- fix every failing check at its root:
  - tokens and colours in `src/index.css` for contrast
  - hit areas in `todo-row.tsx`, `add-row.tsx` and `list-states.tsx`
  - wrapping, with `break-words`/`overflow-wrap:anywhere` on the Description
  - landmark and ARIA fixes

  Add or extend a unit test for each changed behaviour where one applies.
- `docs/finish-review.md` (new) -- the recorded finish review:
  - Screenshot each List State (Empty, Loading, Populated with Completed, Load error, Inline edit, and a toast) in light and dark at 1280 px and 360 px. Compare each against `mockups/todo-list.html`, rendered the same way.
  - Record the checklist: tab title, favicon, header, consistent design, no placeholder text, no layout jumps, and no console errors.
  - Keep a table of every gap, each marked either fixed (naming the change) or logged (naming the follow-up and owner). Screenshots stay out of git; describe them.
  - List the measured numbers: interactive time, action p95 per kind, and API p95.
  - End with a one-line SM-1 readiness statement.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add one entry per logged gap, each with an owner.
- `README.md` -- add the `quality` project to the e2e section: what it checks, and `pnpm test:e2e -- --project=quality` to run it alone.

**Acceptance Criteria:**
- Given Docker and the repo, when I run `pnpm test:e2e`, then every I/O-matrix row passes in the `quality` project, and every existing project still passes.
- Given the measured values, when I read the test report annotations and `docs/finish-review.md`, then they show interactive ≤ 2,000 ms, action p95 ≤ 100 ms per kind, and API p95 ≤ 300 ms.
- Given the finish review, when I read `docs/finish-review.md`, then every gap between the app and DESIGN.md or the mockup is either fixed in this story or logged in `deferred-work.md` with an owner.
- Given the repo, when I run `pnpm lint`, `pnpm typecheck` and `pnpm test`, then they all pass.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 40 findings — high 0, medium 6, low 33, false 1, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Axe never scans Loading, an open toast, or a focused row. — Fixed: Loading and the Retry toast are now scanned in light and dark. The focused-row variant only swaps the Created At text, so it's rejected as low.
  - `[low]` `[reject]` (blind) `axeViolations` ignores `incomplete`. — The acceptance criteria and the contract are about violations. Failing on `incomplete` would count the checks axe couldn't finish, which isn't a defect.
  - `[low]` `[reject]` (blind) There's no Loading→Populated layout-jump check. — Not in the acceptance criteria (NFR-12 lists add, complete and remove). The skeleton row shape was aligned in G-4.
  - `[low]` `[reject]` (blind) The layout-jump test watches only the header, the Add row and the toggled row, and runs under reduced motion. — It matches the matrix row. The animated collapse is designed motion, not a jump.
  - `[medium]` `[patch]` (blind) Action latency is measured only under reduced motion. — Fixed: it's also measured with `reducedMotion: "no-preference"`, with delete counted at the exit start. Default-motion p95 is 41–56 ms over two full runs.
  - `[medium]` `[patch]` (blind) "Interactive" doesn't wait for the main thread, and `tabIndex >= 0` is always true. — Fixed: interactive is now the later of the ready frame and the end of the last `longtask` before a 500 ms quiet window. It measured 1,087.5 and 1,088.0 ms.
  - `[low]` `[patch]` (blind) The tailwind-merge drop was patched locally, not at the source. — Fixed: `cn` in `lib/utils.ts` now uses `createCn` with the custom font-size tokens registered, and a unit test covers it. The shadcn primitives still import the raw `cn`, but none of them use the custom sizes.
  - `[low]` `[patch]` (blind) The unit tests don't assert `after:content-['']`, or the Retry `outline-solid!`. — Fixed: both are added to the asserted class lists.
  - `[low]` `[reject]` (blind) G-6 and G-8 have no unit test. — Visual geometry. It's covered by the e2e quality checks and the recorded review.
  - `[low]` `[patch]` (blind) The placeholder check misses rendering leaks. — Fixed: `undefined`, `null`, `NaN`, `Invalid Date` and `[object Object]` were added.
  - `[low]` `[patch]` (blind) `finish-review.md` gives the Playwright version as the browser version, and names a moving branch. — Fixed: it records Chromium 153.0.8010.12 and the baseline commit plus "uncommitted changes".
  - `[low]` `[reject]` (blind) Test helpers are duplicated across the quality specs. — Style only. `holdListLoad` and `showRetryToast` were moved to fixtures anyway.
  - `[low]` `[reject]` (blind) `apiLogLines` re-reads the whole log. — Efficiency only, bounded by a 30 s poll.
  - `[low]` `[reject]` (blind) With tracing off, a failing perf test leaves no evidence. — The per-sample annotations remain. Tracing distorts the timings, as the recorded CPU profile shows.
  - `[low]` `[reject]` (blind) The README table cell is large. — Cosmetic.
  - `[medium]` `[patch]` (verification-gap) Nothing tests the edit field sitting on top of the checkbox extender. — Fixed at the root: the overlap is removed (a 16 px checkbox column margin), so the checkbox keeps a 44×44 hit area while editing. A new e2e test samples it with the edit open and checks that a tap on the field's padding stays in the field. The `relative` workaround is removed.
  - `[low]` `[reject]` (intent-alignment) The acceptance criteria say "each action", but the test asserts p95. — The contract and SM-3 define p95 of 20 samples. All samples are annotated.
  - `[low]` `[reject]` (intent-alignment) Only the load is throttled. — Actions are optimistic, so the network isn't on the measured path.
  - `[medium]` `[patch]` (intent-alignment) The numbers are only valid under reduced motion and without tracing. — Same root cause as the blind reduced-motion finding: default motion is now measured. Tracing stays off, with the reason recorded.
  - `[low]` `[reject]` (intent-alignment) The API p95 lives inside a Playwright test, not a standalone script. — It's still a scripted run that reports p95, measured at the server as NFR-2 requires.
  - `[low]` `[reject]` (intent-alignment) 200% zoom is emulated, and touch targets aren't checked at zoom. — DPR-2 emulation is the contract's definition. Touch targets apply on touch devices (FR-12).
  - `[low]` `[patch]` (intent-alignment) At 320 px the test doesn't use every action. — Fixed: the 320 px suite now runs the full action flow, checking for horizontal scroll after each action.
  - `[medium]` `[patch]` (intent-alignment) G-14 (a 34×44 checkbox while editing) was logged rather than fixed, but the touch-target acceptance criterion has no "log it" option. — Same root cause as the verification-gap overlap finding: fixed, and G-14 marked fixed with its deferred entry removed. The Description now starts 16 px further right than the mockup (the spine wins).
  - `[low]` `[patch]` (intent-alignment) Axe doesn't cover Loading or the toast. — Same root cause as the blind axe-coverage finding, fixed.
  - `[low]` `[reject]` (intent-alignment) "Visuals match the mockup" has no automated check, and the screenshots aren't committed. — By the nature of the acceptance criteria, this is a recorded human-style review. The screenshots are described in the doc.
  - `[low]` `[reject]` (intent-alignment) The unit tests assert class names. — The behaviour is asserted by the e2e quality specs, and the class tests guard against regressions.
  - `[low]` `[reject]` (intent-alignment) `deleteAllTodos` became batched. — The end state is identical, and every spec passes.
  - `[low]` `[reject]` (intent-alignment) The mockup-driven restyle (G-5 to G-8) may be outside a "verify" story. — The finish-review acceptance criterion says gaps are "fixed in this story", and the spine wins where they conflict.
  - `[false]` `[reject]` (intent-alignment) `sprint-status.yaml` isn't updated. — It's updated at merge time, by project convention.
  - `[low]` `[reject]` (edge-case) A quality failure skips durability. — Carried from Story 3.3: the run still fails overall, so it's never a false green.
  - `[low]` `[patch]` (edge-case) The Loading and toast states aren't axe-scanned. — Same root cause as the blind axe-coverage finding, fixed.
  - `[low]` `[reject]` (edge-case) `seededIds` has no length guard. — The mismatch still fails loudly at the end.
  - `[low]` `[reject]` (edge-case) Other requests in the time window would break the 200-line match. — Lines are matched by the scripted routes, and the exact-200 check passed on every run.
  - `[low]` `[patch]` (edge-case) The desktop `hasTouch` context keeps the hover layout. — Fixed: `isMobile: true`, and the row actions are asserted at opacity 1 before sampling.
  - `[medium]` `[patch]` (edge-case) The checkbox is sampled only at rest, so G-14 has no automated check. — Same root cause as the verification-gap overlap finding, fixed and sampled while editing.
  - `[low]` `[patch]` (edge-case) The sonner test omits `after:content-['']`. — Same root cause as the blind class-assertion finding, fixed.
  - `[low]` `[patch]` (edge-case) The todo-row test omits `after:content-['']`. — Same root cause as the blind class-assertion finding, fixed.
  - `[low]` `[patch]` (edge-case) The held Loading GET isn't released if the check throws. — Fixed with `try`/`finally` release and unroute.
  - `[low]` `[reject]` (edge-case) `percentile` with NaN input. — The inputs are measured numbers.
  - `[low]` `[patch]` (edge-case, claim) G-10 claims Created At lost its size, which the previous code didn't do. — Same root cause as the blind tailwind-merge finding: G-10 now says only the Completed Description was broken.

## Design Notes

- **Why only Chromium for quality:** CDP network throttling is Chromium-only, and axe results don't depend on the browser engine. The other engines already run the full functional suite.
- **Effective hit area:** measuring with `elementFromPoint` over a 44×44 square checks what a finger actually hits. That includes the checkbox's `::after` hit extender, which a bounding-box check would wrongly fail.
- **Timing noise:** the measurements run in-page against a local stack. If a check is flaky across two consecutive runs, it's a real finding. Investigate and fix the cause, or log it. Never widen the threshold.

## Verification

**Commands:**
- `pnpm test:e2e` -- expected: every project passes, including `quality`, on two consecutive runs, with no leftovers.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. Use a throwaway `TEST_DATABASE_URL` Postgres if the owner's dev db is down.

**Manual checks:**
- Check that the numbers and gap table in `docs/finish-review.md` match the latest run's annotations.

## Auto Run Result

Status: done

**What was implemented:**
- A `quality` Playwright project (desktop Chromium, on the isolated `todos-e2e` stack) that proves the Story 3.4 targets:
  - zero axe WCAG 2.1 AA violations in Empty, Populated, Load error, Inline edit, Loading and toast, in light and dark
  - no horizontal scroll at 320 px or at 200% zoom across every action
  - 44×44 effective touch targets, including while editing
  - interactive within 2 s with 1,000 Todos on office broadband
  - action p95 ≤ 100 ms under both reduced and default motion
  - server-side API p95 ≤ 300 ms over 200 requests
  - no layout jumps, and the finish checks
- App fixes for every failing check, plus the mockup and DESIGN.md gaps.
- A recorded finish review in `docs/finish-review.md`.

**Files changed:**
- **App:**
  - `apps/web/src/features/todos/todo-row.tsx`: hit extenders, grid row with Created At spanning, a 16 px checkbox column margin, and mockup alignment.
  - `edit-field.tsx`: the bordered Textarea, no longer overlapping the checkbox.
  - `list-states.tsx`: skeleton checkbox and 14 px body text.
  - `created-at.tsx`, `components/ui/sonner.tsx`: the Retry hit area and focus ring.
  - `lib/utils.ts`: `cn` registers the custom font sizes.
  - Unit tests in `todo-row.test.tsx`, `todo-list.test.tsx`, `sonner.test.tsx` and `lib/utils.test.ts`.
- **E2E:**
  - `e2e/package.json` (`@axe-core/playwright ~4.13.0`), `playwright.config.ts` (the `quality` project), `tests/fixtures.ts` (`seedTodos`, axe, log and percentile helpers, `holdListLoad`, `showRetryToast`).
  - `tests/quality/{a11y,responsive,performance,finish}.spec.ts`.
- **Docs:** `docs/finish-review.md`, `README.md`, and `deferred-work.md` (2 logged gaps with owners).

**Review:** 40 findings.
- Patched: 21 rows across 11 root causes. Mediums: default-motion latency, the long-task definition of interactive, and the edit-field/checkbox overlap.
- Deferred: none.
- Rejected: 18 lows and 1 false, each with its reason in the triage log.

**Follow-up review recommendation:** true. This first pass patched three medium entries. The specific unverified risk: the row-geometry and edit-field changes (G-5, G-6, and the G-14 fix, which moves the Description 16 px right of the mockup) change visible layout. They were verified only by automated geometry checks and agent screenshots, never by a human visual review against `mockups/todo-list.html` on a real phone and desktop.

**Verification:**
- `pnpm test:e2e`: two consecutive full runs, each 99 passed and 2 skipped (the Firefox resource-load meta-tests), with no leftovers. The measured numbers:
  - Interactive: 1,087.5 and 1,088.0 ms.
  - Action p95: 35–56 ms (reduced motion and default motion).
  - API p95: 10.8 and 9.2 ms.
- `docs/finish-review.md` was refreshed from these two runs.
- `pnpm lint`, `pnpm typecheck` and `prettier --check .`: clean.
- `pnpm test`: 479/479 on a throwaway `todos_test` Postgres.
- The owner's `todos` containers were untouched.

**Residual risks:**
- The visual layout needs a human look.
- Timing numbers come from headless Chromium in a container on a busy host.
- The shadcn `components/ui` primitives still use the raw `cn`.
- The Geist font and the list shift while editing are logged in `deferred-work.md`.
- SM-1 (the hallway test) remains human-run.

