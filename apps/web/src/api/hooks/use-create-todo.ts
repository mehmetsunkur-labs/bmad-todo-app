import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { createTodo } from "../http"
import {
  createOp,
  createTodoMutation,
  type TodoMutationFailure,
} from "../todo-sync"

/** One create: a client-generated UUIDv7 and the normalized Description. */
export interface CreateTodoVars {
  readonly id: string
  readonly description: string
}

export type CreateTodoFailure = TodoMutationFailure<CreateTodoVars>

/**
 * The create hook, built on `createTodoMutation("create")`. The row appears
 * at once (optimistic, provisional client time) and is confirmed or rolled
 * back by the AD-12 helper. `onFailure` is feature-owned UI (the toast and
 * the Add row text) and runs exactly once per real failure; its `retry`
 * resends the same `id` and Description.
 */
export function useCreateTodo(
  onFailure: (failure: CreateTodoFailure) => void
): (vars: CreateTodoVars) => void {
  const queryClient = useQueryClient()
  const mutation = useMemo(
    () =>
      createTodoMutation<CreateTodoVars>("create", {
        op: (vars) => createOp(vars.id, vars.description),
        request: (vars) =>
          createTodo({ id: vars.id, description: vars.description }),
        onFailure,
      }),
    [onFailure]
  )
  return useCallback(
    (vars) => void mutation.mutate(queryClient, vars),
    [mutation, queryClient]
  )
}
