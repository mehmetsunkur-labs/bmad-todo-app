import type { Todo } from "@todos/shared"
import { describe, expect, it, vi } from "vitest"

import { AppError } from "../src/errors"
import type { TodoRepository } from "../src/repositories/todo-repository"
import { createTodoService } from "../src/services/todo-service"

const ctx = { requestId: "req-1" }
const input = { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", description: "x" }
const todo: Todo = {
  id: input.id,
  description: "x",
  completed: false,
  createdAt: "2026-09-25T09:00:00.000Z",
  updatedAt: "2026-09-25T09:00:00.000Z",
}

function stubRepository(createResults: (Todo | null)[]) {
  const create = vi.fn<TodoRepository["create"]>()
  for (const result of createResults) create.mockResolvedValueOnce(result)
  const repo: TodoRepository = {
    list: vi.fn(),
    create,
    findById: vi.fn<TodoRepository["findById"]>().mockResolvedValue(null),
  }
  return repo
}

describe("TodoService.create replay race (conflict, then the row is gone)", () => {
  it("retries the insert once and returns created: true when it succeeds", async () => {
    const repo = stubRepository([null, todo])
    const service = createTodoService({ todoRepository: repo })

    await expect(service.create(ctx, input)).resolves.toEqual({
      todo,
      created: true,
    })
    expect(repo.create).toHaveBeenCalledTimes(2)
    expect(repo.create).toHaveBeenNthCalledWith(2, ctx, {
      id: input.id,
      description: "x",
    })
    expect(repo.findById).toHaveBeenCalledTimes(1)
  })

  it("throws INTERNAL when the retried insert conflicts again", async () => {
    const repo = stubRepository([null, null])
    const service = createTodoService({ todoRepository: repo })

    const error = await service.create(ctx, input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe("INTERNAL")
    expect(repo.create).toHaveBeenCalledTimes(2)
  })
})
