import {
  compareTodos,
  TodoListResponseSchema,
  TodoSchema,
  type Todo,
} from "@todos/shared"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  CONFLICT_BODY,
  createTestApp,
  expectValidationError,
  NOT_FOUND_BODY,
  truncateTodos,
  type TestApp,
} from "./helpers"

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// Seeded single-Todo rows for the PATCH/DELETE suites: timestamps well in the
// past, so any DB-clock bump is visibly later.
const SEED_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
const SEED_AT = "2026-09-24T09:00:00.123Z"
const SEED_TODO: Todo = {
  id: SEED_ID,
  description: "Buy milk",
  completed: false,
  createdAt: SEED_AT,
  updatedAt: SEED_AT,
}
const ABSENT_ID = "0199a1b2-c3d4-7e5f-8a9b-ffffffffffff"

async function seedTodo(t: TestApp, todo: Todo = SEED_TODO): Promise<void> {
  await t.pool.query(
    `INSERT INTO todos (id, description, completed, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [todo.id, todo.description, todo.completed, todo.createdAt, todo.updatedAt]
  )
}

/** Every stored row, raw, for "nothing changed" checks. */
async function snapshot(t: TestApp): Promise<unknown[]> {
  const { rows } = await t.pool.query(
    `SELECT id, description, completed, created_at, updated_at FROM todos ORDER BY id`
  )
  return rows
}

async function listTodos(t: TestApp): Promise<Todo[]> {
  const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
  expect(res.statusCode).toBe(200)
  return res.json().todos
}

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

    it.each([
      ["text/plain", JSON.stringify({ id: ID, description: "x" })],
      ["application/xml", "<description>hi</description>"],
    ])("%s → 415", async (contentType, payload) => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: { "content-type": contentType },
        payload,
      })
      expectValidationError(res, 415)
      expect(await rows()).toHaveLength(0)
    })
  })
})

describe("PATCH /api/v1/todos/:id", () => {
  const url = `/api/v1/todos/${SEED_ID}`

  let t: TestApp
  beforeAll(() => {
    t = createTestApp()
  })
  beforeEach(async () => {
    await truncateTodos(t.pool)
    await seedTodo(t)
  })
  afterAll(() => t.close())

  const patch = (payload: unknown, target = url) =>
    t.app.inject({ method: "PATCH", url: target, payload: payload as object })

  it("toggle: 200, completed, Description kept, updatedAt bumped, createdAt kept", async () => {
    const res = await patch({ completed: true })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    const body = res.json()
    expect(body).toEqual({
      ...SEED_TODO,
      completed: true,
      updatedAt: expect.stringMatching(ISO_MS),
    })
    expect(TodoSchema.parse(body)).toEqual(body)
    expect(body.updatedAt > SEED_AT).toBe(true)

    const back = await patch({ completed: false })
    expect(back.statusCode).toBe(200)
    expect(back.json()).toMatchObject({ completed: false, createdAt: SEED_AT })
  })

  it("edit: normalizes the Description and bumps updatedAt", async () => {
    const res = await patch({ description: "  Buy\noat milk " })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      id: SEED_ID,
      description: "Buy oat milk",
      completed: false,
      createdAt: SEED_AT,
    })
    expect(body.updatedAt > SEED_AT).toBe(true)
  })

  it("both keys: applied in one write", async () => {
    const res = await patch({ description: "x", completed: true })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      description: "x",
      completed: true,
      createdAt: SEED_AT,
    })
    const [stored] = await listTodos(t)
    expect(stored).toEqual(res.json())
  })

  it("updatedAt comes from the database clock", async () => {
    const before = await t.pool.query<{ now: Date }>("SELECT now() AS now")
    const res = await patch({ completed: true })
    const after = await t.pool.query<{ now: Date }>("SELECT now() AS now")
    const updatedAt = Date.parse(res.json().updatedAt)
    expect(updatedAt).toBeGreaterThanOrEqual(
      Math.floor(before.rows[0]!.now.getTime())
    )
    expect(updatedAt).toBeLessThanOrEqual(
      Math.ceil(after.rows[0]!.now.getTime()) + 1
    )
  })

  it.each([
    ["the same Description", { description: "Buy milk" }],
    [
      "a Description equal after normalization",
      { description: " Buy\r\nmilk\n" },
    ],
    ["the same completed", { completed: false }],
    ["both keys equal", { description: "Buy milk", completed: false }],
  ])(
    "no-op (%s): 200, stored Todo byte-for-byte, updatedAt unchanged",
    async (_name, payload) => {
      const before = await snapshot(t)
      const res = await patch(payload)
      expect(res.statusCode).toBe(200)
      expect(res.body).toBe(JSON.stringify(SEED_TODO))
      expect(await snapshot(t)).toEqual(before)
    }
  )

  it("a real change in one key bumps updatedAt even if the other key is unchanged", async () => {
    const res = await patch({ description: "Buy milk", completed: true })
    expect(res.statusCode).toBe(200)
    expect(res.json().updatedAt > SEED_AT).toBe(true)
  })

  it("accepts an upper-case id and returns the canonical lowercase id", async () => {
    const res = await patch(
      { completed: true },
      `/api/v1/todos/${SEED_ID.toUpperCase()}`
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(SEED_ID)
  })

  it("empty body {} → 400 root invalid, no write", async () => {
    const before = await snapshot(t)
    const res = await patch({})
    expectValidationError(res, 400, [{ field: "", reason: "invalid" }])
    expect(await snapshot(t)).toEqual(before)
  })

  it.each([
    ["completed", { completed: null }],
    ["description", { description: null }],
    ["completed", { completed: "true" }],
    ["description", { description: 1 }],
  ])("bad value for %s → 400 invalid, no write", async (field, payload) => {
    const before = await snapshot(t)
    const res = await patch(payload)
    expectValidationError(res, 400, [{ field, reason: "invalid" }])
    expect(await snapshot(t)).toEqual(before)
  })

  it("an unknown key (client timestamp) → 400 unknown_field, no write", async () => {
    const before = await snapshot(t)
    const res = await patch({
      completed: true,
      createdAt: "2026-09-25T09:14:00.000Z",
    })
    expectValidationError(res, 400, [
      { field: "createdAt", reason: "unknown_field" },
    ])
    expect(await snapshot(t)).toEqual(before)
  })

  it.each([
    ["empty", "   "],
    ["empty", "\r\n"],
    ["too_long", "x".repeat(501)],
    ["too_long", `${"x".repeat(499)}😀`],
    ["invalid", "a\u0000b"],
    ["invalid", "a\ud800b"],
  ] as const)(
    "bad Description → 400 %s on description, no write",
    async (reason, description) => {
      const before = await snapshot(t)
      const res = await patch({ description, completed: true })
      expectValidationError(res, 400, [{ field: "description", reason }])
      expect(await snapshot(t)).toEqual(before)
    }
  )

  it("500 units after trimming → 200", async () => {
    const res = await patch({ description: `  ${"x".repeat(500)}\n` })
    expect(res.statusCode).toBe(200)
    expect(res.json().description).toBe("x".repeat(500))
  })

  it("unknown id → 404 NOT_FOUND, no write", async () => {
    const before = await snapshot(t)
    const res = await patch({ completed: true }, `/api/v1/todos/${ABSENT_ID}`)
    expect(res.statusCode).toBe(404)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual(NOT_FOUND_BODY)
    expect(await snapshot(t)).toEqual(before)
  })

  it("malformed id → 400 id invalid, no write", async () => {
    const before = await snapshot(t)
    const res = await patch({ completed: true }, "/api/v1/todos/not-a-uuid")
    expectValidationError(res, 400, [{ field: "id", reason: "invalid" }])
    expect(await snapshot(t)).toEqual(before)
  })

  it("GET afterwards returns the PATCH response's Todo in the same position", async () => {
    await seedTodo(t, {
      ...SEED_TODO,
      id: "0199a1b2-c3d4-7e5f-8a9b-000000000001",
      description: "older",
      createdAt: "2026-09-23T09:00:00.000Z",
      updatedAt: "2026-09-23T09:00:00.000Z",
    })
    await seedTodo(t, {
      ...SEED_TODO,
      id: "0199a1b2-c3d4-7e5f-8a9b-000000000002",
      description: "newer",
      createdAt: "2026-09-25T09:00:00.000Z",
      updatedAt: "2026-09-25T09:00:00.000Z",
    })
    const before = await listTodos(t)
    const index = before.findIndex((todo) => todo.id === SEED_ID)
    expect(index).toBe(1)

    const res = await patch({ description: "edited", completed: true })
    expect(res.statusCode).toBe(200)
    const after = await listTodos(t)
    expect(after[index]).toEqual(res.json())
    expect(after.map((todo) => todo.id)).toEqual(before.map((todo) => todo.id))
    expect([...after].sort(compareTodos)).toEqual(after)
  })

  it("concurrent PATCHes of different keys both apply", async () => {
    const results = await Promise.all([
      patch({ description: "Buy oat milk" }),
      patch({ completed: true }),
    ])
    expect(results.map((r) => r.statusCode)).toEqual([200, 200])
    const [stored] = await listTodos(t)
    expect(stored).toMatchObject({
      description: "Buy oat milk",
      completed: true,
      createdAt: SEED_AT,
    })
  })

  it("concurrent PATCHes of the Description: both 200, one Description stored intact", async () => {
    const a = "A".repeat(500)
    const b = "B".repeat(500)
    const results = await Promise.all([
      patch({ description: a }),
      patch({ description: b }),
    ])
    expect(results.map((r) => r.statusCode)).toEqual([200, 200])
    const [stored] = await listTodos(t)
    expect([a, b]).toContain(stored!.description)
  })

  it("sequential PATCHes of the Description: the second wins", async () => {
    expect((await patch({ description: "first" })).statusCode).toBe(200)
    const second = await patch({ description: "second" })
    expect(second.statusCode).toBe(200)
    expect(await listTodos(t)).toEqual([second.json()])
  })

  it("logs one request line with no Todo content", async () => {
    t.logs.clear()
    await patch({ description: "secret edit text" })
    const lines = t.logs.requestLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      route: "/api/v1/todos/:id",
      statusCode: 200,
    })
    expect(JSON.stringify(t.logs.lines)).not.toContain("secret edit text")
  })
})

describe("DELETE /api/v1/todos/:id", () => {
  const url = `/api/v1/todos/${SEED_ID}`

  let t: TestApp
  beforeAll(() => {
    t = createTestApp()
  })
  beforeEach(async () => {
    await truncateTodos(t.pool)
    await seedTodo(t)
  })
  afterAll(() => t.close())

  const del = (target = url) => t.app.inject({ method: "DELETE", url: target })

  it("deletes: 204, empty body, gone from GET", async () => {
    const res = await del()
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe("")
    expect(await listTodos(t)).toEqual([])
    expect(await snapshot(t)).toEqual([])
  })

  it("deletes only the addressed Todo, by any id case", async () => {
    const other = { ...SEED_TODO, id: "0199a1b2-c3d4-7e5f-8a9b-000000000001" }
    await seedTodo(t, other)
    const res = await del(`/api/v1/todos/${SEED_ID.toUpperCase()}`)
    expect(res.statusCode).toBe(204)
    expect(await listTodos(t)).toEqual([other])
  })

  it("unknown id → 404 NOT_FOUND, no write", async () => {
    const before = await snapshot(t)
    const res = await del(`/api/v1/todos/${ABSENT_ID}`)
    expect(res.statusCode).toBe(404)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual(NOT_FOUND_BODY)
    expect(await snapshot(t)).toEqual(before)
  })

  it("a second DELETE of the same id → 404", async () => {
    expect((await del()).statusCode).toBe(204)
    const again = await del()
    expect(again.statusCode).toBe(404)
    expect(again.json()).toEqual(NOT_FOUND_BODY)
  })

  it("malformed id → 400 id invalid, no write", async () => {
    const before = await snapshot(t)
    const res = await del("/api/v1/todos/not-a-uuid")
    expectValidationError(res, 400, [{ field: "id", reason: "invalid" }])
    expect(await snapshot(t)).toEqual(before)
  })
})

describe("create replay once edit and delete exist", () => {
  let t: TestApp
  beforeAll(() => {
    t = createTestApp()
  })
  beforeEach(() => truncateTodos(t.pool))
  afterAll(() => t.close())

  const create = () =>
    t.app.inject({
      method: "POST",
      url: "/api/v1/todos",
      payload: { id: SEED_ID, description: "Buy milk" },
    })

  it("replay after an edit → 409 CONFLICT, row unchanged", async () => {
    expect((await create()).statusCode).toBe(201)
    const edit = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/todos/${SEED_ID}`,
      payload: { description: "Buy oat milk" },
    })
    expect(edit.statusCode).toBe(200)
    const before = await snapshot(t)

    const replay = await create()
    expect(replay.statusCode).toBe(409)
    expect(replay.json()).toEqual(CONFLICT_BODY)
    expect(await snapshot(t)).toEqual(before)
  })

  it("replay after a delete → 201, the row exists again", async () => {
    expect((await create()).statusCode).toBe(201)
    const removed = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/todos/${SEED_ID}`,
    })
    expect(removed.statusCode).toBe(204)

    const replay = await create()
    expect(replay.statusCode).toBe(201)
    expect(await listTodos(t)).toEqual([replay.json()])
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
