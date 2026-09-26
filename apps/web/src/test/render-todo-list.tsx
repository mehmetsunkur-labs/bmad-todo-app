import type { ReactNode } from "react"
import type { QueryClient } from "@tanstack/react-query"
import type { Todo } from "@todos/shared"

import { TodoList } from "@/features/todos/todo-list"

import { advance, fetchMock } from "./fetch"
import { jsonResponse, renderWithProviders } from "./render"

/**
 * Renders `<TodoList />` (plus `extra`, if given) with `todos` as the loaded
 * list, and flushes the load.
 */
export async function renderPopulated(
  todos: Todo[],
  { queryClient, extra }: { queryClient?: QueryClient; extra?: ReactNode } = {}
) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ todos }))
  const result = renderWithProviders(
    <>
      <TodoList />
      {extra}
    </>,
    { queryClient }
  )
  await advance(0)
  return result
}
