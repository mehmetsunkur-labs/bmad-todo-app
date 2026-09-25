import pg from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { DrizzleQueryError } from "drizzle-orm/errors"

import { AppError, isDatabaseUnavailable, toLoggableError } from "../src/errors"
import {
  CONFLICT_BODY,
  createTestApp,
  expectValidationError,
  TEST_DATABASE_URL,
  type TestApp,
} from "./helpers"

const EchoBodySchema = z.strictObject({
  description: z.string().min(1).max(500),
})

// Exact envelope bodies (see `VALIDATION_BODY` in ./helpers).
const NOT_FOUND_BODY = {
  error: {
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  },
}
const INTERNAL_BODY = {
  error: { code: "INTERNAL", message: "An unexpected error occurred." },
}
const UNAVAILABLE_BODY = {
  error: { code: "UNAVAILABLE", message: "The database is unreachable." },
}

describe("error handling", () => {
  let t: TestApp
  beforeAll(() => {
    t = createTestApp({
      configure(app) {
        app.get("/api/v1/test/boom", async () => {
          throw new Error("kaboom: secret internals")
        })
        app.get("/api/v1/test/db-down", async () => {
          throw new Error("Failed query: select 1", {
            cause: Object.assign(new Error("connect ECONNREFUSED"), {
              code: "ECONNREFUSED",
            }),
          })
        })
        app.get("/api/v1/test/query-failed", async () => {
          throw new DrizzleQueryError(
            'insert into "todos" ("id", "description") values ($1, $2)',
            ["00000000-0000-7000-8000-000000000001", "leaky secret text"],
            Object.assign(new Error("syntax error"), {
              code: "42601",
              detail: "Failing row contains (leaky secret text)",
            })
          )
        })
        app.get("/api/v1/test/conflict", async () => {
          throw new AppError("CONFLICT")
        })
        app.post(
          "/api/v1/test/echo",
          { schema: { body: EchoBodySchema } },
          async () => ({ ok: true })
        )
      },
    })
  })
  afterAll(() => t.close())

  it("unknown route → 404 NOT_FOUND from the not-found handler", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/nope" })
    expect(res.statusCode).toBe(404)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual(NOT_FOUND_BODY)
  })

  it("plain Error → 500 INTERNAL without the stack or message in the body", async () => {
    t.logs.clear()
    const res = await t.app.inject({ method: "GET", url: "/api/v1/test/boom" })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual(INTERNAL_BODY)
    expect(res.body).not.toContain("kaboom")
    expect(res.body).not.toMatch(/at .*\.ts:\d+/)

    const errorLines = t.logs.lines.filter((l) => l.level === 50)
    expect(errorLines).toHaveLength(1)
    const err = errorLines[0]!.err as { message: string; stack: string }
    expect(err.message).toBe("kaboom: secret internals")
    expect(err.stack).toContain("kaboom")
  })

  it("an unhandled Drizzle query error → 500, logged without its bound params", async () => {
    t.logs.clear()
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/test/query-failed",
    })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual(INTERNAL_BODY)

    const errorLines = t.logs.lines.filter((l) => l.level === 50)
    expect(errorLines).toHaveLength(1)
    const err = errorLines[0]!.err as Record<string, unknown>
    expect(err.message).toBe(
      'Failed query: insert into "todos" ("id", "description") values ($1, $2): syntax error'
    )
    expect(err.stack).toContain("Failed query: insert into")
    expect(err.stack).toContain("syntax error")
    expect(err).not.toHaveProperty("params")
    expect(err).not.toHaveProperty("detail")
    const serialized = JSON.stringify(t.logs.lines)
    expect(serialized).not.toContain("leaky secret text")
    expect(serialized).not.toContain("params")
  })

  it("the next request after an unexpected throw still succeeds", async () => {
    await t.app.inject({ method: "GET", url: "/api/v1/test/boom" })
    const res = await t.app.inject({ method: "GET", url: "/api/v1/health" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: "ok" })
  })

  it("AppError → its code and status in the envelope", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/test/conflict",
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual(CONFLICT_BODY)
  })

  // Malformed JSON, an empty JSON body, 413 and 415 are covered once, on the
  // real route with no-row checks, in todos.test.ts ("framework errors").
  describe("client-error mapping (AD-5)", () => {
    const url = "/api/v1/test/echo"

    it("valid body reaches the route", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        payload: { description: "ok" },
      })
      expect(res.statusCode).toBe(200)
    })

    it.each([
      [{ description: "ok", extra: 1 }, "extra", "unknown_field"],
      [{ description: "x".repeat(501) }, "description", "too_long"],
      [{ description: "" }, "description", "empty"],
    ] as const)(
      "Zod failure %o → 400 with details",
      async (payload, field, reason) => {
        const res = await t.app.inject({ method: "POST", url, payload })
        expectValidationError(res, 400, [{ field, reason }])
      }
    )

    it("malformed percent-encoded URL → 400 via frameworkErrors", async () => {
      const res = await t.app.inject({ method: "GET", url: "/api/v1/%zz" })
      expectValidationError(res, 400)
    })
  })

  it("a DB-unreachable error thrown by a route → 503 UNAVAILABLE", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/test/db-down",
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual(UNAVAILABLE_BODY)
  })
})

describe("GET /api/v1/todos with the database unreachable", () => {
  let t: TestApp
  beforeAll(() => {
    // Nothing listens on port 1: every connection attempt is refused.
    t = createTestApp({
      databaseUrl: "postgres://todos:todos@127.0.0.1:1/todos_test",
    })
  })
  afterAll(() => t.close())

  it("returns 503 UNAVAILABLE, not 500 INTERNAL, and keeps serving", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    expect(res.statusCode).toBe(503)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(res.json()).toEqual(UNAVAILABLE_BODY)

    const again = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    expect(again.statusCode).toBe(503)
  })
})

describe("GET /api/v1/todos when a query outlives the pool's query_timeout", () => {
  let t: TestApp
  let locker: pg.Pool
  beforeAll(() => {
    t = createTestApp({ queryTimeoutMillis: 200 })
    locker = new pg.Pool({ connectionString: TEST_DATABASE_URL })
  })
  afterAll(async () => {
    await t.close()
    await locker.end()
  })

  it("returns 503 UNAVAILABLE (pg 'Query read timeout'), not 500 INTERNAL", async () => {
    // Another session holds an exclusive lock on `todos`, so the real list
    // query blocks until the driver's 200 ms query_timeout fires.
    const client = await locker.connect()
    try {
      await client.query("BEGIN")
      await client.query("LOCK TABLE todos IN ACCESS EXCLUSIVE MODE")
      const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual(UNAVAILABLE_BODY)
    } finally {
      await client.query("ROLLBACK")
      client.release()
    }
  })
})

describe("GET /api/v1/todos when the database host doesn't resolve", () => {
  let t: TestApp
  beforeAll(() => {
    t = createTestApp({
      databaseUrl: "postgres://todos:todos@db.invalid:5432/x",
    })
  })
  afterAll(() => t.close())

  it("returns 503 UNAVAILABLE (ENOTFOUND / EAI_AGAIN), not 500 INTERNAL", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/todos" })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual(UNAVAILABLE_BODY)
  })
})

describe("isDatabaseUnavailable", () => {
  const withCode = (code: string, message = "x") =>
    Object.assign(new Error(message), { code })

  it.each([
    ["connection refused", withCode("ECONNREFUSED")],
    ["connection timed out", withCode("ETIMEDOUT")],
    ["connection reset", withCode("ECONNRESET")],
    ["host not found", withCode("ENOTFOUND")],
    ["DNS lookup failed temporarily", withCode("EAI_AGAIN")],
    ["host unreachable", withCode("EHOSTUNREACH")],
    ["network unreachable", withCode("ENETUNREACH")],
    ["the query read timeout", new Error("Query read timeout")],
    [
      "a connection dropped mid-use",
      new Error("Connection terminated unexpectedly"),
    ],
    [
      "an AggregateError of refused connections",
      new AggregateError([withCode("ECONNREFUSED"), withCode("ECONNREFUSED")]),
    ],
    [
      "the pool connect timeout",
      new Error("timeout exceeded when trying to connect"),
    ],
    [
      "the client connect timeout",
      new Error("Connection terminated due to connection timeout"),
    ],
    ["SQLSTATE 08006 (connection failure)", withCode("08006")],
    ["SQLSTATE 08001 (cannot establish)", withCode("08001")],
    ["SQLSTATE 57P01 (admin shutdown)", withCode("57P01")],
    ["SQLSTATE 57P02 (crash shutdown)", withCode("57P02")],
    ["SQLSTATE 57P03 (cannot connect now)", withCode("57P03")],
    [
      "a Drizzle-wrapped refused connection",
      new Error("Failed query: select ...", {
        cause: withCode("ECONNREFUSED"),
      }),
    ],
  ])("is true for %s", (_name, error) => {
    expect(isDatabaseUnavailable(error)).toBe(true)
  })

  it.each([
    ["a plain Error", new Error("kaboom")],
    ["a unique violation (23505)", withCode("23505")],
    ["a syntax error (42601)", withCode("42601")],
    ["query cancelled (57014)", withCode("57014")],
    ["an unrelated socket error", withCode("EPIPE")],
    ["a string", "ECONNREFUSED"],
    ["null", null],
  ])("is false for %s", (_name, error) => {
    expect(isDatabaseUnavailable(error)).toBe(false)
  })
})

describe("toLoggableError", () => {
  const SECRET = "secret description"
  const query = 'insert into "todos" ("id", "description") values ($1, $2)'
  const params = ["00000000-0000-7000-8000-000000000001", SECRET]

  function chain(error: unknown): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = []
    let current = error as Record<string, unknown> | undefined
    while (current) {
      out.push(current)
      current = current.cause as Record<string, unknown> | undefined
    }
    return out
  }

  it("removes bound params from the message, stack, and props at every cause level", () => {
    const inner = new DrizzleQueryError(
      query,
      params,
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
        code: "ECONNREFUSED",
        errno: -111,
        syscall: "connect",
        address: "127.0.0.1",
        port: 1,
        detail: SECRET,
      })
    )
    const outer = new AppError("UNAVAILABLE", { cause: inner })
    const wrapped = new Error("wrapper", { cause: outer })

    const safe = toLoggableError(wrapped)
    const levels = chain(safe)
    expect(levels).toHaveLength(4)
    expect(levels.map((e) => e.message)).toEqual([
      "wrapper",
      "The service is temporarily unavailable.",
      `Failed query: ${query}`,
      "connect ECONNREFUSED 127.0.0.1:1",
    ])
    expect(levels.map((e) => e.name)).toEqual([
      "Error",
      "AppError",
      "Error",
      "Error",
    ])
    expect(levels[3]).toMatchObject({
      code: "ECONNREFUSED",
      errno: -111,
      syscall: "connect",
      address: "127.0.0.1",
      port: 1,
    })
    for (const level of levels) {
      expect(level).not.toHaveProperty("params")
      expect(level).not.toHaveProperty("query")
      expect(level).not.toHaveProperty("detail")
      expect(String(level.stack)).not.toContain(SECRET)
      expect(String(level.stack)).not.toContain("params:")
      expect(String(level.stack)).toMatch(/\n\s+at /)
    }
    expect(String(levels[2]!.stack)).toContain(`Failed query: ${query}`)
    // The sanitized copy still classifies as DB-unavailable.
    expect(isDatabaseUnavailable(safe)).toBe(true)
  })

  it("does not modify the original error", () => {
    const original = new DrizzleQueryError(query, params, new Error("boom"))
    const { message, stack } = original
    toLoggableError(original)
    expect(original.message).toBe(message)
    expect(original.stack).toBe(stack)
    expect(original.params).toEqual(params)
  })

  it("sanitizes AggregateError members", () => {
    const aggregate = new AggregateError(
      [new DrizzleQueryError(query, params, undefined)],
      "all failed"
    )
    const safe = toLoggableError(aggregate) as AggregateError
    expect(safe).toBeInstanceOf(AggregateError)
    expect(safe.errors).toHaveLength(1)
    expect(
      JSON.stringify(safe.errors.map((e: Error) => [e.message, e.stack]))
    ).not.toContain(SECRET)
  })

  it("keeps a stack that has no params untouched", () => {
    const error = new Error("kaboom")
    expect((toLoggableError(error) as Error).stack).toBe(error.stack)
  })

  it("survives a cyclic cause chain", () => {
    const a = new Error("a")
    const b = new Error("b", { cause: a })
    ;(a as { cause?: unknown }).cause = b
    expect(() => toLoggableError(a)).not.toThrow()
  })

  it("passes primitives through and reduces non-Error objects to their type", () => {
    expect(toLoggableError("x")).toBe("x")
    expect(toLoggableError({ description: SECRET })).toEqual({
      type: "non-error object",
    })
  })
})
