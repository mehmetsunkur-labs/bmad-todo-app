import type { EditTodoFailure } from "@/api/hooks/use-edit-todo"
import { HttpError } from "@/api/http"
import { announce } from "@/lib/announce"
import { showErrorToast } from "@/lib/toast"

import {
  isTooLong,
  quoteDescription,
  RETRY_LABEL,
  TOO_LONG_COPY,
} from "./create-failure"

export const EDIT_FAILED_COPY = "Couldn't save your edit. Please try again."

/** The Retry toast's copy: the sent Description, quoted by the Story 1.4 rule. */
export function editFailedToOtherCopy(description: string): string {
  return `Couldn't save your edit to “${quoteDescription(description)}”.`
}

/**
 * What the edit failure handler needs from the Todo List. The mounted list
 * registers one; the handler reads it at the moment of failure.
 */
export interface EditController {
  /** The id of the row whose edit field is open, if any (one per list). */
  openEditId(): string | null
  /**
   * Opens that row's edit field with `text` (the attempted Description);
   * the field takes focus only when `focus` is set.
   */
  reopen(id: string, text: string, focus: boolean): void
  /** Whether focus is inside that row. */
  containsFocus(id: string): boolean
}

let controller: EditController | null = null

/** Registers the Todo List; returns the matching unregister. */
export function registerEditController(next: EditController): () => void {
  controller = next
  return () => {
    if (controller === next) controller = null
  }
}

/**
 * The edit kind's failure handler (the row is already rolled back to its
 * confirmed Description, or removed after a `404`). The API's `message` is
 * never shown.
 *
 * - No edit open (and not a `404`): the row reopens its edit field with the
 *   sent text, focused only if focus was on `<body>` or inside that row, and
 *   a plain toast says so.
 * - Another edit open (or this row's own edit reopened), or a `404`: the
 *   text being typed is never touched; a persistent toast quotes the sent
 *   text with "Retry", which resends the same PATCH and announces
 *   "Todo updated".
 * - `too_long`: the too-long copy replaces either message.
 */
export function showEditFailure({ vars, error, retry }: EditTodoFailure) {
  const tooLong = isTooLong(error)
  const notFound = error instanceof HttpError && error.kind === "NOT_FOUND"
  const list = controller

  if (list && !notFound && list.openEditId() === null) {
    const active = document.activeElement
    const focusWasFree = !active || active === document.body
    const focus = focusWasFree || list.containsFocus(vars.id)
    list.reopen(vars.id, vars.description, focus)
    showErrorToast(tooLong ? TOO_LONG_COPY : EDIT_FAILED_COPY)
    return
  }

  showErrorToast(
    tooLong ? TOO_LONG_COPY : editFailedToOtherCopy(vars.description),
    {
      action: {
        label: RETRY_LABEL,
        onClick: () => {
          retry()
          announce("Todo updated")
        },
      },
    }
  )
}
