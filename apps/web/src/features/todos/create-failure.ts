import type { QueryClient } from "@tanstack/react-query"
import { normalizeDescription } from "@todos/shared"

import type { CreateTodoFailure } from "@/api/hooks/use-create-todo"
import { HttpError } from "@/api/http"
import { showErrorToast } from "@/lib/toast"

import { quoteDescription, TOO_LONG_COPY } from "./failure-copy"
import {
  getFailureControllers,
  registerController,
} from "./failure-controllers"
import { focusIsFreeOr } from "./free-focus"
import { showRetryToast } from "./retry-toast"

export const CREATE_RESTORED_COPY =
  "Couldn't add that todo. Your text is back in the box."

/**
 * What the create failure handler needs from the Add row input. The mounted
 * Add row registers one with its tree's QueryClient; the handler reads that
 * client's at the moment of failure.
 */
export interface AddRowController {
  getValue(): string
  /**
   * Puts a failed create's Description back into the empty input and
   * remembers its `id`: submitting the same normalized text again reuses it,
   * so a POST that committed but timed out is replayed, not duplicated.
   */
  restore(description: string, id: string): void
  focus(): void
  /** Whether focus is inside the Add row form. */
  containsFocus(): boolean
}

/** Registers the Add row of `queryClient`'s tree; returns the unregister. */
export function registerAddRowController(
  queryClient: QueryClient,
  next: AddRowController
): () => void {
  return registerController(queryClient, "addRow", next)
}

/** Focuses the Add row input of `queryClient`'s tree, if it is mounted. */
export function focusAddRow(queryClient: QueryClient): void {
  getFailureControllers(queryClient).addRow?.focus()
}

export function isTooLong(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    !!error.details?.some((detail) => detail.reason === "too_long")
  )
}

/**
 * The create kind's failure handler (the row is already rolled back). The
 * API's `message` is never shown; every failure kind maps to this copy.
 *
 * - Input empty: the sent (normalized) Description goes back into the input
 *   (with its `id`, reused if that text is resubmitted unchanged), focus
 *   moves there only from free focus (`focusIsFreeOr`) or the Add row, and a
 *   plain toast says so.
 * - Input has text: it is left alone, and a persistent toast quotes the
 *   failed Description with "Retry" (same `id` and Description).
 * - `too_long`: the too-long copy replaces either message.
 */
export function showCreateFailure({
  vars,
  error,
  retry,
  queryClient,
}: CreateTodoFailure) {
  const tooLong = isTooLong(error)
  const { addRow } = getFailureControllers(queryClient)

  if (addRow && normalizeDescription(addRow.getValue()) === "") {
    const focus = focusIsFreeOr(() => addRow.containsFocus())
    addRow.restore(vars.description, vars.id)
    if (focus) addRow.focus()
    showErrorToast(tooLong ? TOO_LONG_COPY : CREATE_RESTORED_COPY)
    return
  }

  showRetryToast(
    tooLong
      ? TOO_LONG_COPY
      : `Couldn't add “${quoteDescription(vars.description)}”.`,
    retry,
    "Todo added"
  )
}
