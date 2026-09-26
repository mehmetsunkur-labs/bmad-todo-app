import { createTodo } from "../http"
import { createOp, type TodoMutationFailure } from "../todo-sync"
import { useTodoMutation, type TodoHookConfig } from "./use-todo-mutation"

/** One create: a client-generated UUIDv7 and the normalized Description. */
export interface CreateTodoVars {
  readonly id: string
  readonly description: string
}

export type CreateTodoFailure = TodoMutationFailure<CreateTodoVars>

const CREATE_CONFIG: TodoHookConfig<CreateTodoVars> = {
  kind: "create",
  op: (vars) => createOp(vars.id, vars.description),
  request: (vars) => createTodo({ id: vars.id, description: vars.description }),
}

/**
 * The create hook, built on `useTodoMutation` (kind `"create"`). The row appears
 * at once (optimistic, provisional client time) and is confirmed or rolled
 * back by the AD-12 helper. `onFailure` is feature-owned UI (the toast and
 * the Add row text) and runs exactly once per real failure; its `retry`
 * resends the same `id` and Description.
 */
export function useCreateTodo(
  onFailure: (failure: CreateTodoFailure) => void
): (vars: CreateTodoVars) => void {
  return useTodoMutation(CREATE_CONFIG, onFailure)
}
