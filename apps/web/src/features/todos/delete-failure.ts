import type { DeleteTodoFailure } from "@/api/hooks/use-delete-todo"
import { showErrorToast } from "@/lib/toast"

export const DELETE_FAILED_COPY = "Couldn't delete that todo. Please try again."

/**
 * What the delete failure handler needs from the Todo List. The mounted list
 * registers one; the handler reads it at the moment of failure.
 */
export interface DeleteFocusController {
  /** Focuses the restored row's checkbox once it is back in the list. */
  focusRow(id: string): void
}

let controller: DeleteFocusController | null = null

/** Registers the Todo List; returns the matching unregister. */
export function registerDeleteFocusController(
  next: DeleteFocusController
): () => void {
  controller = next
  return () => {
    if (controller === next) controller = null
  }
}

/** Per deleted id: the element the delete moved focus to. */
const movedFocus = new Map<string, Element | null>()

/** Records where a delete moved focus, for the failure restore rule. */
export function recordDeleteFocus(id: string, element: Element | null): void {
  movedFocus.set(id, element)
}

/**
 * The delete kind's failure handler (the row is already back at its
 * `compareTodos` position with its confirmed state). One plain toast; the
 * API's `message` is never shown. If focus is still where the delete moved
 * it (or on `<body>`), it goes to the restored row's checkbox; otherwise
 * it stays put.
 */
export function showDeleteFailure({ vars }: DeleteTodoFailure): void {
  const moved = movedFocus.get(vars.id)
  movedFocus.delete(vars.id)
  const active = document.activeElement
  const focusWasFree = !active || active === document.body
  const focusStillMoved = !!moved && active === moved
  if (focusWasFree || focusStillMoved) controller?.focusRow(vars.id)
  showErrorToast(DELETE_FAILED_COPY)
}
