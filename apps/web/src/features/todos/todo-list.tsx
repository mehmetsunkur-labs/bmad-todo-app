import { useRef } from "react"

import { useRetryTodos, useTodosQuery } from "@/api/hooks/use-todos-query"

import { EmptyState, LoadErrorState, LoadingState } from "./list-states"
import { TodoRow } from "./todo-row"

/**
 * The Todo List, always in exactly one List State, inside the list region: a
 * `tabIndex={-1}` container that stays mounted across states. "Try again"
 * unmounts its own button, so it first moves focus to the region; focus then
 * stays there while the state resolves (skeleton, Empty, rows, or the error
 * again) and is never lost to `<body>`. The region adds no tab stop.
 */
export function TodoList() {
  const query = useTodosQuery()
  const retry = useRetryTodos()
  const regionRef = useRef<HTMLDivElement>(null)

  function handleRetry() {
    regionRef.current?.focus()
    void retry()
  }

  return (
    <div ref={regionRef} tabIndex={-1} data-testid="todo-list-region">
      <ListState query={query} onRetry={handleRetry} />
    </div>
  )
}

function ListState({
  query,
  onRetry,
}: {
  query: ReturnType<typeof useTodosQuery>
  onRetry: () => void
}) {
  if (query.status === "pending") return <LoadingState />
  if (query.status === "error") return <LoadErrorState onRetry={onRetry} />
  if (query.data.length === 0) return <EmptyState />

  return (
    <ul aria-label="Todos">
      {query.data.map((todo) => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}
