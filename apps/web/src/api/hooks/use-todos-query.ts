import { useQuery, useQueryClient } from "@tanstack/react-query"
import { compareTodos, type Todo } from "@todos/shared"

import { listTodos } from "../http"
import { TODOS_QUERY_KEY } from "../query-client"
import { getTodoSync } from "../todo-sync"

/**
 * The Todo List, cached under `['todos']` with the pinned defaults (no
 * per-hook overrides). A successful fetch seeds `todo-sync` confirmed state.
 */
export function useTodosQuery() {
  const queryClient = useQueryClient()
  return useQuery<Todo[]>({
    queryKey: TODOS_QUERY_KEY,
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
