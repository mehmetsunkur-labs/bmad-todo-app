import type { QueryClient } from "@tanstack/react-query"

import type { DeleteTodoFailure } from "@/api/hooks/use-delete-todo"
import type { TodoMutationFailure } from "@/api/todo-sync"
import { showErrorToast } from "@/lib/toast"

import {
  getFailureControllers,
  registerController,
} from "./failure-controllers"
import { focusIsFreeOr } from "./free-focus"

export const DELETE_FAILED_COPY = "Couldn't delete that todo. Please try again."

/**
 * What the delete failure handler needs from the Todo List. The mounted list
 * registers one with its tree's QueryClient; the handler reads that client's
 * at the moment of failure.
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

/** Registers the Todo List of `queryClient`'s tree; returns the unregister. */
export function registerDeleteFocusController(
  queryClient: QueryClient,
  next: DeleteFocusController
): () => void {
  return registerController(queryClient, "deleteFocus", next)
}

/**
 * Records where a delete in `queryClient`'s tree moved focus, for the
 * failure restore rule.
 */
export function recordDeleteFocus(
  queryClient: QueryClient,
  id: string,
  element: Element | null
): void {
  getFailureControllers(queryClient).movedFocus.set(id, element)
}

/**
 * The delete failure UI for `id` (the row is already back at its
 * `compareTodos` position with its confirmed state). One plain toast; the
 * API's `message` is never shown. If focus is still where the delete moved
 * it (or free, see `focusIsFreeOr`), it goes to the restored row's checkbox;
 * otherwise it stays put.
 */
function deleteFailed(queryClient: QueryClient, id: string): void {
  const { movedFocus, deleteFocus } = getFailureControllers(queryClient)
  const moved = movedFocus.get(id)
  movedFocus.delete(id)
  const focus = focusIsFreeOr(() => !!moved && document.activeElement === moved)
  if (focus) deleteFocus?.focusRow(id)
  showErrorToast(DELETE_FAILED_COPY)
}

/** The delete kind's failure handler. */
export function showDeleteFailure({
  vars,
  queryClient,
}: DeleteTodoFailure): void {
  deleteFailed(queryClient, vars.id)
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
    const { vars, queryClient } = failure
    const { id } = vars
    if (failure.state === null) {
      const controllers = getFailureControllers(queryClient)
      controllers.movedFocus.delete(id)
      if (resend) controllers.deleteFocus?.resendDelete(id)
      return
    }
    deleteFailed(queryClient, id)
  }
}
