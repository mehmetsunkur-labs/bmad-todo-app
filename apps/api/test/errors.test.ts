import type { ErrorDetail } from "@todos/shared"
import type { LightMyRequestResponse } from "fastify"
import pg from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { AppError, isDatabaseUnavailable } from "../src/errors"
import { createTestApp, TEST_DATABASE_URL, type TestApp } from "./helpers"

const EchoBodySchema = z.strictObject({
  description: z.string().min(1).max(500),
})

// Exact envelope bodies: asserted on the raw `res.json()` with `toEqual`, so a
// leaked key fails the test (the shared response schemas strip unknown keys).
const VALIDATION_BODY = {
  error: { code: "VALIDATION_ERROR", message: "The request is invalid." },
}
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

function expectValidationError(
  res: LightMyRequestResponse,
  status: number,
  details?: ErrorDetail[]
) {
  expect(res.statusCode).toBe(status)
  expect(res.headers["content-type"]).toMatch(/^application\/json/)
  expect(res.json()).toEqual(
    details ? { error: { ...VALIDATION_BODY.error, details } } : VALIDATION_BODY
  )
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
    expect(res.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "The request conflicts with the stored resource.",
      },
    })
  })

  describe("client-error mapping (AD-5)", () => {
    const url = "/api/v1/test/echo"
    const json = { "content-type": "application/json" }

    it("valid body reaches the route", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        payload: { description: "ok" },
      })
      expect(res.statusCode).toBe(200)
    })

    it("malformed JSON → 400", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: json,
        payload: '{"description":',
      })
      expectValidationError(res, 400)
    })

    it("JSON content type with an empty body → 400", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: json,
        payload: "",
      })
      expectValidationError(res, 400)
    })

    it("body over 16 KiB → 413", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: json,
        payload: JSON.stringify({ description: "x".repeat(17 * 1024) }),
      })
      expectValidationError(res, 413)
    })

    it("unsupported content type → 415", async () => {
      const res = await t.app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/xml" },
        payload: "<description>hi</description>",
      })
      expectValidationError(res, 415)
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
