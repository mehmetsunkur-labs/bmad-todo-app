import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import pg from "pg"
import type { Logger } from "pino"

import * as schema from "./schema"

export type Db = NodePgDatabase<typeof schema>

export interface PoolOptions {
  connectionTimeoutMillis?: number
  queryTimeoutMillis?: number
}

/**
 * Creates the pg pool. The `error` listener keeps an idle-client failure (for
 * example the database restarting) from crashing the process (AD-7).
 */
export function createPool(
  connectionString: string,
  logger: Logger,
  options: PoolOptions = {}
): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    // A DB that accepts TCP but never answers must fail (→ 503), not hang.
    query_timeout: options.queryTimeoutMillis ?? 5_000,
  })
  pool.on("error", (err) => {
    logger.error({ err }, "pg pool error")
  })
  return pool
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema })
}
