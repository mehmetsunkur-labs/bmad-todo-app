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

// Also set on this process, so the global setup (which runs here, not in a
// test worker) sees the same database as the tests.
process.env.TEST_DATABASE_URL = testDatabaseUrl()

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Every file shares the one `todos_test` database, and todos.test.ts
    // truncates it, so files run one at a time.
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
