import { updateTodo } from "../http"
import {
  editOp,
  notFoundMeansDeleted,
  type TodoMutationFailure,
} from "../todo-sync"
import { useTodoMutation, type TodoHookConfig } from "./use-todo-mutation"

/** One edit: the new, already normalized Description. */
export interface EditTodoVars {
  readonly id: string
  readonly description: string
}

export type EditTodoFailure = TodoMutationFailure<EditTodoVars>

const EDIT_CONFIG: TodoHookConfig<EditTodoVars> = {
  kind: "edit",
  op: (vars) => editOp(vars.description),
  request: (vars) => updateTodo(vars.id, { description: vars.description }),
  failureState: notFoundMeansDeleted,
}

/**
 * The edit hook, built on `useTodoMutation` (kind `"edit"`): the row shows the
 * new Description at once and `PATCH { description }` confirms it, in the
 * mutation scope `{ id }` so writes to one Todo run in order. A `404` maps
 * the Todo to "not on the server" (the row is removed); any other failure
 * rolls it back to its confirmed state. `onFailure` is feature-owned UI and
 * runs exactly once per real failure. The returned trigger is stable while
 * `onFailure` is.
 */
export function useEditTodo(
  onFailure: (failure: EditTodoFailure) => void
): (vars: EditTodoVars) => void {
  return useTodoMutation(EDIT_CONFIG, onFailure)
}
