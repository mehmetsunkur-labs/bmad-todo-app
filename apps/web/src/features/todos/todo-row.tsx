import { memo, useContext, useId, useLayoutEffect, useRef } from "react"

import type { Todo } from "@todos/shared"
import { cn } from "cn"

import type { ToggleTodoVars } from "@/api/hooks/use-toggle-todo"
import { Checkbox } from "@/components/ui/checkbox"
import { announce } from "@/lib/announce"

import { CreatedAt } from "./created-at"
import { animateRowEntrance, RowEntranceContext } from "./row-entrance"

/**
 * One Todo row: the Completion checkbox, then a column with the Description
 * and Created At below it (Row actions follow in Stories 2.3/2.4).
 * Transparent, no hover background, and not clickable itself.
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
 * A row added after the list loaded expands its height on mount; a pending
 * Todo looks exactly like a confirmed one.
 */
export const TodoRow = memo(function TodoRow({
  todo,
  onToggle,
}: {
  todo: Todo
  onToggle: (vars: ToggleTodoVars) => void
}) {
  const rowRef = useRef<HTMLLIElement>(null)
  const listLoaded = useContext(RowEntranceContext)
  const descriptionId = useId()

  useLayoutEffect(() => {
    if (listLoaded.current && rowRef.current) animateRowEntrance(rowRef.current)
  }, [listLoaded])

  function handleCheckedChange(checked: boolean | "indeterminate") {
    const completed = checked === true
    onToggle({ id: todo.id, completed })
    announce(completed ? "Marked as done" : "Marked as not done")
  }

  return (
    <li
      ref={rowRef}
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
    </li>
  )
})
