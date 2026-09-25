import { sql } from "drizzle-orm"

import type { RequestContext } from "../context"
import type { Db } from "../db/client"

export interface HealthRepository {
  /** Resolves when the database answers `SELECT 1`; rejects otherwise. */
  ping(ctx: RequestContext): Promise<void>
}

export function createHealthRepository(db: Db): HealthRepository {
  return {
    async ping(_ctx) {
      await db.execute(sql`select 1`)
    },
  }
}
