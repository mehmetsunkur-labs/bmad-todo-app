import { TodoListResponseSchema } from "@todos/shared"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestApp, truncateTodos, type TestApp } from "./helpers"

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe("GET /api/v1/todos", () => {
  let t: TestApp
  beforeAll(() => {
    t = createTestApp()
  })
  beforeEach(() => truncateTodos(t.pool))
  afterAll(() => t.close())

  it("returns 200 {todos: []} when there are no rows", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual({ todos: [] })
  })

  it("orders by createdAt desc, then id desc, with millisecond ISO strings", async () => {
    await t.pool.query(`
      INSERT INTO todos (id, description, completed, created_at, updated_at) VALUES
        ('00000000-0000-7000-8000-000000000001', 'oldest', false,
         '2026-09-24T09:00:00.123Z', '2026-09-24T09:00:00.123Z'),
        ('00000000-0000-7000-8000-00000000000a', 'tie low id', true,
         '2026-09-24T10:00:00.456Z', '2026-09-24T11:00:00.789Z'),
        ('00000000-0000-7000-8000-00000000000b', 'tie high id', false,
         '2026-09-24T10:00:00.456Z', '2026-09-24T10:00:00.456Z')
    `)

    const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({
      todos: [
        {
          id: "00000000-0000-7000-8000-00000000000b",
          description: "tie high id",
          completed: false,
          createdAt: "2026-09-24T10:00:00.456Z",
          updatedAt: "2026-09-24T10:00:00.456Z",
        },
        {
          id: "00000000-0000-7000-8000-00000000000a",
          description: "tie low id",
          completed: true,
          createdAt: "2026-09-24T10:00:00.456Z",
          updatedAt: "2026-09-24T11:00:00.789Z",
        },
        {
          id: "00000000-0000-7000-8000-000000000001",
          description: "oldest",
          completed: false,
          createdAt: "2026-09-24T09:00:00.123Z",
          updatedAt: "2026-09-24T09:00:00.123Z",
        },
      ],
    })
    expect(TodoListResponseSchema.parse(body)).toEqual(body)
  })

  it("uses the database clock and column defaults for new rows", async () => {
    await t.pool.query(
      `INSERT INTO todos (id, description) VALUES ('00000000-0000-7000-8000-000000000001', 'x')`
    )
    const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    const [todo] = res.json().todos
    expect(todo.completed).toBe(false)
    expect(todo.createdAt).toMatch(ISO_MS)
    expect(todo.updatedAt).toBe(todo.createdAt)
  })

  it("parses a response Todo that carries an unknown key, ignoring the key", async () => {
    await t.pool.query(
      `INSERT INTO todos (id, description) VALUES ('00000000-0000-7000-8000-000000000001', 'x')`
    )
    const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    const body = res.json()
    const withExtra = {
      ...body,
      nextCursor: null,
      todos: body.todos.map((todo: object) => ({ ...todo, ownerId: "o-1" })),
    }
    const parsed = TodoListResponseSchema.parse(withExtra)
    expect(parsed).toEqual(body)
    expect(parsed.todos[0]).not.toHaveProperty("ownerId")
  })

  it("logs one request line with no Todo content", async () => {
    await t.pool.query(
      `INSERT INTO todos (id, description) VALUES ('00000000-0000-7000-8000-000000000001', 'secret text')`
    )
    t.logs.clear()
    await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    const lines = t.logs.requestLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ route: "/api/v1/todos", statusCode: 200 })
    expect(JSON.stringify(t.logs.lines)).not.toContain("secret text")
  })
})
