import { memo } from "react"

import type { Todo } from "@todos/shared"

import { CreatedAt } from "./created-at"

/**
 * One Todo row. Until Epic 2 adds the Completion checkbox and Row actions it
 * is a single column: the Description, then Created At below it. Transparent,
 * no hover background, and not clickable itself. The Description is React
 * text only: HTML shows literally, URLs are not linked, nothing is truncated.
 */
export const TodoRow = memo(function TodoRow({ todo }: { todo: Todo }) {
  return (
    <li className="group/row flex min-h-touch-target flex-col border-b py-row-padding-y">
      <p className="text-todo-description wrap-anywhere">{todo.description}</p>
      <CreatedAt iso={todo.createdAt} />
    </li>
  )
})
