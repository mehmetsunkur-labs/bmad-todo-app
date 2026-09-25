import type { Todo } from "@todos/shared"
import { desc, eq, sql, type SQL } from "drizzle-orm"

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
  /**
   * One `UPDATE … RETURNING` (AD-7) that sets only the columns present in
   * `patch` (the service always sends at least one). `updated_at` moves only
   * when a present column's stored value actually changes, checked against
   * the pre-update row in the same statement. It becomes
   * `GREATEST(now(), updated_at)`: `now()` is the transaction start, so a
   * racing PATCH that commits last never moves `updated_at` backwards.
   * `created_at` is never touched (AD-3). Returns the resulting Todo, or `null` when there is no such `id`.
   */
  update(
    ctx: RequestContext,
    id: string,
    patch: TodoPatch
  ): Promise<Todo | null>
  /**
   * One `DELETE … RETURNING id` (AD-7). Returns true when a row was deleted,
   * false when there is no such `id`.
   */
  delete(ctx: RequestContext, id: string): Promise<boolean>
}

/** The columns a PATCH may change; a missing key means unchanged. */
export interface TodoPatch {
  description?: string
  completed?: boolean
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

    async update(_ctx, id, patch) {
      // SET expressions see the pre-update row, so the change check and the
      // write are one atomic statement (no read-modify-write).
      const set: Partial<Pick<TodoRow, "description" | "completed">> = {}
      const changed: SQL[] = []
      if (patch.description !== undefined) {
        set.description = patch.description
        changed.push(
          sql`${todos.description} IS DISTINCT FROM ${patch.description}::text`
        )
      }
      if (patch.completed !== undefined) {
        set.completed = patch.completed
        changed.push(
          sql`${todos.completed} IS DISTINCT FROM ${patch.completed}::boolean`
        )
      }
      // An empty patch (the service never sends one) degrades to a no-op.
      const anyChanged = changed.length
        ? sql.join(changed, sql` OR `)
        : sql`false`
      const [row] = await db
        .update(todos)
        .set({
          ...set,
          updatedAt: sql`CASE WHEN ${anyChanged} THEN GREATEST(now(), ${todos.updatedAt}) ELSE ${todos.updatedAt} END`,
        })
        .where(eq(todos.id, id))
        .returning()
      return row ? toTodo(row) : null
    },

    async delete(_ctx, id) {
      const rows = await db
        .delete(todos)
        .where(eq(todos.id, id))
        .returning({ id: todos.id })
      return rows.length > 0
    },
  }
}
