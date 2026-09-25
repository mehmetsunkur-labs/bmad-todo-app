import { normalizeDescription } from "@todos/shared"

import type { CreateTodoFailure } from "@/api/hooks/use-create-todo"
import { HttpError } from "@/api/http"
import { announce } from "@/lib/announce"
import { showErrorToast } from "@/lib/toast"

export const CREATE_RESTORED_COPY =
  "Couldn't add that todo. Your text is back in the box."
export const TOO_LONG_COPY =
  "That todo is too long. The limit is 500 characters."
export const RETRY_LABEL = "Retry"

/** How many characters of a failed Description the Retry toast quotes. */
export const QUOTE_MAX = 40

/**
 * What the create failure handler needs from the Add row input. The mounted
 * Add row registers one; the handler reads it at the moment of failure.
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

let controller: AddRowController | null = null

/** Registers the Add row; returns the matching unregister. */
export function registerAddRowController(next: AddRowController): () => void {
  controller = next
  return () => {
    if (controller === next) controller = null
  }
}

/** Focuses the Add row input, if the Add row is mounted. */
export function focusAddRow(): void {
  controller?.focus()
}

/** The Description as-is up to 40 characters; otherwise its first 40 and "…". */
export function quoteDescription(description: string): string {
  const chars = Array.from(description)
  return chars.length <= QUOTE_MAX
    ? description
    : `${chars.slice(0, QUOTE_MAX).join("")}…`
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
 *   moves there only from `<body>` or the Add row, and a plain toast says so.
 * - Input has text: it is left alone, and a persistent toast quotes the
 *   failed Description with "Retry" (same `id` and Description).
 * - `too_long`: the too-long copy replaces either message.
 */
export function showCreateFailure({ vars, error, retry }: CreateTodoFailure) {
  const tooLong = isTooLong(error)
  const addRow = controller

  if (addRow && normalizeDescription(addRow.getValue()) === "") {
    const active = document.activeElement
    const focusWasFree = !active || active === document.body
    const focusInAddRow = addRow.containsFocus()
    addRow.restore(vars.description, vars.id)
    if (focusWasFree || focusInAddRow) addRow.focus()
    showErrorToast(tooLong ? TOO_LONG_COPY : CREATE_RESTORED_COPY)
    return
  }

  showErrorToast(
    tooLong
      ? TOO_LONG_COPY
      : `Couldn't add “${quoteDescription(vars.description)}”.`,
    {
      action: {
        label: RETRY_LABEL,
        onClick: () => {
          retry()
          announce("Todo added")
        },
      },
    }
  )
}
