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

/** The only place outside `db/` that touches Drizzle (AD-7). */
export function createRepositories(pool: pg.Pool): Repositories {
  const db = createDb(pool)
  return {
    health: createHealthRepository(db),
    todos: createTodoRepository(db),
  }
}
