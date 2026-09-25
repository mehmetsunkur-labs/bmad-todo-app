import { migrateTestDatabase } from "./helpers"

/** Migrates `todos_test` once per `vitest run`, before any test file. */
export default async function setup(): Promise<void> {
  await migrateTestDatabase()
}
