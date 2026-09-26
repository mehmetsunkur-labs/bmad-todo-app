import { useCallback, useState } from "react"
import { compareTodos, type Todo } from "@todos/shared"

/**
 * A deleted row kept only for its exit motion: the Todo as last rendered.
 * Never sync state and never written to the cache.
 */
export interface ExitingRow {
  readonly todo: Todo
  /** The list the delete was made from (the cache removal comes after it). */
  readonly from: readonly Todo[]
  /** The exit motion has finished. */
  readonly done: boolean
}

export type ExitingRows = ReadonlyMap<string, ExitingRow>

export interface DisplayedRow {
  readonly todo: Todo
  readonly exiting: boolean
}

/**
 * The latest render's list and displayed rows, for the stable delete, edit
 * and removal callbacks (a row's unmount cleanup still sees the order from
 * before the removal).
 */
export interface LatestRender {
  readonly list: readonly Todo[]
  readonly rows: readonly DisplayedRow[]
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
export function displayedRows(list: readonly Todo[], exiting: ExitingRows) {
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
export function pruneExiting(list: readonly Todo[], exiting: ExitingRows) {
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
 * The exiting-row bookkeeping: deleted rows stay as exiting copies until
 * their exit motion ends, or until their id is back in the list (a failed
 * delete's rollback). Entries are pruned, during render, whenever the list
 * identity changes. `markExiting` and `handleExitDone` are stable.
 */
export function useExitingRows(list: readonly Todo[]) {
  const [exiting, setExiting] = useState<ExitingRows>(() => new Map())
  const [prunedFor, setPrunedFor] = useState(list)
  if (prunedFor !== list) {
    setPrunedFor(list)
    setExiting((current) => pruneExiting(list, current))
  }
  const rows = displayedRows(list, exiting)

  const markExiting = useCallback(
    ({ todo, from }: Pick<ExitingRow, "todo" | "from">) => {
      setExiting((current) =>
        new Map(current).set(todo.id, { todo, from, done: false })
      )
    },
    []
  )

  const handleExitDone = useCallback((id: string) => {
    setExiting((current) => {
      const row = current.get(id)
      if (!row || row.done) return current
      return new Map(current).set(id, { ...row, done: true })
    })
  }, [])

  return { rows, markExiting, handleExitDone }
}
