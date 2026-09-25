import {
  DESCRIPTION_MAX,
  normalizeDescription,
  type CreateTodoRequest,
  type ErrorReason,
  type Todo,
} from "@todos/shared"

import type { RequestContext } from "../context"
import { AppError } from "../errors"
import type { TodoRepository } from "../repositories/todo-repository"

export interface TodoService {
  /** Every Todo, ordered by `compareTodos`. */
  list(ctx: RequestContext): Promise<Todo[]>
  /**
   * Idempotent create (AD-4). `created` is true for a new row and false for a
   * replay of the same `id` with the same normalized Description. A replay with
   * a different Description throws `CONFLICT`.
   */
  create(
    ctx: RequestContext,
    input: CreateTodoRequest
  ): Promise<{ todo: Todo; created: boolean }>
}

// Text PostgreSQL can't store verbatim: NUL fails the insert (22021) and a
// lone surrogate is stored as U+FFFD, breaking replays.
const LONE_SURROGATE = /\p{Cs}/u

/**
 * Validates a normalized Description (AD-3): 1–DESCRIPTION_MAX UTF-16 units,
 * storable as-is.
 */
function descriptionError(description: string): ErrorReason | undefined {
  if (description.length === 0) return "empty"
  if (description.length > DESCRIPTION_MAX) return "too_long"
  if (description.includes("\u0000") || LONE_SURROGATE.test(description)) {
    return "invalid"
  }
  return undefined
}

export function createTodoService(deps: {
  todoRepository: TodoRepository
}): TodoService {
  const repo = deps.todoRepository

  return {
    async list(ctx) {
      return repo.list(ctx)
    },

    async create(ctx, input) {
      const description = normalizeDescription(input.description)
      const reason = descriptionError(description)
      if (reason) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "description", reason }],
        })
      }

      const values = { id: input.id, description }
      const inserted = await repo.create(ctx, values)
      if (inserted) return { todo: inserted, created: true }

      const existing = await repo.findById(ctx, input.id)
      if (existing) {
        if (existing.description !== description) throw new AppError("CONFLICT")
        return { todo: existing, created: false }
      }

      // The conflicting row vanished between the insert and the select: try
      // the insert once more, then give up.
      const retried = await repo.create(ctx, values)
      if (retried) return { todo: retried, created: true }
      throw new AppError("INTERNAL")
    },
  }
}
