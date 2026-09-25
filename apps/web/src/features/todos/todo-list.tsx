import { useEffect, useRef } from "react"

import { useRetryTodos, useTodosQuery } from "@/api/hooks/use-todos-query"
import { useToggleTodo } from "@/api/hooks/use-toggle-todo"

import { AddRow } from "./add-row"
import { EmptyState, LoadErrorState, LoadingState } from "./list-states"
import { RowEntranceContext } from "./row-entrance"
import { TodoRow } from "./todo-row"
import { showToggleFailure } from "./toggle-failure"

/**
 * The Todo List, always in exactly one List State, inside the list region: a
 * `tabIndex={-1}` container that stays mounted across states. "Try again"
 * unmounts its own button, so it first moves focus to the region; focus
 * stays there while loading and is never lost to `<body>`. On hover-capable
 * fine pointers, the Add row input takes focus once the list is loaded
 * (Empty or Populated). The region adds no tab stop.
 *
 * The Add row sits above the region and follows the query status. Rows that
 * mount once the loaded list has been shown are new Todos and animate in;
 * rows of a (re)load don't. The list owns the toggle hook and passes one
 * stable callback to every row, so a toggle re-renders only its own row.
 */
export function TodoList() {
  const query = useTodosQuery()
  const retry = useRetryTodos()
  const toggle = useToggleTodo(showToggleFailure)
  const regionRef = useRef<HTMLDivElement>(null)
  const listLoaded = useRef(false)

  // Passive effects run after the rows' layout effects, so the rows of the
  // commit that first shows the loaded list still see `false`.
  useEffect(() => {
    listLoaded.current = query.status === "success"
  }, [query.status])

  function handleRetry() {
    regionRef.current?.focus()
    void retry()
  }

  return (
    <>
      <AddRow status={query.status} />
      <div ref={regionRef} tabIndex={-1} data-testid="todo-list-region">
        <RowEntranceContext value={listLoaded}>
          <ListState query={query} onRetry={handleRetry} onToggle={toggle} />
        </RowEntranceContext>
      </div>
    </>
  )
}

function ListState({
  query,
  onRetry,
  onToggle,
}: {
  query: ReturnType<typeof useTodosQuery>
  onRetry: () => void
  onToggle: ReturnType<typeof useToggleTodo>
}) {
  if (query.status === "pending") return <LoadingState />
  if (query.status === "error") return <LoadErrorState onRetry={onRetry} />
  if (query.data.length === 0) return <EmptyState />

  return (
    <ul aria-label="Todos">
      {query.data.map((todo) => (
        <TodoRow key={todo.id} todo={todo} onToggle={onToggle} />
      ))}
    </ul>
  )
}
