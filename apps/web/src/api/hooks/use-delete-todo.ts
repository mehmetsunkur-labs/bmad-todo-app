import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { deleteTodo, HttpError } from "../http"
import {
  createTodoMutation,
  deleteOp,
  type TodoMutationFailure,
} from "../todo-sync"

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
    if (error instanceof HttpError && error.kind === "NOT_FOUND") return null
    throw error
  }
}

/**
 * The delete hook, built on `createTodoMutation("delete")`: the row leaves
 * the list at once and `DELETE` confirms it (`confirmed(id) = null`), in the
 * mutation scope `{ id }` so it runs after any earlier write to that Todo. A
 * `404` is success; any other failure re-renders the Todo from its confirmed
 * state. `onFailure` is feature-owned UI and runs exactly once per real
 * failure. The returned trigger is stable while `onFailure` is.
 */
export function useDeleteTodo(
  onFailure: (failure: DeleteTodoFailure) => void
): (vars: DeleteTodoVars) => void {
  const queryClient = useQueryClient()
  const mutation = useMemo(
    () =>
      createTodoMutation<DeleteTodoVars>("delete", {
        op: deleteOp,
        request: deleteTodoRequest,
        onFailure,
      }),
    [onFailure]
  )
  return useCallback(
    (vars) => void mutation.mutate(queryClient, vars),
    [mutation, queryClient]
  )
}
