import { useQuery, useQueryClient } from "@tanstack/react-query"
import { compareTodos, type Todo } from "@todos/shared"

import { listTodos } from "../http"
import { TODOS_QUERY_KEY } from "../query-client"
import { getTodoSync } from "../todo-sync"

/**
 * The Todo List, cached under `['todos']` with the pinned defaults (no
 * per-hook overrides). A successful fetch seeds `todo-sync` confirmed state.
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
      getTodoSync(queryClient).seedFromList(todos)
      return [...todos].sort(compareTodos)
    },
  })
}

/** "Try again": back to Loading, then a fresh fetch. Never `invalidateQueries`. */
export function useRetryTodos() {
  const queryClient = useQueryClient()
  return () => queryClient.resetQueries({ queryKey: TODOS_QUERY_KEY })
}
