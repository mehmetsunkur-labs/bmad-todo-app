import {
  DESCRIPTION_MAX,
  normalizeDescription,
  type CreateTodoRequest,
  type ErrorReason,
  type Todo,
  type UpdateTodoRequest,
} from "@todos/shared"

import type { RequestContext } from "../context"
import { AppError } from "../errors"
import type { TodoPatch, TodoRepository } from "../repositories/todo-repository"

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
  /**
   * Partial update in one write. A present Description is normalized and
   * validated as in create (`VALIDATION_ERROR` on `description`, nothing
   * written). `updatedAt` moves only when a stored value changes; a no-op
   * returns the stored Todo unchanged. Unknown `id` throws `NOT_FOUND`.
   */
  update(
    ctx: RequestContext,
    id: string,
    input: UpdateTodoRequest
  ): Promise<Todo>
  /** Deletes the Todo in one write. Unknown `id` throws `NOT_FOUND`. */
  delete(ctx: RequestContext, id: string): Promise<void>
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

/** Normalizes a raw Description, or throws the create/update validation error. */
function validDescription(raw: string): string {
  const description = normalizeDescription(raw)
  const reason = descriptionError(description)
  if (reason) {
    throw new AppError("VALIDATION_ERROR", {
      details: [{ field: "description", reason }],
    })
  }
  return description
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
      const description = validDescription(input.description)
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

    async update(ctx, id, input) {
      const patch: TodoPatch = {}
      if (input.description !== undefined) {
        patch.description = validDescription(input.description)
      }
      if (input.completed !== undefined) patch.completed = input.completed
      if (patch.description === undefined && patch.completed === undefined) {
        // The request schema already rejects `{}`; never issue an empty write.
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "", reason: "invalid" }],
        })
      }

      const updated = await repo.update(ctx, id, patch)
      if (!updated) throw new AppError("NOT_FOUND")
      return updated
    },

    async delete(ctx, id) {
      const deleted = await repo.delete(ctx, id)
      if (!deleted) throw new AppError("NOT_FOUND")
    },
  }
}
