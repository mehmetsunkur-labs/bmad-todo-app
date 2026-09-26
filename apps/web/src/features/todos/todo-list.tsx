import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { Todo } from "@todos/shared"

import { useDeleteTodo } from "@/api/hooks/use-delete-todo"
import { type EditTodoVars, useEditTodo } from "@/api/hooks/use-edit-todo"
import { useRetryTodos, useTodosQuery } from "@/api/hooks/use-todos-query"
import { type ToggleTodoVars, useToggleTodo } from "@/api/hooks/use-toggle-todo"
import { announce } from "@/lib/announce"

import { AddRow } from "./add-row"
import { focusAddRow } from "./create-failure"
import {
  recordDeleteFocus,
  registerDeleteFocusController,
  showDeleteFailure,
  withDroppedDelete,
} from "./delete-failure"
import { showEditFailure } from "./edit-failure"
import { firstCheckbox } from "./list-dom"
import { EmptyState, LoadErrorState, LoadingState } from "./list-states"
import { RowEntranceContext } from "./row-entrance"
import { TodoRow } from "./todo-row"
import { showToggleFailure } from "./toggle-failure"
import { type OpenEdit, useEditMachine } from "./use-edit-machine"
import {
  type DisplayedRow,
  type LatestRender,
  useExitingRows,
} from "./use-exiting-rows"
import { removalFocusTargets, useListFocus } from "./use-list-focus"

// The failure handlers, stable for the hooks: a delete dropped behind a
// failed toggle or edit reports the delete's outcome instead.
const onToggleFailure = withDroppedDelete<ToggleTodoVars>(showToggleFailure)
const onEditFailure = withDroppedDelete<EditTodoVars>(showEditFailure)

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
 * Any other removal of a focused row (a `404`, a failed create) moves focus
 * by the same rule, from the order before the removal. The region is marked
 * `data-focus-free`: focus on it counts as free for the failure handlers.
 *
 * Edit: at most one edit field is open per list. Opening another commits
 * the open one (its blur saves it first). A save normalizes the text; empty
 * or unchanged text just closes the field, anything else applies the edit
 * at once, announces "Todo updated" and closes. The list registers the edit
 * controller the edit failure handler reads.
 */
export function TodoList() {
  const query = useTodosQuery()
  const queryClient = useQueryClient()
  const retry = useRetryTodos()
  const toggle = useToggleTodo(onToggleFailure)
  const deleteTodo = useDeleteTodo(showDeleteFailure)
  const editTodo = useEditTodo(onEditFailure)
  const listLoaded = useRef(false)
  const list = query.data ?? EMPTY

  const { rows, markExiting, handleExitDone } = useExitingRows(list)

  // The latest render, for the stable delete, edit and removal callbacks (a
  // row's unmount cleanup still sees the order from before the removal).
  const latest = useRef<LatestRender>({ list, rows })
  useLayoutEffect(() => {
    latest.current = { list, rows }
  })

  const { regionRef, handleFocusedRemoval, requestRowFocus } = useListFocus({
    latest,
    queryClient,
  })
  useEffect(
    () =>
      registerDeleteFocusController(queryClient, {
        focusRow: requestRowFocus,
        resendDelete: (id) => deleteTodo({ id }),
      }),
    [queryClient, deleteTodo, requestRowFocus]
  )

  const { edit, closeEdit, handleSaveEdit, handleEdit, handleDraft } =
    useEditMachine({ rows, latest, regionRef, editTodo, queryClient })

  // Passive effects run after the rows' layout effects, so the rows of the
  // commit that first shows the loaded list still see `false`.
  useEffect(() => {
    listLoaded.current = query.status === "success"
  }, [query.status])

  const handleDelete = useCallback(
    (todo: Todo) => {
      const { list: from, rows: shown } = latest.current
      const targetBox = firstCheckbox(
        regionRef.current,
        removalFocusTargets(shown, todo.id)
      )

      markExiting({ todo, from })
      deleteTodo({ id: todo.id })

      if (targetBox) targetBox.focus()
      else focusAddRow(queryClient)
      recordDeleteFocus(queryClient, todo.id, document.activeElement)
      announce("Todo deleted")
    },
    [deleteTodo, markExiting, regionRef, queryClient]
  )

  function handleRetry() {
    regionRef.current?.focus()
    void retry()
  }

  return (
    <>
      <AddRow status={query.status} />
      <div
        ref={regionRef}
        tabIndex={-1}
        data-testid="todo-list-region"
        data-focus-free=""
      >
        <RowEntranceContext value={listLoaded}>
          <ListState
            status={query.status}
            rows={rows}
            onRetry={handleRetry}
            onToggle={toggle}
            onDelete={handleDelete}
            edit={edit}
            onEdit={handleEdit}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={closeEdit}
            onDraft={handleDraft}
            onExitDone={handleExitDone}
            onFocusedRemoval={handleFocusedRemoval}
          />
        </RowEntranceContext>
      </div>
    </>
  )
}

function ListState({
  status,
  rows,
  onRetry,
  onToggle,
  onDelete,
  edit,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDraft,
  onExitDone,
  onFocusedRemoval,
}: {
  status: ReturnType<typeof useTodosQuery>["status"]
  rows: readonly DisplayedRow[]
  onRetry: () => void
  onToggle: ReturnType<typeof useToggleTodo>
  onDelete: (todo: Todo) => void
  edit: OpenEdit | null
  onEdit: (id: string) => void
  onSaveEdit: (todo: Todo, text: string) => void
  onCancelEdit: (id: string) => void
  onDraft: (text: string) => void
  onExitDone: (id: string) => void
  onFocusedRemoval: (id: string, row: HTMLElement) => void
}) {
  if (status === "pending") return <LoadingState />
  if (status === "error") return <LoadErrorState onRetry={onRetry} />
  if (rows.length === 0) return <EmptyState />

  return (
    <ul aria-label="Todos">
      {rows.map(({ todo, exiting }) => {
        const open = edit?.id === todo.id ? edit : null
        return (
          <TodoRow
            key={todo.id}
            todo={todo}
            exiting={exiting}
            editing={!!open}
            editText={open?.text}
            editAutoFocus={open?.focus}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onDraft={onDraft}
            onExitDone={onExitDone}
            onFocusedRemoval={onFocusedRemoval}
          />
        )
      })}
    </ul>
  )
}
