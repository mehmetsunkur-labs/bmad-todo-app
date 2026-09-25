import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { compareTodos, normalizeDescription, type Todo } from "@todos/shared"

import { useDeleteTodo } from "@/api/hooks/use-delete-todo"
import { type EditTodoVars, useEditTodo } from "@/api/hooks/use-edit-todo"
import { useRetryTodos, useTodosQuery } from "@/api/hooks/use-todos-query"
import { type ToggleTodoVars, useToggleTodo } from "@/api/hooks/use-toggle-todo"
import { TODOS_QUERY_KEY } from "@/api/query-client"
import { announce } from "@/lib/announce"

import { AddRow } from "./add-row"
import { focusAddRow } from "./create-failure"
import {
  recordDeleteFocus,
  registerDeleteFocusController,
  showDeleteFailure,
  withDroppedDelete,
} from "./delete-failure"
import { registerEditController, showEditFailure } from "./edit-failure"
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

/**
 * Where focus goes when the row `id` leaves the list (Story 2.3's rule),
 * from the display order before the removal: the next non-exiting rows,
 * then the previous ones, nearest first. The first one still rendered takes
 * focus; none means the Add input.
 */
function removalFocusTargets(
  shown: readonly DisplayedRow[],
  id: string
): string[] {
  const index = shown.findIndex((row) => row.todo.id === id)
  const live = (row: DisplayedRow) => !row.exiting && row.todo.id !== id
  return [
    ...shown.slice(index + 1).filter(live),
    ...shown.slice(0, Math.max(index, 0)).reverse().filter(live),
  ].map((row) => row.todo.id)
}

/** The first target's checkbox still rendered, if any. */
function firstCheckbox(
  region: HTMLElement | null,
  targets: readonly string[]
): HTMLElement | null {
  for (const id of targets) {
    const box = checkboxOf(region, id)
    if (box) return box
  }
  return null
}

// The failure handlers, stable for the hooks: a delete dropped behind a
// failed toggle or edit reports the delete's outcome instead.
const onToggleFailure = withDroppedDelete<ToggleTodoVars>(showToggleFailure)
const onEditFailure = withDroppedDelete<EditTodoVars>(showEditFailure)

const EMPTY: readonly Todo[] = []

/** The one open edit field: its row, its starting text, and whether it takes focus. */
interface OpenEdit {
  readonly id: string
  readonly text: string
  readonly focus: boolean
}

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

  const [edit, setEdit] = useState<OpenEdit | null>(null)
  // An open edit whose row left the list, or started exiting, is closed.
  if (edit && !rows.some((row) => !row.exiting && row.todo.id === edit.id)) {
    setEdit(null)
  }
  // The open edit, written at once by the handlers (and synced with each
  // render), so a save or the failure handler never reads a stale one.
  const openEdit = useRef(edit)
  // The open field's current text (it reports every change).
  const draft = useRef("")
  useLayoutEffect(() => {
    openEdit.current = edit
  })
  const setOpenEdit = useCallback(
    (next: OpenEdit | null) => {
      openEdit.current = next
      if (next) draft.current = next.text
      setEdit(next)
    },
    [setEdit]
  )

  // The latest render, for the stable delete and removal callbacks (a row's
  // unmount cleanup still sees the order from before the removal).
  const latest = useRef({ list, rows })
  useLayoutEffect(() => {
    latest.current = { list, rows }
  })

  // A failed delete's focus restore waits for the restored row to render.
  const focusRowId = useRef<string | null>(null)
  // A focused row's removal: the row and its focus targets, resolved after
  // the commit.
  const focusRemoval = useRef<{
    row: HTMLElement
    targets: string[]
  } | null>(null)
  const [, setFocusRequest] = useState(0)
  useEffect(
    () =>
      registerDeleteFocusController({
        focusRow: (id) => {
          focusRowId.current = id
          setFocusRequest((n) => n + 1)
        },
        resendDelete: (id) => deleteTodo({ id }),
      }),
    [deleteTodo]
  )
  useLayoutEffect(() => {
    const removal = focusRemoval.current
    focusRemoval.current = null
    // Only a row really gone (not StrictMode's simulated unmount), and only
    // while its focus hasn't gone anywhere else.
    const active = document.activeElement
    if (
      removal &&
      !removal.row.isConnected &&
      (!active || active === document.body)
    ) {
      const box = firstCheckbox(regionRef.current, removal.targets)
      if (box) box.focus()
      else focusAddRow()
    }
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

  useEffect(
    () =>
      registerEditController({
        openEditId: () => openEdit.current?.id ?? null,
        reopen: (id, text, focus) => setOpenEdit({ id, text, focus }),
        containsFocus: (id) =>
          !!rowOf(regionRef.current, id)?.contains(document.activeElement),
      }),
    [setOpenEdit]
  )

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

  // A focused, non-exiting row left the list (a `404`, a failed create):
  // focus moves by the delete rule, after the commit.
  const handleFocusedRemoval = useCallback((id: string, row: HTMLElement) => {
    focusRemoval.current = {
      row,
      targets: removalFocusTargets(latest.current.rows, id),
    }
    setFocusRequest((n) => n + 1)
  }, [])

  const closeEdit = useCallback(
    (id: string) => {
      if (openEdit.current?.id === id) setOpenEdit(null)
    },
    [setOpenEdit]
  )

  const handleSaveEdit = useCallback(
    (todo: Todo, text: string) => {
      // Only the open edit saves (a field already committed or closed may
      // still fire blur as it unmounts). The row focuses Edit after Enter.
      if (openEdit.current?.id !== todo.id) return
      setOpenEdit(null)
      const description = normalizeDescription(text)
      if (!description || description === todo.description) return
      editTodo({ id: todo.id, description })
      announce("Todo updated")
    },
    [editTodo, setOpenEdit]
  )

  const handleEdit = useCallback(
    (id: string) => {
      const current = openEdit.current
      if (current?.id === id) {
        rowOf(regionRef.current, id)?.querySelector("textarea")?.focus()
        return
      }
      // Commit the open edit as its blur would (it may not have focus).
      if (current) {
        const open = latest.current.list.find((t) => t.id === current.id)
        if (open) handleSaveEdit(open, draft.current)
        else setOpenEdit(null)
      }
      const todo = latest.current.list.find((t) => t.id === id)
      if (!todo) return
      setOpenEdit({ id, text: todo.description, focus: true })
    },
    [handleSaveEdit, setOpenEdit]
  )

  const handleDraft = useCallback((text: string) => {
    draft.current = text
  }, [])

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

/** A rendered, non-exiting row. */
function rowOf(region: HTMLElement | null, id: string): HTMLElement | null {
  for (const li of region?.querySelectorAll<HTMLElement>("li[data-todo-id]") ??
    []) {
    if (li.dataset.todoId === id && !li.hasAttribute("inert")) return li
  }
  return null
}

/** A rendered, non-exiting row's checkbox. */
function checkboxOf(
  region: HTMLElement | null,
  id: string
): HTMLElement | null {
  return (
    rowOf(region, id)?.querySelector<HTMLElement>('[role="checkbox"]') ?? null
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
