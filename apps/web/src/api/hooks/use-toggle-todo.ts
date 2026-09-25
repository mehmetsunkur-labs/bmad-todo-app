import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { updateTodo } from "../http"
import {
  createTodoMutation,
  notFoundMeansDeleted,
  toggleOp,
  type TodoMutationFailure,
} from "../todo-sync"

/** One toggle: the absolute `completed` to set (never a flip). */
export interface ToggleTodoVars {
  readonly id: string
  readonly completed: boolean
}

export type ToggleTodoFailure = TodoMutationFailure<ToggleTodoVars>

/**
 * The toggle hook, built on `createTodoMutation("toggle")`: the row shows
 * the new `completed` at once and `PATCH { completed }` confirms it, in the
 * mutation scope `{ id }` so toggles of one Todo run in order. A `404` maps
 * the Todo to "not on the server" (the row is removed); any other failure
 * rolls it back to its confirmed state. `onFailure` is feature-owned UI and
 * runs exactly once per real failure.
 */
export function useToggleTodo(
  onFailure: (failure: ToggleTodoFailure) => void
): (vars: ToggleTodoVars) => void {
  const queryClient = useQueryClient()
  const mutation = useMemo(
    () =>
      createTodoMutation<ToggleTodoVars>("toggle", {
        op: (vars) => toggleOp(vars.completed),
        request: (vars) => updateTodo(vars.id, { completed: vars.completed }),
        failureState: notFoundMeansDeleted,
        onFailure,
      }),
    [onFailure]
  )
  return useCallback(
    (vars) => void mutation.mutate(queryClient, vars),
    [mutation, queryClient]
  )
}
