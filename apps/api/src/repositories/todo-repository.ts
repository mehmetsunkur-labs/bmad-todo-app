import type { Todo } from "@todos/shared"
import { desc, eq } from "drizzle-orm"

import type { RequestContext } from "../context"
import type { Db } from "../db/client"
import { todos, type TodoRow } from "../db/schema"

export interface TodoRepository {
  /** Every Todo, newest first: `created_at desc, id desc` (`compareTodos`). */
  list(ctx: RequestContext): Promise<Todo[]>
  /**
   * `INSERT … ON CONFLICT (id) DO NOTHING` (AD-4). Sets only `id` and
   * `description`, so the database clock sets the timestamps (AD-3). Returns
   * the new Todo, or `null` when a row with that `id` already exists.
   */
  create(
    ctx: RequestContext,
    input: { id: string; description: string }
  ): Promise<Todo | null>
  /** The Todo with this `id`, or `null` when there is none. */
  findById(ctx: RequestContext, id: string): Promise<Todo | null>
}

/** Maps a row to the DTO; `Date` → ISO-8601 UTC with milliseconds (AD-3). */
export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    description: row.description,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createTodoRepository(db: Db): TodoRepository {
  return {
    async list(_ctx) {
      const rows = await db
        .select()
        .from(todos)
        .orderBy(desc(todos.createdAt), desc(todos.id))
      return rows.map(toTodo)
    },

    async create(_ctx, { id, description }) {
      const [row] = await db
        .insert(todos)
        .values({ id, description })
        .onConflictDoNothing({ target: todos.id })
        .returning()
      return row ? toTodo(row) : null
    },

    async findById(_ctx, id) {
      const [row] = await db.select().from(todos).where(eq(todos.id, id))
      return row ? toTodo(row) : null
    },
  }
}
