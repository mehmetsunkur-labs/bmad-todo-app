import { describe, expect, it } from "vitest"

import {
  compareTodos,
  CreateTodoRequestSchema,
  normalizeDescription,
  TODO_PATH,
  TodoIdParamsSchema,
  TodoListResponseSchema,
  TodoSchema,
  UpdateTodoRequestSchema,
} from "../src"

const todo = (id: string, createdAt: string) => ({ id, createdAt })

describe("compareTodos", () => {
  it("orders by createdAt descending", () => {
    const older = todo(
      "00000000-0000-4000-8000-000000000009",
      "2026-09-24T09:14:00.000Z"
    )
    const newer = todo(
      "00000000-0000-4000-8000-000000000001",
      "2026-09-24T09:14:00.001Z"
    )
    expect([older, newer].sort(compareTodos)).toEqual([newer, older])
    expect(compareTodos(newer, older)).toBeLessThan(0)
    expect(compareTodos(older, newer)).toBeGreaterThan(0)
  })

  it("breaks createdAt ties by id descending", () => {
    const t = "2026-09-24T09:14:00.000Z"
    const a = todo("00000000-0000-4000-8000-00000000000a", t)
    const b = todo("00000000-0000-4000-8000-00000000000b", t)
    const c = todo("10000000-0000-4000-8000-000000000000", t)
    expect([a, c, b].sort(compareTodos)).toEqual([c, b, a])
  })

  it("returns 0 for the same id and createdAt", () => {
    const a = todo(
      "00000000-0000-4000-8000-000000000001",
      "2026-09-24T09:14:00.000Z"
    )
    expect(compareTodos(a, { ...a })).toBe(0)
  })
})

describe("TodoSchema", () => {
  const valid = {
    id: "0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b",
    description: "Buy milk",
    completed: false,
    createdAt: "2026-09-24T09:14:00.000Z",
    updatedAt: "2026-09-24T09:14:00.000Z",
  }

  it("strips unknown keys instead of rejecting them", () => {
    expect(TodoSchema.parse({ ...valid, ownerId: "x" })).toEqual(valid)
    expect(
      TodoListResponseSchema.parse({
        todos: [{ ...valid, extra: 1 }],
        next: null,
      })
    ).toEqual({ todos: [valid] })
  })

  it("requires millisecond-precision UTC timestamps", () => {
    expect(
      TodoSchema.safeParse({ ...valid, createdAt: "2026-09-24T09:14:00Z" })
        .success
    ).toBe(false)
    expect(
      TodoSchema.safeParse({ ...valid, createdAt: "not a date" }).success
    ).toBe(false)
  })
})

describe("normalizeDescription", () => {
  it.each([
    ["Buy milk", "Buy milk"],
    ["  Buy\r\nmilk\n ", "Buy milk"],
    ["a\rb", "a b"],
    ["a\nb", "a b"],
    ["a\r\nb", "a b"],
    ["a\n\r\nb", "a  b"],
    ["a\r\rb", "a  b"],
    ["\r\n\n", ""],
    ["   ", ""],
    ["", ""],
    ["\tx\t", "x"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeDescription(raw)).toBe(expected)
  })
})

describe("CreateTodoRequestSchema", () => {
  const valid = {
    id: "0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b",
    description: "Buy milk",
  }

  it("accepts an id and a description, in any UUID case", () => {
    expect(CreateTodoRequestSchema.parse(valid)).toEqual(valid)
    const upper = { ...valid, id: valid.id.toUpperCase() }
    expect(CreateTodoRequestSchema.parse(upper)).toEqual(upper)
  })

  it("checks only the shape: an empty or over-long description passes", () => {
    expect(
      CreateTodoRequestSchema.safeParse({ ...valid, description: "" }).success
    ).toBe(true)
    expect(
      CreateTodoRequestSchema.safeParse({
        ...valid,
        description: "x".repeat(600),
      }).success
    ).toBe(true)
  })

  it("rejects unknown keys, including client timestamps", () => {
    const result = CreateTodoRequestSchema.safeParse({
      ...valid,
      createdAt: "2026-09-24T09:14:00.000Z",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["createdAt"],
    })
  })

  it.each([
    ["a non-UUID id", { ...valid, id: "abc" }],
    ["a numeric id", { ...valid, id: 123 }],
    ["a missing id", { description: "x" }],
    ["a missing description", { id: valid.id }],
    ["a null description", { ...valid, description: null }],
    ["a numeric description", { ...valid, description: 1 }],
  ])("rejects %s", (_name, body) => {
    expect(CreateTodoRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe("TODO_PATH", () => {
  it("is the single-Todo route under the todos path", () => {
    expect(TODO_PATH).toBe("/api/v1/todos/:id")
  })
})

describe("TodoIdParamsSchema", () => {
  const id = "0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b"

  it.each([
    ["a v7 uuid", id],
    ["an upper-case uuid", id.toUpperCase()],
    ["a v4 uuid", "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f"],
  ])("accepts %s", (_name, value) => {
    expect(TodoIdParamsSchema.parse({ id: value })).toEqual({ id: value })
  })

  it.each([
    ["a non-uuid id", { id: "not-a-uuid" }],
    ["an empty id", { id: "" }],
    ["a missing id", {}],
    ["an extra key", { id, other: "x" }],
  ])("rejects %s", (_name, params) => {
    expect(TodoIdParamsSchema.safeParse(params).success).toBe(false)
  })
})

describe("UpdateTodoRequestSchema", () => {
  it.each([
    ["only description", { description: "Buy milk" }],
    ["only completed", { completed: true }],
    ["completed: false", { completed: false }],
    ["both keys", { description: "x", completed: true }],
    ["an empty description (the service checks length)", { description: "" }],
  ])("accepts %s", (_name, body) => {
    expect(UpdateTodoRequestSchema.parse(body)).toEqual(body)
  })

  it("rejects {} with one root-level custom issue", () => {
    const result = UpdateTodoRequestSchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]).toMatchObject({ code: "custom", path: [] })
  })

  it.each([
    ["a null completed", { completed: null }, "completed"],
    ["a null description", { description: null }, "description"],
    ["a string completed", { completed: "true" }, "completed"],
    ["a numeric description", { description: 1 }, "description"],
  ])("rejects %s", (_name, body, field) => {
    const result = UpdateTodoRequestSchema.safeParse(body)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_type",
      path: [field],
    })
  })

  it("rejects unknown keys, including client timestamps", () => {
    const result = UpdateTodoRequestSchema.safeParse({
      completed: true,
      createdAt: "2026-09-24T09:14:00.000Z",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["createdAt"],
    })
  })
})
