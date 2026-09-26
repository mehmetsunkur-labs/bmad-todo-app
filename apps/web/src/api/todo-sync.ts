import {
  MutationObserver,
  type MutationObserverOptions,
  type QueryClient,
} from "@tanstack/react-query"
import { compareTodos, type Todo } from "@todos/shared"

import { isNotFound } from "./http"
import { TODOS_QUERY_KEY } from "./query-client"

/** Every kind of write to one Todo (AD-12). */
export type TodoWriteKind = "create" | "edit" | "toggle" | "delete"

/**
 * An optimistic operation not yet confirmed by the server. `apply` derives
 * the rendered Todo from the state before it (`null` = no Todo). Story 1.4
 * defines the create op, Story 2.2 the toggle op, Story 2.3 the delete op,
 * Story 2.4 the edit op.
 */
export interface PendingOp {
  readonly kind: TodoWriteKind
  apply(previous: Todo | null): Todo | null
}

/**
 * Per-Todo sync bookkeeping (AD-12), all keyed by Todo id. This is the only
 * Todo data the client keeps outside the TanStack Query cache.
 */
export interface TodoSync {
  /** The last state the server returned; `null` = not on the server. */
  readonly confirmed: Map<string, Todo | null>
  /** Optimistic ops not yet confirmed, in the order the user made them. */
  readonly pending: Map<string, PendingOp[]>
  /** Incremented per id on each real write failure. */
  readonly generation: Map<string, number>
  /**
   * Seeds `confirmed` from a successful list fetch: every listed Todo is
   * confirmed as returned, and a previously confirmed id missing from the
   * list is confirmed as `null`, unless it has pending ops (their writes
   * settle it instead).
   */
  seedFromList(todos: readonly Todo[]): void
}

export function createTodoSync(): TodoSync {
  const confirmed = new Map<string, Todo | null>()
  const pending = new Map<string, PendingOp[]>()
  const generation = new Map<string, number>()
  return {
    confirmed,
    pending,
    generation,
    seedFromList(todos) {
      const listed = new Set<string>()
      for (const todo of todos) {
        confirmed.set(todo.id, todo)
        listed.add(todo.id)
      }
      for (const id of confirmed.keys()) {
        if (!listed.has(id) && !pending.has(id)) confirmed.set(id, null)
      }
    },
  }
}

const syncByClient = new WeakMap<QueryClient, TodoSync>()

/**
 * The sync state that belongs to a QueryClient's `['todos']` cache, so each
 * cache (one in the app, a fresh one per test) has its own bookkeeping.
 */
export function getTodoSync(queryClient: QueryClient): TodoSync {
  let sync = syncByClient.get(queryClient)
  if (!sync) {
    sync = createTodoSync()
    syncByClient.set(queryClient, sync)
  }
  return sync
}

/**
 * The optimistic create: a new, active Todo with the client's current time
 * as a provisional `createdAt`/`updatedAt`, replaced by the server's values
 * on success. It never overwrites a Todo the server already confirmed.
 */
export function createOp(
  id: string,
  description: string,
  now: string = new Date().toISOString()
): PendingOp {
  return {
    kind: "create",
    apply: (previous) =>
      previous ?? {
        id,
        description,
        completed: false,
        createdAt: now,
        updatedAt: now,
      },
  }
}

/**
 * The optimistic toggle: the previous state with an absolute `completed`
 * (never a flip), so queued toggles render in order. No Todo stays no Todo.
 */
export function toggleOp(completed: boolean): PendingOp {
  return {
    kind: "toggle",
    apply: (previous) => previous && { ...previous, completed },
  }
}

/**
 * The optimistic edit: the previous state with the new (normalized)
 * Description; every other field, `createdAt` included, is kept, so the Todo
 * keeps its position. No Todo stays no Todo.
 */
export function editOp(description: string): PendingOp {
  return {
    kind: "edit",
    apply: (previous) => previous && { ...previous, description },
  }
}

/**
 * The optimistic delete: no Todo, whatever came before. The row leaves the
 * list at once; a failure re-renders it from `confirmed`.
 */
export function deleteOp(): PendingOp {
  return { kind: "delete", apply: () => null }
}

/** A Todo's rendered state: `confirmed` with its `pending` ops applied in order. */
export function renderedTodo(sync: TodoSync, id: string): Todo | null {
  let state = sync.confirmed.get(id) ?? null
  for (const op of sync.pending.get(id) ?? []) state = op.apply(state)
  return state
}

/**
 * The rendered list after a successful fetch (seeded first): each listed
 * Todo with its pending ops re-applied (dropping any that render as `null`),
 * plus every pending id not listed that renders as a Todo (a pending create),
 * sorted by `compareTodos`.
 */
export function renderedList(sync: TodoSync, listed: readonly Todo[]): Todo[] {
  const ids = new Set(listed.map((todo) => todo.id))
  for (const id of sync.pending.keys()) ids.add(id)
  const todos: Todo[] = []
  for (const id of ids) {
    const todo = renderedTodo(sync, id)
    if (todo) todos.push(todo)
  }
  return todos.sort(compareTodos)
}

/**
 * Writes that one id's rendered state into `['todos']`: replaces, inserts, or
 * removes it, placed by `compareTodos`. Every other row keeps its object, and
 * no whole-list snapshot is ever restored.
 */
export function renderTodo(queryClient: QueryClient, id: string): void {
  const todo = renderedTodo(getTodoSync(queryClient), id)
  queryClient.setQueryData<Todo[]>(TODOS_QUERY_KEY, (list) => {
    if (!list) return list
    const others = list.filter((t) => t.id !== id)
    if (!todo) return others.length === list.length ? list : others
    const index = others.findIndex((t) => compareTodos(todo, t) < 0)
    const at = index === -1 ? others.length : index
    return [...others.slice(0, at), todo, ...others.slice(at)]
  })
}

/**
 * Thrown by `mutationFn`, without a network call, when an earlier op on the
 * same Todo failed after this one was queued (its generation changed).
 */
export class DroppedError extends Error {
  constructor() {
    super("Dropped: an earlier change to this todo failed")
    this.name = "DroppedError"
  }
}

export interface TodoMutationFailure<TVars> {
  readonly vars: TVars
  readonly error: unknown
  /** Runs the same mutation again with the same variables (same `id`). */
  readonly retry: () => void
  /**
   * The kinds of the ops queued behind the failed one on the same Todo,
   * in order: dropped by this failure, never sent.
   */
  readonly dropped: readonly TodoWriteKind[]
  /** What the Todo renders as after the rollback (`null` = no row). */
  readonly state: Todo | null
  /** The QueryClient the write ran against (its app tree's failure UI). */
  readonly queryClient: QueryClient
}

export interface TodoMutationConfig<TVars extends { id: string }> {
  /** The optimistic op for these variables. */
  op(vars: TVars): PendingOp
  /** The HTTP call; resolves to the confirmed Todo, or `null` once deleted. */
  request(vars: TVars): Promise<Todo | null>
  /**
   * The kind's failure mapping: what a real failure says about the server's
   * state. A Todo (or `null` = not on the server) replaces `confirmed(id)`
   * before the rollback; `undefined` keeps it (the default).
   */
  failureState?(error: unknown, vars: TVars): Todo | null | undefined
  /** Called exactly once per real failure, after the rollback. */
  onFailure(failure: TodoMutationFailure<TVars>): void
}

/**
 * The failure mapping for PATCH: a `404 NOT_FOUND` means the Todo is gone
 * from the server (`null`, so the row is removed); anything else leaves
 * `confirmed` as it was.
 */
export function notFoundMeansDeleted(error: unknown): null | undefined {
  return isNotFound(error) ? null : undefined
}

export interface TodoMutation<TVars extends { id: string }> {
  readonly kind: TodoWriteKind
  /** The TanStack Query options for one write, scoped to `vars.id`. */
  options(
    queryClient: QueryClient,
    vars: TVars
  ): MutationObserverOptions<Todo | null, unknown, TVars, unknown>
  /** Runs one write. Never rejects: failures go to `onFailure`. */
  mutate(queryClient: QueryClient, vars: TVars): Promise<void>
}

/**
 * The single write helper (AD-12). Every write to one Todo runs in the
 * mutation scope `{ id }`, so writes to the same Todo run in order:
 *
 * - `onMutate`: record `generation(id)`, append the op, re-render the id.
 * - `mutationFn`: if the generation changed, throw `DroppedError` (no fetch).
 * - `onSuccess`: set `confirmed(id)`, remove the op, re-render.
 * - `onError` with `DroppedError`: remove the op, nothing else.
 * - `onError` otherwise: bump the generation, apply the kind's
 *   `failureState` mapping to `confirmed(id)`, clear `pending(id)` (the
 *   queued ops' kinds are reported as `dropped`), re-render from
 *   `confirmed(id)`, and call `onFailure` exactly once with that `state`.
 *
 * Never calls `invalidateQueries`, and keeps the pinned mutation defaults.
 */
export function createTodoMutation<TVars extends { id: string }>(
  kind: TodoWriteKind,
  config: TodoMutationConfig<TVars>
): TodoMutation<TVars> {
  const mutation: TodoMutation<TVars> = {
    kind,
    options(queryClient, vars) {
      const sync = getTodoSync(queryClient)
      const { id } = vars
      // Per-write state: mutationFn doesn't receive onMutate's result.
      let recordedGeneration = 0
      let op: PendingOp | undefined

      function removeOp() {
        const ops = sync.pending.get(id)
        if (!ops || !op) return
        const rest = ops.filter((o) => o !== op)
        if (rest.length > 0) sync.pending.set(id, rest)
        else sync.pending.delete(id)
      }

      return {
        mutationKey: ["todos", kind],
        scope: { id },
        onMutate: () => {
          recordedGeneration = sync.generation.get(id) ?? 0
          op = config.op(vars)
          sync.pending.set(id, [...(sync.pending.get(id) ?? []), op])
          renderTodo(queryClient, id)
        },
        mutationFn: async () => {
          if ((sync.generation.get(id) ?? 0) !== recordedGeneration) {
            throw new DroppedError()
          }
          return config.request(vars)
        },
        onSuccess: (todo) => {
          sync.confirmed.set(id, todo)
          removeOp()
          renderTodo(queryClient, id)
        },
        onError: (error) => {
          if (error instanceof DroppedError) {
            removeOp()
            return
          }
          sync.generation.set(id, (sync.generation.get(id) ?? 0) + 1)
          const known = config.failureState?.(error, vars)
          if (known !== undefined) sync.confirmed.set(id, known)
          const dropped = (sync.pending.get(id) ?? [])
            .filter((o) => o !== op)
            .map((o) => o.kind)
          sync.pending.delete(id)
          renderTodo(queryClient, id)
          config.onFailure({
            vars,
            error,
            retry: () => void mutation.mutate(queryClient, vars),
            dropped,
            state: renderedTodo(sync, id),
            queryClient,
          })
        },
      }
    },
    async mutate(queryClient, vars) {
      const observer = new MutationObserver(
        queryClient,
        mutation.options(queryClient, vars)
      )
      try {
        await observer.mutate(vars)
      } catch {
        // Already handled in onError (rollback + onFailure, or dropped).
      }
    },
  }
  return mutation
}
