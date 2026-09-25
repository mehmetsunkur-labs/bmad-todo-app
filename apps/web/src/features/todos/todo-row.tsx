import { memo, useContext, useId, useLayoutEffect, useRef } from "react"

import type { Todo } from "@todos/shared"
import { cn } from "cn"
import { Trash2 } from "lucide-react"

import type { ToggleTodoVars } from "@/api/hooks/use-toggle-todo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { announce } from "@/lib/announce"
import { HOVER_POINTER_QUERY, useMediaQuery } from "@/lib/use-media-query"

import { CreatedAt } from "./created-at"
import { animateRowEntrance, RowEntranceContext } from "./row-entrance"
import { animateRowExit } from "./row-exit"

/**
 * One Todo row: the Completion checkbox, then a column with the Description
 * and Created At below it, then the Row actions (Delete; Edit joins it in
 * Story 2.4). Transparent, no hover background, and not clickable itself.
 * Tab order: checkbox, then Delete.
 *
 * - The checkbox is 16 px in a 44 px hit area, aligned with the first line
 *   of the Description. Its accessible name is the Description (it doesn't
 *   change on toggle), and toggling sends the absolute `completed` and
 *   announces "Marked as done" / "Marked as not done".
 * - A Completed Todo shows three cues: the checked box filled with primary,
 *   a line-through, and muted Description text. It is never re-sorted.
 * - The Description is React text only: HTML shows literally, URLs are not
 *   linked, nothing is truncated.
 *
 * - Delete is a ghost icon button (lucide `Trash2`, 16 px in a 44 px hit
 *   area) in `muted-foreground`, `destructive` on hover or focus, named
 *   "Delete todo: {Description}". The list owns what a delete does.
 * - Row actions visibility follows input capability, never width: on
 *   `(hover: hover) and (pointer: fine)` they sit at opacity 0 (still
 *   tabbable) until the row is hovered or has focus inside it; otherwise
 *   they are always visible.
 *
 * A row added after the list loaded expands its height on mount; a pending
 * Todo looks exactly like a confirmed one. An `exiting` row (deleted, kept
 * only for its exit motion) is `inert`, fades then collapses, and reports
 * `onExitDone(id)`; if it stops exiting (a rollback), the motion is undone.
 */
export const TodoRow = memo(function TodoRow({
  todo,
  onToggle,
  onDelete,
  exiting = false,
  onExitDone,
}: {
  todo: Todo
  onToggle: (vars: ToggleTodoVars) => void
  onDelete: (todo: Todo) => void
  exiting?: boolean
  onExitDone: (id: string) => void
}) {
  const rowRef = useRef<HTMLLIElement>(null)
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
        <p
          id={descriptionId}
          className={cn(
            "text-todo-description wrap-anywhere",
            todo.completed && "text-muted-foreground line-through"
          )}
        >
          {todo.description}
        </p>
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
