import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  createTodoMutation,
  type TodoMutationConfig,
  type TodoMutationFailure,
  type TodoWriteKind,
} from "../todo-sync"

/** One write hook's kind and mutation config, without the UI's `onFailure`. */
export interface TodoHookConfig<TVars extends { id: string }> extends Omit<
  TodoMutationConfig<TVars>,
  "onFailure"
> {
  readonly kind: TodoWriteKind
}

/**
 * The shared body of the write hooks: one `createTodoMutation(config.kind)`
 * per `onFailure`, and a trigger that runs it against this `QueryClient`.
 * `config` must be a module-level constant, so the returned trigger is
 * stable while `onFailure` is.
 */
export function useTodoMutation<TVars extends { id: string }>(
  config: TodoHookConfig<TVars>,
  onFailure: (failure: TodoMutationFailure<TVars>) => void
): (vars: TVars) => void {
  const queryClient = useQueryClient()
  const mutation = useMemo(
    () => createTodoMutation<TVars>(config.kind, { ...config, onFailure }),
    [config, onFailure]
  )
  return useCallback(
    (vars) => void mutation.mutate(queryClient, vars),
    [mutation, queryClient]
  )
}
