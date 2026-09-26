import { updateTodo } from "../http"
import {
  notFoundMeansDeleted,
  toggleOp,
  type TodoMutationFailure,
} from "../todo-sync"
import { useTodoMutation, type TodoHookConfig } from "./use-todo-mutation"

/** One toggle: the absolute `completed` to set (never a flip). */
export interface ToggleTodoVars {
  readonly id: string
  readonly completed: boolean
}

export type ToggleTodoFailure = TodoMutationFailure<ToggleTodoVars>

const TOGGLE_CONFIG: TodoHookConfig<ToggleTodoVars> = {
  kind: "toggle",
  op: (vars) => toggleOp(vars.completed),
  request: (vars) => updateTodo(vars.id, { completed: vars.completed }),
  failureState: notFoundMeansDeleted,
}

/**
 * The toggle hook, built on `useTodoMutation` (kind `"toggle"`): the row shows
 * the new `completed` at once and `PATCH { completed }` confirms it, in the
 * mutation scope `{ id }` so toggles of one Todo run in order. A `404` maps
 * the Todo to "not on the server" (the row is removed); any other failure
 * rolls it back to its confirmed state. `onFailure` is feature-owned UI and
 * runs exactly once per real failure.
 */
export function useToggleTodo(
  onFailure: (failure: ToggleTodoFailure) => void
): (vars: ToggleTodoVars) => void {
  return useTodoMutation(TOGGLE_CONFIG, onFailure)
}
