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
    update: vi.fn<TodoRepository["update"]>().mockResolvedValue(null),
    delete: vi.fn<TodoRepository["delete"]>().mockResolvedValue(false),
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

async function appErrorOf(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

describe("TodoService.update", () => {
  it("normalizes the Description and passes only the present keys", async () => {
    const repo = stubRepository([])
    vi.mocked(repo.update).mockResolvedValue(todo)
    const service = createTodoService({ todoRepository: repo })

    await expect(
      service.update(ctx, todo.id, { description: "  a\r\nb " })
    ).resolves.toEqual(todo)
    expect(repo.update).toHaveBeenLastCalledWith(ctx, todo.id, {
      description: "a b",
    })

    await service.update(ctx, todo.id, { completed: false })
    expect(repo.update).toHaveBeenLastCalledWith(ctx, todo.id, {
      completed: false,
    })
  })

  it("turns a repository miss into NOT_FOUND", async () => {
    const repo = stubRepository([])
    const service = createTodoService({ todoRepository: repo })

    const error = await appErrorOf(
      service.update(ctx, todo.id, { completed: true })
    )
    expect(error.code).toBe("NOT_FOUND")
    expect(error.statusCode).toBe(404)
  })

  it.each([
    ["empty", "  \n "],
    ["too_long", "x".repeat(501)],
    ["invalid", "a\u0000b"],
  ])(
    "an invalid Description (%s) never reaches the repository",
    async (reason, description) => {
      const repo = stubRepository([])
      const service = createTodoService({ todoRepository: repo })

      const error = await appErrorOf(
        service.update(ctx, todo.id, { description, completed: true })
      )
      expect(error.code).toBe("VALIDATION_ERROR")
      expect(error.details).toEqual([{ field: "description", reason }])
      expect(repo.update).not.toHaveBeenCalled()
    }
  )

  it("never issues an empty write", async () => {
    const repo = stubRepository([])
    const service = createTodoService({ todoRepository: repo })

    const error = await appErrorOf(service.update(ctx, todo.id, {}))
    expect(error.code).toBe("VALIDATION_ERROR")
    expect(repo.update).not.toHaveBeenCalled()
  })
})

describe("TodoService.delete", () => {
  it("resolves when a row was deleted", async () => {
    const repo = stubRepository([])
    vi.mocked(repo.delete).mockResolvedValue(true)
    const service = createTodoService({ todoRepository: repo })

    await expect(service.delete(ctx, todo.id)).resolves.toBeUndefined()
    expect(repo.delete).toHaveBeenCalledWith(ctx, todo.id)
  })

  it("turns a repository miss into NOT_FOUND", async () => {
    const repo = stubRepository([])
    const service = createTodoService({ todoRepository: repo })

    const error = await appErrorOf(service.delete(ctx, todo.id))
    expect(error.code).toBe("NOT_FOUND")
  })
})
