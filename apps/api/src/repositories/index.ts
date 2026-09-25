import type pg from "pg"

import { createDb } from "../db/client"
import {
  createHealthRepository,
  type HealthRepository,
} from "./health-repository"
import { createTodoRepository, type TodoRepository } from "./todo-repository"

export interface Repositories {
  health: HealthRepository
  todos: TodoRepository
}

/**
 * Builds the repositories over one Drizzle instance. ESLint restricts Drizzle
 * imports to `repositories/` and `db/` (AD-7); this file just wires the
 * repositories up.
 */
export function createRepositories(pool: pg.Pool): Repositories {
  const db = createDb(pool)
  return {
    health: createHealthRepository(db),
    todos: createTodoRepository(db),
  }
}
