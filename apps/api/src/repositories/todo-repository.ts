import type { Todo } from "@todos/shared"
import { desc } from "drizzle-orm"

import type { RequestContext } from "../context"
import type { Db } from "../db/client"
import { todos, type TodoRow } from "../db/schema"

export interface TodoRepository {
  /** Every Todo, newest first: `created_at desc, id desc` (`compareTodos`). */
  list(ctx: RequestContext): Promise<Todo[]>
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
  }
}
