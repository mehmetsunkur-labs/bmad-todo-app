import {
  TodoListResponseSchema,
  TodoSchema,
  type ErrorDetail,
} from "@todos/shared"
import type { LightMyRequestResponse } from "fastify"
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

describe("POST /api/v1/todos", () => {
  const url = "/api/v1/todos"
  const ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
  const VALIDATION_BODY = {
    error: { code: "VALIDATION_ERROR", message: "The request is invalid." },
  }
  const CONFLICT_BODY = {
    error: {
      code: "CONFLICT",
      message: "The request conflicts with the stored resource.",
    },
  }

  let t: TestApp
  beforeAll(() => {
    t = createTestApp()
  })
  beforeEach(() => truncateTodos(t.pool))
  afterAll(() => t.close())

  const post = (payload: unknown) =>
    t.app.inject({ method: "POST", url, payload: payload as object })

  async function rows() {
    const { rows } = await t.pool.query(
      `SELECT id, description, completed, created_at, updated_at FROM todos ORDER BY id`
    )
    return rows as {
      id: string
      description: string
      completed: boolean
      created_at: Date
      updated_at: Date
    }[]
  }

  function expectValidationError(
    res: LightMyRequestResponse,
    status: number,
    details?: ErrorDetail[]
  ) {
    expect(res.statusCode).toBe(status)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual(
      details
        ? { error: { ...VALIDATION_BODY.error, details } }
        : VALIDATION_BODY
    )
  }

  it("creates a Todo: 201, normalized Description, DB-clock timestamps, one row", async () => {
    const before = await t.pool.query<{ now: Date }>("SELECT now() AS now")
    const res = await post({ id: ID, description: "  Buy\r\nmilk\n " })
    expect(res.statusCode).toBe(201)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    const body = res.json()
    expect(body).toEqual({
      id: ID,
      description: "Buy milk",
      completed: false,
      createdAt: expect.stringMatching(ISO_MS),
      updatedAt: body.createdAt,
    })
    expect(TodoSchema.parse(body)).toEqual(body)
    expect(Date.parse(body.createdAt)).toBeGreaterThanOrEqual(
      Math.floor(before.rows[0]!.now.getTime())
    )

    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      id: ID,
      description: "Buy milk",
      completed: false,
    })
    expect(stored[0]!.created_at.toISOString()).toBe(body.createdAt)
    expect(stored[0]!.updated_at.toISOString()).toBe(body.updatedAt)

    const list = await t.app.inject({ method: "GET", url })
    expect(list.json()).toEqual({ todos: [body] })
  })

  it.each([
    ["wrapped in spaces", `  ${"x".repeat(500)}  `],
    ["followed by a line break", `${"x".repeat(500)}\n`],
  ])("trims to the limit: 500 chars %s → 201", async (_name, description) => {
    const res = await post({ id: ID, description })
    expect(res.statusCode).toBe(201)
    expect(res.json().description).toBe("x".repeat(500))
    const stored = await rows()
    expect(stored.map((r) => r.description)).toEqual(["x".repeat(500)])
  })

  it("replay with the same normalized Description → 200 with the stored Todo, one row", async () => {
    const first = await post({ id: ID, description: "Buy milk" })
    expect(first.statusCode).toBe(201)
    const storedBefore = await rows()

    const replay = await post({ id: ID, description: " Buy\nmilk " })
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(first.json())
    expect(await rows()).toEqual(storedBefore)
  })

  it("accepts any UUID case and returns the canonical lowercase id", async () => {
    const upper = ID.toUpperCase()
    const res = await post({ id: upper, description: "x" })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toBe(ID)

    const replay = await post({ id: upper, description: "x" })
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(res.json())
    expect(await rows()).toHaveLength(1)
  })

  it("replay with a different Description → 409 CONFLICT, row unchanged", async () => {
    await post({ id: ID, description: "Buy milk" })
    const storedBefore = await rows()

    const res = await post({ id: ID, description: "Buy bread" })
    expect(res.statusCode).toBe(409)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual(CONFLICT_BODY)
    expect(await rows()).toEqual(storedBefore)
  })

  it("concurrent duplicates → one 201, one 200, exactly one row", async () => {
    const payload = { id: ID, description: "Buy milk" }
    const results = await Promise.all([post(payload), post(payload)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 201])
    expect(results[0]!.json()).toEqual(results[1]!.json())
    expect(await rows()).toHaveLength(1)
  })

  it("concurrent creates, same id, different Descriptions → one 201, one 409, one row", async () => {
    const results = await Promise.all([
      post({ id: ID, description: "A" }),
      post({ id: ID, description: "B" }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409])
    const created = results.find((r) => r.statusCode === 201)!
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.description).toBe(created.json().description)
  })

  it.each([
    ["a NUL character", "a\u0000b"],
    ["a lone high surrogate", "a\ud800b"],
    ["a lone low surrogate", "a\udc00b"],
  ])(
    "unstorable Description (%s) → 400 invalid, no row",
    async (_name, description) => {
      const res = await post({ id: ID, description })
      expectValidationError(res, 400, [
        { field: "description", reason: "invalid" },
      ])
      expect(await rows()).toHaveLength(0)
    }
  )

  it.each([[""], ["   "], ["\r\n\n"]])(
    "empty Description %j → 400 empty, no row",
    async (description) => {
      const res = await post({ id: ID, description })
      expectValidationError(res, 400, [
        { field: "description", reason: "empty" },
      ])
      expect(await rows()).toHaveLength(0)
    }
  )

  it.each([
    ["501 ASCII chars", "x".repeat(501)],
    ["499 chars plus one astral emoji (2 units)", `${"x".repeat(499)}😀`],
    [
      "501 chars after line breaks become spaces",
      `${"x".repeat(250)}\r\n${"x".repeat(250)}`,
    ],
  ])("too long: %s → 400 too_long, no row", async (_name, description) => {
    const res = await post({ id: ID, description })
    expectValidationError(res, 400, [
      { field: "description", reason: "too_long" },
    ])
    expect(await rows()).toHaveLength(0)
  })

  it("500 units including an astral emoji → 201", async () => {
    const description = `${"x".repeat(498)}😀`
    const res = await post({ id: ID, description })
    expect(res.statusCode).toBe(201)
    expect(res.json().description).toBe(description)
  })

  it.each([
    ["a non-UUID id", { id: "abc", description: "x" }],
    ["a missing id", { description: "x" }],
    ["a numeric id", { id: 123, description: "x" }],
    ["a null id", { id: null, description: "x" }],
  ])("bad id (%s) → 400 id invalid, no row", async (_name, payload) => {
    const res = await post(payload)
    expectValidationError(res, 400, [{ field: "id", reason: "invalid" }])
    expect(await rows()).toHaveLength(0)
  })

  it.each([
    ["missing", { id: ID }],
    ["null", { id: ID, description: null }],
    ["a number", { id: ID, description: 1 }],
  ])(
    "description %s → 400 description invalid, no row",
    async (_name, payload) => {
      const res = await post(payload)
      expectValidationError(res, 400, [
        { field: "description", reason: "invalid" },
      ])
      expect(await rows()).toHaveLength(0)
    }
  )

  it("an extra key (client timestamp) → 400 unknown_field, no row", async () => {
    const res = await post({
      id: ID,
      description: "x",
      createdAt: "2026-09-24T09:14:00.000Z",
    })
    expectValidationError(res, 400, [
      { field: "createdAt", reason: "unknown_field" },
    ])
    expect(await rows()).toHaveLength(0)
  })

  it("an invalid body replaying an existing id → 400, not 200 or 409", async () => {
    await post({ id: ID, description: "Buy milk" })
    const res = await post({ id: ID, description: "Buy milk", completed: true })
    expectValidationError(res, 400, [
      { field: "completed", reason: "unknown_field" },
    ])
    const empty = await post({ id: ID, description: " " })
    expectValidationError(empty, 400, [
      { field: "description", reason: "empty" },
    ])
  })

  describe("framework errors", () => {
    const json = { "content-type": "application/json" }

    it("malformed JSON → 400", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: json,
        payload: '{"id":',
      })
      expectValidationError(res, 400)
      expect(await rows()).toHaveLength(0)
    })

    it("JSON content type with an empty body → 400", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: json,
        payload: "",
      })
      expectValidationError(res, 400)
      expect(await rows()).toHaveLength(0)
    })

    it("body over 16 KiB → 413", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: json,
        payload: JSON.stringify({ id: ID, description: "x".repeat(17 * 1024) }),
      })
      expectValidationError(res, 413)
      expect(await rows()).toHaveLength(0)
    })

    it("text/plain → 415", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: { "content-type": "text/plain" },
        payload: JSON.stringify({ id: ID, description: "x" }),
      })
      expectValidationError(res, 415)
      expect(await rows()).toHaveLength(0)
    })
  })
})

describe("POST /api/v1/todos with the database unreachable", () => {
  const SECRET = "unreachable secret description"
  let t: TestApp
  beforeAll(() => {
    // Nothing listens on port 1: every connection attempt is refused.
    t = createTestApp({
      databaseUrl: "postgres://todos:todos@127.0.0.1:1/todos_test",
    })
  })
  afterAll(() => t.close())

  it("returns 503 UNAVAILABLE, logs no Description text, and keeps serving", async () => {
    t.logs.clear()
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/todos",
      payload: {
        id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
        description: SECRET,
      },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({
      error: { code: "UNAVAILABLE", message: "The database is unreachable." },
    })
    expect(t.logs.lines.some((l) => l.msg === "request failed")).toBe(true)
    expect(JSON.stringify(t.logs.lines)).not.toContain(SECRET)
    expect(JSON.stringify(t.logs.lines)).not.toContain("params")

    const again = await t.app.inject({ method: "GET", url: "/api/v1/health" })
    expect(again.statusCode).toBe(503)
  })
})
