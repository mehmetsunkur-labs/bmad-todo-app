import type { QueryClient } from "@tanstack/react-query"

import type { AddRowController } from "./create-failure"
import type { DeleteFocusController } from "./delete-failure"
import type { EditController } from "./edit-failure"

/**
 * The UI a QueryClient's failure handlers act on: one app tree's mounted
 * Add row and Todo List, plus where its deletes moved focus. Kept per
 * QueryClient (as `getTodoSync` keeps the sync state), so with two app trees
 * a failure is handled only by the UI of the tree whose write failed; each
 * failure carries its `queryClient` for the lookup.
 *
 * The rule for UI state and announcements:
 * - A failure handler that needs UI state reads it from its client's
 *   controllers here, at the moment of failure (toggle needs none: it only
 *   shows a toast).
 * - A success announcement ("Todo added", "Todo updated", "Todo deleted")
 *   stays in the component that owns the action.
 * - A Retry announcement goes through `showRetryToast`, and nowhere else.
 */
export interface FailureControllers {
  addRow: AddRowController | null
  deleteFocus: DeleteFocusController | null
  edit: EditController | null
  /** Per deleted id: the element the delete moved focus to. */
  readonly movedFocus: Map<string, Element | null>
}

type ControllerSlot = "addRow" | "deleteFocus" | "edit"

const controllersByClient = new WeakMap<QueryClient, FailureControllers>()

/** The failure controllers of `queryClient`'s app tree (created on first use). */
export function getFailureControllers(
  queryClient: QueryClient
): FailureControllers {
  let controllers = controllersByClient.get(queryClient)
  if (!controllers) {
    controllers = {
      addRow: null,
      deleteFocus: null,
      edit: null,
      movedFocus: new Map(),
    }
    controllersByClient.set(queryClient, controllers)
  }
  return controllers
}

/**
 * Registers `next` in `queryClient`'s `slot`; returns the matching
 * unregister. The unregister clears the slot only while `next` is still the
 * one registered, so a stale cleanup (StrictMode's register, unregister,
 * register, or an effect re-run) never removes the live registration.
 */
export function registerController<S extends ControllerSlot>(
  queryClient: QueryClient,
  slot: S,
  next: NonNullable<FailureControllers[S]>
): () => void {
  const controllers = getFailureControllers(queryClient)
  controllers[slot] = next
  return () => {
    if (controllers[slot] === next) controllers[slot] = null
  }
}
