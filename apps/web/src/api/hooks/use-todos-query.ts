import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Todo } from "@todos/shared"

import { listTodos } from "../http"
import { TODOS_QUERY_KEY } from "../query-client"
import { getTodoSync, renderedList } from "../todo-sync"

/**
 * The Todo List, cached under `['todos']` with the pinned defaults (no
 * per-hook overrides). A successful fetch seeds `todo-sync` confirmed state
 * and returns the rendered list: pending ops stay applied, and pending
 * creates not yet listed stay in it.
 * Structural sharing is off (it is not a pinned default): `todo-sync` writes
 * one id at a time and keeps every other row's object, which index-based
 * sharing would otherwise copy whenever rows shift, re-rendering them all.
 */
export function useTodosQuery() {
  const queryClient = useQueryClient()
  return useQuery<Todo[]>({
    queryKey: TODOS_QUERY_KEY,
    structuralSharing: false,
    queryFn: async ({ signal }) => {
      const { todos } = await listTodos(signal)
      const sync = getTodoSync(queryClient)
      sync.seedFromList(todos)
      return renderedList(sync, todos)
    },
  })
}

/** "Try again": back to Loading, then a fresh fetch. Never `invalidateQueries`. */
export function useRetryTodos() {
  const queryClient = useQueryClient()
  return () => queryClient.resetQueries({ queryKey: TODOS_QUERY_KEY })
}
