import { z } from "zod"

/**
 * The Todo DTO (AD-3). Response schemas strip unknown keys (`z.object`) so
 * clients ignore fields added later (AD-2). Request schemas stay `.strict()`.
 */
export const TodoSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  completed: z.boolean(),
  createdAt: z.iso.datetime({ precision: 3 }),
  updatedAt: z.iso.datetime({ precision: 3 }),
})
export type Todo = z.infer<typeof TodoSchema>

/** `GET /api/v1/todos` body: always wrapped, never a bare array (AD-2). */
export const TodoListResponseSchema = z.object({
  todos: z.array(TodoSchema),
})
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>

/**
 * The single list order: `createdAt` descending, then `id` descending.
 * Timestamps are fixed-width ISO-8601 UTC strings, so string order is time
 * order.
 */
export function compareTodos(
  a: Pick<Todo, "id" | "createdAt">,
  b: Pick<Todo, "id" | "createdAt">
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  if (a.id !== b.id) return a.id < b.id ? 1 : -1
  return 0
}
