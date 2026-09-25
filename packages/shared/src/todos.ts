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

/**
 * `POST /api/v1/todos` body (AD-2, AD-4). Strict: unknown keys, including any
 * client-supplied timestamps, are rejected. Only the shape is checked here;
 * the service validates the normalized Description's length.
 */
export const CreateTodoRequestSchema = z.strictObject({
  id: z.uuid(),
  description: z.string(),
})
export type CreateTodoRequest = z.infer<typeof CreateTodoRequestSchema>

/**
 * The single Description normalization (AD-3): each `\r\n`, `\r`, or `\n`
 * becomes one space, then the result is trimmed.
 */
export function normalizeDescription(raw: string): string {
  return raw.replace(/\r\n|\r|\n/g, " ").trim()
}
