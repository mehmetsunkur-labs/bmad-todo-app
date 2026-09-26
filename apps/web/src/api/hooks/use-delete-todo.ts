import { deleteTodo, isNotFound } from "../http"
import { deleteOp, type TodoMutationFailure } from "../todo-sync"
import { useTodoMutation, type TodoHookConfig } from "./use-todo-mutation"

/** One delete. */
export interface DeleteTodoVars {
  readonly id: string
}

export type DeleteTodoFailure = TodoMutationFailure<DeleteTodoVars>

/**
 * `DELETE`, with a `404 NOT_FOUND` counted as success: the Todo is already
 * gone, which is what the delete asked for.
 */
export async function deleteTodoRequest({ id }: DeleteTodoVars): Promise<null> {
  try {
    return await deleteTodo(id)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

const DELETE_CONFIG: TodoHookConfig<DeleteTodoVars> = {
  kind: "delete",
  op: deleteOp,
  request: deleteTodoRequest,
}

/**
 * The delete hook, built on `useTodoMutation` (kind `"delete"`): the row leaves
 * the list at once and `DELETE` confirms it (`confirmed(id) = null`), in the
 * mutation scope `{ id }` so it runs after any earlier write to that Todo. A
 * `404` is success; any other failure re-renders the Todo from its confirmed
 * state. `onFailure` is feature-owned UI and runs exactly once per real
 * failure. The returned trigger is stable while `onFailure` is.
 */
export function useDeleteTodo(
  onFailure: (failure: DeleteTodoFailure) => void
): (vars: DeleteTodoVars) => void {
  return useTodoMutation(DELETE_CONFIG, onFailure)
}
