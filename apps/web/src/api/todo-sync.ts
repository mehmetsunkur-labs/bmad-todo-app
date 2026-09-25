import type { QueryClient } from "@tanstack/react-query"
import type { Todo } from "@todos/shared"

/**
 * An optimistic operation not yet confirmed by the server. Story 1.4 and
 * Epic 2 define the concrete ops (create, edit, toggle, delete).
 */
export interface PendingOp {
  readonly kind: string
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
   * list is confirmed as `null`.
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
        if (!listed.has(id)) confirmed.set(id, null)
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
