// Shared `.env` preflight for the Docker harnesses (scripts/stack-smoke.test.mjs,
// e2e/scripts/run-e2e.mjs). Without POSTGRES_USER, POSTGRES_PASSWORD and
// POSTGRES_DB (from `.env` or the environment), Compose would fail later with
// a less helpful interpolation error.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseEnv } from "node:util"

export const PREFLIGHT_MESSAGE =
  "POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB are not all set " +
  "(in .env or the environment): " +
  "copy .env.example to .env (cp .env.example .env) and run again."

const REQUIRED = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]

/**
 * Throws unless POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB are all set,
 * from `env` or from `root`/.env (the environment wins, as in Compose).
 * @param {string} root the repository root
 * @param {NodeJS.ProcessEnv} env usually `process.env`
 */
export function envPreflight(root, env) {
  const file = resolve(root, ".env")
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}
  /** @type {Record<string, string | undefined>} */
  const merged = { ...fromFile, ...env }
  if (REQUIRED.some((key) => !merged[key])) {
    throw new Error(PREFLIGHT_MESSAGE)
  }
}
