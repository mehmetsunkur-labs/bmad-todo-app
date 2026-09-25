// The stack smoke test's web port choice (scripts/stack-smoke.test.mjs).

/**
 * SMOKE_WEB_PORT if set, otherwise `freePort`. WEB_PORT is deliberately
 * ignored: the owner's own stack usually holds it.
 * @param {NodeJS.ProcessEnv} env usually `process.env`
 * @param {number} freePort a free port found by the caller
 * @returns {string}
 */
export function pickSmokePort(env, freePort) {
  return env.SMOKE_WEB_PORT || String(freePort)
}
