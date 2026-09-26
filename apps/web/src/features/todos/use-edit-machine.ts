import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { normalizeDescription, type Todo } from "@todos/shared"

import type { useEditTodo } from "@/api/hooks/use-edit-todo"
import { announce } from "@/lib/announce"

import { registerEditController } from "./edit-failure"
import { rowOf } from "./list-dom"
import type { DisplayedRow, LatestRender } from "./use-exiting-rows"

/** The one open edit field: its row, its starting text, and whether it takes focus. */
export interface OpenEdit {
  readonly id: string
  readonly text: string
  readonly focus: boolean
}

/**
 * The single-open-edit state machine: at most one edit field is open per
 * list. Opening another first commits the open one explicitly, with its
 * current draft, since that field may not have focus to blur. A save
 * normalizes the text; empty or unchanged text just closes the field,
 * anything else applies the edit at once, announces "Todo updated" and
 * closes. An open edit whose row is gone or exiting is closed during render.
 * Registers the edit controller the edit failure handler reads. Every
 * returned callback is stable.
 */
export function useEditMachine({
  rows,
  latest,
  regionRef,
  editTodo,
}: {
  rows: readonly DisplayedRow[]
  latest: RefObject<LatestRender>
  regionRef: RefObject<HTMLElement | null>
  editTodo: ReturnType<typeof useEditTodo>
}) {
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

  useEffect(
    () =>
      registerEditController({
        openEditId: () => openEdit.current?.id ?? null,
        reopen: (id, text, focus) => setOpenEdit({ id, text, focus }),
        containsFocus: (id) =>
          !!rowOf(regionRef.current, id)?.contains(document.activeElement),
      }),
    [setOpenEdit, regionRef]
  )

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
    [handleSaveEdit, setOpenEdit, latest, regionRef]
  )

  const handleDraft = useCallback((text: string) => {
    draft.current = text
  }, [])

  return { edit, closeEdit, handleSaveEdit, handleEdit, handleDraft }
}
