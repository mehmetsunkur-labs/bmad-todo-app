import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { compareTodos, type Todo } from "@todos/shared"

import { useDeleteTodo } from "@/api/hooks/use-delete-todo"
import { useRetryTodos, useTodosQuery } from "@/api/hooks/use-todos-query"
import { useToggleTodo } from "@/api/hooks/use-toggle-todo"
import { TODOS_QUERY_KEY } from "@/api/query-client"
import { announce } from "@/lib/announce"

import { AddRow } from "./add-row"
import { focusAddRow } from "./create-failure"
import {
  recordDeleteFocus,
  registerDeleteFocusController,
  showDeleteFailure,
} from "./delete-failure"
import { EmptyState, LoadErrorState, LoadingState } from "./list-states"
import { RowEntranceContext } from "./row-entrance"
import { TodoRow } from "./todo-row"
import { showToggleFailure } from "./toggle-failure"

/**
 * A deleted row kept only for its exit motion: the Todo as last rendered.
 * Never sync state and never written to the cache.
 */
interface ExitingRow {
  readonly todo: Todo
  /** The list the delete was made from (the cache removal comes after it). */
  readonly from: readonly Todo[]
  /** The exit motion has finished. */
  readonly done: boolean
}

type ExitingRows = ReadonlyMap<string, ExitingRow>

interface DisplayedRow {
  readonly todo: Todo
  readonly exiting: boolean
}

/**
 * Whether an exiting row's id is back in the list after its removal: the
 * delete failed and the helper re-rendered the confirmed Todo.
 */
function isRolledBack(
  row: ExitingRow,
  list: readonly Todo[],
  ids: Set<string>
) {
  return list !== row.from && ids.has(row.todo.id)
}

/**
 * The rows to show: the list, plus exiting rows no longer in it, sorted by
 * `compareTodos`. A listed row is exiting only until the cache removes it.
 */
function displayedRows(list: readonly Todo[], exiting: ExitingRows) {
  const ids = new Set(list.map((todo) => todo.id))
  const rows: DisplayedRow[] = list.map((todo) => {
    const row = exiting.get(todo.id)
    return { todo, exiting: !!row && !isRolledBack(row, list, ids) }
  })
  for (const row of exiting.values()) {
    if (!ids.has(row.todo.id) && !row.done) {
      rows.push({ todo: row.todo, exiting: true })
    }
  }
  return rows.sort((a, b) => compareTodos(a.todo, b.todo))
}

/** Drops exiting rows that are rolled back, or finished and gone. */
function pruneExiting(list: readonly Todo[], exiting: ExitingRows) {
  const ids = new Set(list.map((todo) => todo.id))
  const kept = new Map<string, ExitingRow>()
  for (const [id, row] of exiting) {
    if (isRolledBack(row, list, ids)) continue
    if (row.done && !ids.has(id)) continue
    kept.set(id, row)
  }
  return kept.size === exiting.size ? exiting : kept
}

const EMPTY: readonly Todo[] = []

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
 * rows of a (re)load don't. The list owns the toggle and delete hooks and
 * passes stable callbacks to every row, so a write re-renders only its row.
 *
 * Delete: focus moves to the next row's checkbox, else the previous row's,
 * else the Add input, and "Todo deleted" is announced. The deleted row stays
 * as an exiting copy until its exit motion ends (the Empty state waits for
 * it), or until the id is back in the list (a failed delete's rollback).
 */
export function TodoList() {
  const query = useTodosQuery()
  const queryClient = useQueryClient()
  const retry = useRetryTodos()
  const toggle = useToggleTodo(showToggleFailure)
  const deleteTodo = useDeleteTodo(showDeleteFailure)
  const regionRef = useRef<HTMLDivElement>(null)
  const listLoaded = useRef(false)
  const list = query.data ?? EMPTY

  const [exiting, setExiting] = useState<ExitingRows>(() => new Map())
  const [prunedFor, setPrunedFor] = useState(list)
  if (prunedFor !== list) {
    setPrunedFor(list)
    setExiting((current) => pruneExiting(list, current))
  }
  const rows = displayedRows(list, exiting)

  // The latest render, for the stable delete callback.
  const latest = useRef({ list, rows })
  useLayoutEffect(() => {
    latest.current = { list, rows }
  })

  // A failed delete's focus restore waits for the restored row to render.
  const focusRowId = useRef<string | null>(null)
  const [, setFocusRequest] = useState(0)
  useEffect(
    () =>
      registerDeleteFocusController({
        focusRow: (id) => {
          focusRowId.current = id
          setFocusRequest((n) => n + 1)
        },
      }),
    []
  )
  useLayoutEffect(() => {
    const id = focusRowId.current
    if (id === null) return
    const box = checkboxOf(regionRef.current, id)
    if (box) {
      focusRowId.current = null
      box.focus()
      return
    }
    const cached = queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)
    if (!cached?.some((todo) => todo.id === id)) focusRowId.current = null
  })

  // Passive effects run after the rows' layout effects, so the rows of the
  // commit that first shows the loaded list still see `false`.
  useEffect(() => {
    listLoaded.current = query.status === "success"
  }, [query.status])

  const handleDelete = useCallback(
    (todo: Todo) => {
      const { list: from, rows: shown } = latest.current
      const index = shown.findIndex((row) => row.todo.id === todo.id)
      const target =
        shown.slice(index + 1).find((row) => !row.exiting) ??
        shown
          .slice(0, Math.max(index, 0))
          .reverse()
          .find((row) => !row.exiting)
      const targetBox = target
        ? checkboxOf(regionRef.current, target.todo.id)
        : null

      setExiting((current) =>
        new Map(current).set(todo.id, { todo, from, done: false })
      )
      deleteTodo({ id: todo.id })

      if (targetBox) targetBox.focus()
      else focusAddRow()
      recordDeleteFocus(todo.id, document.activeElement)
      announce("Todo deleted")
    },
    [deleteTodo]
  )

  const handleExitDone = useCallback((id: string) => {
    setExiting((current) => {
      const row = current.get(id)
      if (!row || row.done) return current
      return new Map(current).set(id, { ...row, done: true })
    })
  }, [])

  function handleRetry() {
    regionRef.current?.focus()
    void retry()
  }

  return (
    <>
      <AddRow status={query.status} />
      <div ref={regionRef} tabIndex={-1} data-testid="todo-list-region">
        <RowEntranceContext value={listLoaded}>
          <ListState
            status={query.status}
            rows={rows}
            onRetry={handleRetry}
            onToggle={toggle}
            onDelete={handleDelete}
            onExitDone={handleExitDone}
          />
        </RowEntranceContext>
      </div>
    </>
  )
}

/** A rendered, non-exiting row's checkbox. */
function checkboxOf(
  region: HTMLElement | null,
  id: string
): HTMLElement | null {
  for (const li of region?.querySelectorAll<HTMLElement>("li[data-todo-id]") ??
    []) {
    if (li.dataset.todoId === id && !li.hasAttribute("inert")) {
      return li.querySelector<HTMLElement>('[role="checkbox"]')
    }
  }
  return null
}

function ListState({
  status,
  rows,
  onRetry,
  onToggle,
  onDelete,
  onExitDone,
}: {
  status: ReturnType<typeof useTodosQuery>["status"]
  rows: readonly DisplayedRow[]
  onRetry: () => void
  onToggle: ReturnType<typeof useToggleTodo>
  onDelete: (todo: Todo) => void
  onExitDone: (id: string) => void
}) {
  if (status === "pending") return <LoadingState />
  if (status === "error") return <LoadErrorState onRetry={onRetry} />
  if (rows.length === 0) return <EmptyState />

  return (
    <ul aria-label="Todos">
      {rows.map(({ todo, exiting }) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          exiting={exiting}
          onToggle={onToggle}
          onDelete={onDelete}
          onExitDone={onExitDone}
        />
      ))}
    </ul>
  )
}
