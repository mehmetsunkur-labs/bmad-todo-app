import type pg from "pg"

import { createDb } from "../db/client"
import {
  createHealthRepository,
  type HealthRepository,
} from "./health-repository"

export interface Repositories {
  health: HealthRepository
}

/** The only place outside `db/` that touches Drizzle (AD-7). */
export function createRepositories(pool: pg.Pool): Repositories {
  const db = createDb(pool)
  return {
    health: createHealthRepository(db),
  }
}
