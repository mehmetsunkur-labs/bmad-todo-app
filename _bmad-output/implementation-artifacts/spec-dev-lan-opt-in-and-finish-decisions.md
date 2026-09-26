---
title: 'Dev web on loopback by default, with LAN as an opt-in; record the G-12 and G-13 decisions'
type: 'bugfix'
created: '2026-09-26'
status: 'done'
baseline_commit: 'f1bc8fb12461c796368b7e87b94cc0eddbbc8bd8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-26.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
- **Dev on every interface:** AD-10 says the dev stack never publishes on all interfaces, but the dev `web` service inherits `compose.yaml`'s `"${WEB_PORT:-8080}:8080"`. The Vite dev server (source, HMR, and dev data through the proxy) is therefore reachable from the whole LAN.
- **Personal host in config:** LAN testing by host name needs Vite's `allowedHosts`, and so far that was a personal hostname hard-coded in `vite.config.ts`.
- **Undecided gaps:** G-12 (font) and G-13 (the edit row grows by the reserved counter line) are still logged as open decisions.

**Approach:**
- The dev `web` port binds `127.0.0.1` by default. LAN exposure is an opt-in: `DEV_WEB_HOST=0.0.0.0` in `.env`.
- Extra Vite host names come from `DEV_ALLOWED_HOSTS` in `.env`.
- Record the owner's decisions: keep Geist (G-12), and keep the always-reserved counter line with its one-time growth when editing starts (G-13).

**Decisions (human, 2026-09-26):**
- **G-12:** Geist Variable is the final font. The mockup's system UI stack is superseded.
- **G-13:** the edit field's counter line stays always reserved. The row grows about 22 px when editing starts, and that is intended: reserving the line up front avoids a layout jump at 450 characters (NFR-12).
- **Local edit:** the owner's uncommitted `allowedHosts` edit was discarded. The owner's own `.env` gets `DEV_WEB_HOST=0.0.0.0` and `DEV_ALLOWED_HOSTS=romed.sunkur.net` after merge. `.env` is never committed.

## Boundaries & Constraints

**Always:**
- The production-like stack (`docker compose -f compose.yaml …`) still publishes `web` on all interfaces. Phones use that path.
- The dev defaults are loopback-only, as AD-10 requires, and the inspector and db stay on `127.0.0.1` as now.
- Every new `.env.example` key is explained in the README settings table.
- Existing suites stay green: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:stack` and `pnpm test:e2e`.
- Harnesses never touch the owner's `todos` project.

**Never:**
- Don't put a personal host name in any committed file.
- Don't change app code under `apps/*/src` or `packages/shared/src`.
- Don't set Vite's `allowedHosts` to `true`, which would disable its DNS-rebinding guard.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev default | plain `docker compose config`, no `DEV_WEB_HOST` | `web` publishes `127.0.0.1:${WEB_PORT}:8080` only (host_ip 127.0.0.1) | — |
| Dev LAN opt-in | `DEV_WEB_HOST=0.0.0.0` | `web` publishes on all interfaces | — |
| Prod unchanged | `docker compose -f compose.yaml config` | `web` publishes on all interfaces (no host_ip), as today | — |
| Extra Vite hosts | `DEV_ALLOWED_HOSTS=a.example,b.example` passed to the dev `web` container | Vite accepts those `Host` headers; other host names are still rejected | — |
| No extra hosts | `DEV_ALLOWED_HOSTS` unset or empty | Vite's defaults (localhost and IPs only) | — |

</frozen-after-approval>

## Code Map

- `compose.override.yaml` -- dev `web`:
  - Has no `ports:` of its own, so it inherits the base `"${WEB_PORT:-8080}:8080"` (lists merge, so the override needs `ports: !override [...]`).
  - `environment:` holds only `API_PROXY_TARGET`.
  - Vite runs `--host 0.0.0.0` inside the container. That is container-internal and stays.
- `compose.yaml:63-64` -- base `web` `ports: - "${WEB_PORT:-8080}:8080"`. Unchanged.
- `apps/web/vite.config.ts:17-22` -- the `server` block with `proxy`. Add `allowedHosts` parsed from `process.env.DEV_ALLOWED_HOSTS` (comma-separated, trimmed, empties dropped; omit the key when the list is empty).
- `.env.example` -- the keys and their comment style. Add `DEV_WEB_HOST` (default comment `127.0.0.1`) and `DEV_ALLOWED_HOSTS` (empty).
- `README.md`:
  - The dev stack section ("Run the dev stack", URL table ~:45).
  - The settings table (every `.env.example` key, ~:110-125).
  - The prerequisites line :22 ("Compose v2 plugin or later"). `!override` needs Compose 2.24.4 or later, so plain `docker compose up` now needs it too.
- `scripts/stack-smoke.test.mjs`:
  - The dev suite (`DEV_FILES`, `devEnv` :775; it already requests `http://127.0.0.1:${devPort}` at :797, so loopback binding keeps it working).
  - The config tests (:258-266 defaults, :817 dev config). Add the dev port-binding assertions there.
- `scripts/compose.smoke-dev.yaml` -- resets the `api` and `db` ports only. Leave `web` to the override.
- `_bmad-output/planning-artifacts/architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md` -- AD-10 ~:182 ("dev never publishes on all interfaces"). Add the `DEV_WEB_HOST` opt-in.
- **G-12 and G-13 records:**
  - `_bmad-output/implementation-artifacts/deferred-work.md:9-16`: the two entries (font, edit growth). Add a `resolution:` line to each.
  - `docs/finish-review.md:82-83` (gap rows, "Logged…") and :96 (SM-1 readiness mentions them as open).
  - `_bmad-output/planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/DESIGN.md:23` and :144 (the font called an "open decision"), and :185 (the edit field counter).

## Tasks & Acceptance

**Execution:**
- [x] `compose.override.yaml` -- dev `web`: add `ports: !override ["${DEV_WEB_HOST:-127.0.0.1}:${WEB_PORT:-8080}:8080"]` and `environment: DEV_ALLOWED_HOSTS: ${DEV_ALLOWED_HOSTS:-}`. Add a short comment. -- AD-10 loopback default.
- [x] `apps/web/vite.config.ts` -- `server.allowedHosts` from `DEV_ALLOWED_HOSTS` as described in the Code Map. -- LAN host names without committing them.
- [x] `.env.example`, `README.md` -- document both keys, the opt-in for phone testing on dev (the production-like stack remains the normal LAN path), and Compose ≥ 2.24.4 in the prerequisites. -- README accuracy.
- [x] `scripts/stack-smoke.test.mjs` -- config tests for each matrix row except the Vite `Host` checks:
  - dev default is host_ip `127.0.0.1`
  - `DEV_WEB_HOST=0.0.0.0` publishes on all interfaces
  - prod is unchanged
  - `DEV_ALLOWED_HOSTS` reaches the dev `web` container's environment

  -- proof of the bindings.
- [x] `apps/web` -- a unit test for the host-list parsing. Extract a tiny pure helper if needed, for example `parseAllowedHosts(value)` in a small module imported by `vite.config.ts`, covering unset, empty, a single host, and a comma list with spaces. Also add a dev-suite check in `test:stack`: with `DEV_ALLOWED_HOSTS=smoke.example`, a request with `Host: smoke.example` gets 200, and `Host: other.example` gets 403 from Vite. -- the Vite rows.
- [x] `ARCHITECTURE-SPINE.md` AD-10 -- state the loopback default and the `DEV_WEB_HOST` opt-in. -- spine accuracy.
- [x] `deferred-work.md`, `docs/finish-review.md`, `DESIGN.md` -- record the G-12 and G-13 decisions: resolution lines, gap rows marked "Decided (2026-09-26): …", the SM-1 line no longer calling them open, and DESIGN.md naming Geist as final and the reserved counter as intended. -- close the gaps.

**Acceptance Criteria:**
- Given a fresh `.env` from `.env.example`, when I run `docker compose up`, then the dev app is reachable at `http://localhost:${WEB_PORT}` and not from another machine on the LAN.
- Given `DEV_WEB_HOST=0.0.0.0` and `DEV_ALLOWED_HOSTS=<my host>` in `.env`, when I run `docker compose up`, then the dev app opens from my phone at `http://<my host>:${WEB_PORT}`.
- Given the repo, when I run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:stack` and `pnpm test:e2e`, then all pass, and the owner's `todos` images, containers and volumes are unchanged.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 21, false 1, maybe-false 0
- `[false]` `[reject]` (blind) The spec recording the decisions isn't in the diff. — This build's own spec was left out of the review diff on purpose, and it is committed with the change.
- `[low]` `[patch]` (blind) `DEV_ALLOWED_HOSTS` only works through Compose, and the docs don't say so. — Fixed: `.env.example` and the README say it applies to the dev stack in Compose, and to export it in the shell for a host-run Vite.
- `[low]` `[patch]` (blind) The IP-literal Host path (open the dev stack by LAN IP) is untested. — Fixed: the dev Vite check also sends `Host: 192.0.2.10:<port>` and expects 200.
- `[low]` `[reject]` (blind) The LAN opt-in isn't exercised at runtime. — The config test pins the binding in all three modes, and a runtime LAN probe from the same host proves nothing extra.
- `[low]` `[reject]` (blind) HMR and `/api` under an allowed name are unchecked. — The same Vite host check guards the websocket upgrade. An enhancement, not a defect.
- `[low]` `[reject]` (blind) `.env.example` style is inconsistent: one key commented out, one active and empty. — Cosmetic, and both forms work as documented.
- `[low]` `[reject]` (blind) An unsafe or typo `DEV_WEB_HOST` isn't validated. — It's the owner's own `.env`, and Docker's port-binding error is loud.
- `[low]` `[patch]` (blind) The dev port no longer answers on IPv6 `::1`. — Fixed: the README notes the default bind is IPv4-only and says to use `http://127.0.0.1:${WEB_PORT}` if `localhost` resolves to `::1`.
- `[low]` `[reject]` (blind) The Compose 2.24.4 floor is only documented, not enforced. — Old Compose fails loudly at config parsing, and the README and AD-10 both state the floor.
- `[low]` `[reject]` (blind) No test pins the G-13 decision (22 px growth, no jump at 450). — This is a decision record. Adding a layout test is outside this change's intent.
- `[low]` `[patch]` (blind) EXPERIENCE.md doesn't state G-13. — Fixed: the Inline edit field row now states the always-reserved counter line and the one-time growth (G-13, 2026-09-26).
- `[low]` `[patch]` (blind) The finish review's "Pass" sits next to a G-13 description that still says rows move. — Fixed: both rows state the decision. Add, complete and remove don't shift; opening an edit grows the row once by design; the counter causes no later jump.
- `[low]` `[reject]` (blind) The mockup CSS still renders the system font. — The mockup legend already says DESIGN.md supersedes it (G-12 decided).
- `[low]` `[reject]` (blind) Resolved deferred items stay in the open list. — This follows the file's existing convention: earlier entries carry a `resolution:` line in place.
- `[low]` `[reject]` (edge-case) An IPv6 `DEV_WEB_HOST` needs brackets. — An unusual value in the owner's own `.env`, and it fails loudly.
- `[low]` `[patch]` (edge-case) The opt-in is IPv4-only. — Same root cause as the blind IPv6 row: documented in the same README note.
- `[low]` `[patch]` (edge-case) `localhost` resolving to `::1` gets connection refused. — Same root cause as the blind IPv6 row, fixed there.
- `[low]` `[patch]` (edge-case) An uppercase host name would never match. — Fixed: `parseAllowedHosts` lowercases each entry, with a test case.
- `[low]` `[reject]` (edge-case) An entry with a port or scheme never matches. — The docs say host names, and the result is a loud 403.
- `[low]` `[reject]` (edge-case) A leading-dot entry is a subdomain wildcard. — That is Vite's documented behaviour, used on purpose by whoever sets it.
- `[low]` `[reject]` (edge-case) A `COMPOSE_FILE` in the environment would change which files the config test reads. — Unlikely in this repo. The harness sets its files explicitly for its own projects.
- `[low]` `[reject]` (edge-case, claim) Docker Engine < 28 `route_localnet` lets L2 neighbours reach 127.0.0.1-published ports. — This host runs Docker 29, and the risk is an engine bug outside this repo's control.

## Verification

**Commands:**
- `docker compose config --format json` with and without `DEV_WEB_HOST=0.0.0.0`, and `docker compose -f compose.yaml config --format json` -- expected: dev `host_ip` is `127.0.0.1`, becomes all interfaces with the opt-in, and prod is unchanged.
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: all pass. Use a throwaway `TEST_DATABASE_URL` Postgres and stop it with `docker rm -f -v` so its volume is removed.
- `pnpm test:stack` and `pnpm test:e2e` -- expected: all pass. The owner's `todos-*:prod`/`:dev` image IDs, containers and volumes are identical before and after.
