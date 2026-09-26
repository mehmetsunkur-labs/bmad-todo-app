import type { QueryClient } from "@tanstack/react-query"

import type { EditTodoFailure } from "@/api/hooks/use-edit-todo"
import { isNotFound } from "@/api/http"
import { showErrorToast } from "@/lib/toast"

import { isTooLong } from "./create-failure"
import { quoteDescription, TOO_LONG_COPY } from "./failure-copy"
import {
  getFailureControllers,
  registerController,
} from "./failure-controllers"
import { focusIsFreeOr } from "./free-focus"
import { showRetryToast } from "./retry-toast"

export const EDIT_FAILED_COPY = "Couldn't save your edit. Please try again."

/** The Retry toast's copy: the sent Description, quoted by the Story 1.4 rule. */
export function editFailedToOtherCopy(description: string): string {
  return `Couldn't save your edit to “${quoteDescription(description)}”.`
}

/**
 * What the edit failure handler needs from the Todo List. The mounted list
 * registers one with its tree's QueryClient; the handler reads that client's
 * at the moment of failure.
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

/** Registers the Todo List of `queryClient`'s tree; returns the unregister. */
export function registerEditController(
  queryClient: QueryClient,
  next: EditController
): () => void {
  return registerController(queryClient, "edit", next)
}

/**
 * The edit kind's failure handler (the row is already rolled back to its
 * confirmed Description, or removed after a `404`). The API's `message` is
 * never shown.
 *
 * - No edit open (and not a `404`): the row reopens its edit field with the
 *   sent text, focused only if focus was free (see `focusIsFreeOr`) or inside
 *   that row, and a plain toast says so.
 * - Another edit open (or this row's own edit reopened), or a `404`: the
 *   text being typed is never touched; a persistent toast quotes the sent
 *   text with "Retry", which resends the same PATCH and announces
 *   "Todo updated".
 * - `too_long`: the too-long copy replaces either message.
 */
export function showEditFailure({
  vars,
  error,
  retry,
  queryClient,
}: EditTodoFailure) {
  const tooLong = isTooLong(error)
  const notFound = isNotFound(error)
  const list = getFailureControllers(queryClient).edit

  if (list && !notFound && list.openEditId() === null) {
    const focus = focusIsFreeOr(() => list.containsFocus(vars.id))
    list.reopen(vars.id, vars.description, focus)
    showErrorToast(tooLong ? TOO_LONG_COPY : EDIT_FAILED_COPY)
    return
  }

  showRetryToast(
    tooLong ? TOO_LONG_COPY : editFailedToOtherCopy(vars.description),
    retry,
    "Todo updated"
  )
}
