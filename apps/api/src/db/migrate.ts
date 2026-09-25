import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import type pg from "pg"
import type { Logger } from "pino"

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url)
)

/**
 * Applies pending drizzle-kit migrations before the API listens (AD-7).
 * A no-op while no migration has been generated yet (no journal).
 */
export async function runMigrations(
  pool: pg.Pool,
  logger: Logger,
  migrationsFolder: string = MIGRATIONS_FOLDER
): Promise<void> {
  if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
    logger.info({ migrationsFolder }, "no migrations to apply")
    return
  }
  await migrate(drizzle(pool), { migrationsFolder })
  logger.info("migrations applied")
}
