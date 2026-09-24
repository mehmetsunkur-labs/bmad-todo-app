import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

// Tests run against the dev db's `todos_test` database (created by
// docker/db-init). TEST_DATABASE_URL wins; otherwise DATABASE_URL from the
// environment or the root .env is reused with its database swapped.
const rootEnv = resolve(import.meta.dirname, "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  const url = new URL(
    process.env.DATABASE_URL ?? "postgres://todos:todos@localhost:5432/todos"
  )
  url.pathname = "/todos_test"
  return url.toString()
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      TEST_DATABASE_URL: testDatabaseUrl(),
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
