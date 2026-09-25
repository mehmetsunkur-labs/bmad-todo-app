import { memo, useContext, useId, useLayoutEffect, useRef } from "react"

import type { Todo } from "@todos/shared"
import { cn } from "cn"
import { Pencil, Trash2 } from "lucide-react"

import type { ToggleTodoVars } from "@/api/hooks/use-toggle-todo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { announce } from "@/lib/announce"
import { HOVER_POINTER_QUERY, useMediaQuery } from "@/lib/use-media-query"

import { CreatedAt } from "./created-at"
import { EditField, type EditSaveTrigger } from "./edit-field"
import { animateRowEntrance, RowEntranceContext } from "./row-entrance"
import { animateRowExit } from "./row-exit"

/**
 * One Todo row: the Completion checkbox, then a column with the Description
 * and Created At below it, then the Row actions (Edit, then Delete).
 * Transparent, no hover background, and not clickable itself. Tab order:
 * checkbox, Edit, Delete.
 *
 * - The checkbox is 16 px in a 44 px hit area, aligned with the first line
 *   of the Description. Its accessible name is the Description (it doesn't
 *   change on toggle, and still resolves while editing), and toggling sends
 *   the absolute `completed` and announces "Marked as done" / "Marked as
 *   not done".
 * - A Completed Todo shows three cues: the checked box filled with primary,
 *   a line-through, and muted Description text. It is never re-sorted.
 * - The Description is React text only: HTML shows literally, URLs are not
 *   linked, nothing is truncated.
 *
 * - Edit and Delete are ghost icon buttons (lucide `Pencil` / `Trash2`,
 *   16 px in a 44 px hit area) in `muted-foreground`, turning `foreground`
 *   (Edit) or `destructive` (Delete) on hover or focus, named
 *   "Edit todo: {Description}" and "Delete todo: {Description}". The list
 *   owns what an edit or a delete does.
 * - Row actions visibility follows input capability, never width: on
 *   `(hover: hover) and (pointer: fine)` they sit at opacity 0 (still
 *   tabbable) until the row is hovered or has focus inside it; otherwise
 *   they are always visible.
 *
 * - Inline edit: Edit (on any device) or a double-click on the Description
 *   (on hover-capable fine pointers only) calls `onEdit(id)`. While
 *   `editing`, the edit field replaces the Description in place, starting
 *   from `editText`; Created At, the checkbox and the Row actions stay. An
 *   Enter save or an Escape cancel returns focus to this row's Edit button;
 *   a blur save leaves focus where it went.
 *
 * A row added after the list loaded expands its height on mount; a pending
 * Todo looks exactly like a confirmed one. An `exiting` row (deleted, kept
 * only for its exit motion) is `inert`, never editing, fades then collapses,
 * and reports `onExitDone(id)`; if it stops exiting (a rollback), the motion
 * is undone.
 */
export const TodoRow = memo(function TodoRow({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDraft,
  editing = false,
  editText,
  editAutoFocus = true,
  exiting = false,
  onExitDone,
}: {
  todo: Todo
  onToggle: (vars: ToggleTodoVars) => void
  onDelete: (todo: Todo) => void
  onEdit: (id: string) => void
  onSaveEdit: (todo: Todo, text: string) => void
  onCancelEdit: (id: string) => void
  /** Reports the open field's text on every change. */
  onDraft: (text: string) => void
  /** This row's edit field is open (one per list). */
  editing?: boolean
  /** The text the edit field opens with (the Description, or a failed edit's). */
  editText?: string
  /** Whether the edit field takes focus when it opens. */
  editAutoFocus?: boolean
  exiting?: boolean
  onExitDone: (id: string) => void
}) {
  const rowRef = useRef<HTMLLIElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const listLoaded = useContext(RowEntranceContext)
  const descriptionId = useId()
  const hoverPointer = useMediaQuery(HOVER_POINTER_QUERY)
  const { id } = todo

  useLayoutEffect(() => {
    if (listLoaded.current && rowRef.current) animateRowEntrance(rowRef.current)
  }, [listLoaded])

  useLayoutEffect(() => {
    if (!exiting || !rowRef.current) return
    return animateRowExit(rowRef.current, () => onExitDone(id))
  }, [exiting, id, onExitDone])

  function handleCheckedChange(checked: boolean | "indeterminate") {
    const completed = checked === true
    onToggle({ id: todo.id, completed })
    announce(completed ? "Marked as done" : "Marked as not done")
  }

  function handleSave(text: string, how: EditSaveTrigger) {
    onSaveEdit(todo, text)
    if (how === "enter") editButtonRef.current?.focus()
  }

  function handleCancel() {
    onCancelEdit(id)
    editButtonRef.current?.focus()
  }

  const isEditing = editing && !exiting

  return (
    <li
      ref={rowRef}
      data-todo-id={id}
      inert={exiting}
      className="group/row flex min-h-touch-target items-start border-b py-row-padding-y"
    >
      {/* The hit area is 44 px, pulled up so the box centers on the 24 px first line. */}
      <div className="-my-2.5 flex size-touch-target shrink-0 items-center justify-center">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={handleCheckedChange}
          aria-labelledby={descriptionId}
          className="relative after:absolute after:-inset-3.5 after:content-['']"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {isEditing ? (
          <>
            {/* Keeps the checkbox's accessible name while the field is open. */}
            <span id={descriptionId} hidden>
              {todo.description}
            </span>
            <EditField
              initialText={editText ?? todo.description}
              label={`Edit todo: ${todo.description}`}
              autoFocus={editAutoFocus}
              onSave={handleSave}
              onCancel={handleCancel}
              onChange={onDraft}
            />
          </>
        ) : (
          <p
            id={descriptionId}
            onDoubleClick={hoverPointer ? () => onEdit(id) : undefined}
            className={cn(
              "text-todo-description wrap-anywhere",
              todo.completed && "text-muted-foreground line-through"
            )}
          >
            {todo.description}
          </p>
        )}
        <CreatedAt iso={todo.createdAt} />
      </div>
      {/* Row actions: hit areas pulled up to align with the first line. */}
      <div
        data-testid="row-actions"
        className={cn(
          "-my-2.5 flex shrink-0 items-center",
          hoverPointer &&
            "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
        )}
      >
        <Button
          ref={editButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Edit todo: ${todo.description}`}
          onClick={() => onEdit(id)}
          className="size-touch-target text-muted-foreground hover:text-foreground focus-visible:text-foreground"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete todo: ${todo.description}`}
          onClick={() => onDelete(todo)}
          className="size-touch-target text-muted-foreground hover:text-destructive focus-visible:text-destructive"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </li>
  )
})
