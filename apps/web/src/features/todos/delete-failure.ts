import type { DeleteTodoFailure } from "@/api/hooks/use-delete-todo"
import type { TodoMutationFailure } from "@/api/todo-sync"
import { showErrorToast } from "@/lib/toast"

import { focusIsFree } from "./free-focus"

export const DELETE_FAILED_COPY = "Couldn't delete that todo. Please try again."

/**
 * What the delete failure handler needs from the Todo List. The mounted list
 * registers one; the handler reads it at the moment of failure.
 */
export interface DeleteFocusController {
  /** Focuses the restored row's checkbox once it is back in the list. */
  focusRow(id: string): void
  /**
   * Sends a `DELETE` for `id` through the list's delete hook (a `404` is
   * success; a failure gets the delete failure UI).
   */
  resendDelete(id: string): void
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
 * The delete failure UI for `id` (the row is already back at its
 * `compareTodos` position with its confirmed state). One plain toast; the
 * API's `message` is never shown. If focus is still where the delete moved
 * it (or free, see `focusIsFree`), it goes to the restored row's checkbox;
 * otherwise it stays put.
 */
function deleteFailed(id: string): void {
  const moved = movedFocus.get(id)
  movedFocus.delete(id)
  const focusStillMoved = !!moved && document.activeElement === moved
  if (focusIsFree() || focusStillMoved) controller?.focusRow(id)
  showErrorToast(DELETE_FAILED_COPY)
}

/** The delete kind's failure handler. */
export function showDeleteFailure({ vars }: DeleteTodoFailure): void {
  deleteFailed(vars.id)
}

/**
 * Wraps another kind's failure handler for a delete queued behind it: when
 * the failure dropped a delete, the delete's outcome is reported instead of
 * the failed write's UI (no edit reopens, no text returns to the Add row).
 *
 * - The Todo renders as gone after the rollback (a `404`, or a failed
 *   create): the delete counts as done (AD-4). No toast, nothing restored,
 *   and focus stays where the delete moved it.
 * - The Todo is back: the delete failed, with the delete failure UI.
 *
 * `resend` (a create): whatever the error, the POST may have committed, so
 * the dropped delete is still sent through the list's delete hook
 * (`resendDelete`); only a failure of that `DELETE` shows a toast.
 *
 * Without a dropped delete, `handler` runs as before.
 */
export function withDroppedDelete<TVars extends { id: string }>(
  handler: (failure: TodoMutationFailure<TVars>) => void,
  { resend = false }: { resend?: boolean } = {}
): (failure: TodoMutationFailure<TVars>) => void {
  return (failure) => {
    if (!failure.dropped.includes("delete")) {
      handler(failure)
      return
    }
    const { id } = failure.vars
    if (failure.state === null) {
      movedFocus.delete(id)
      if (resend) controller?.resendDelete(id)
      return
    }
    deleteFailed(id)
  }
}
