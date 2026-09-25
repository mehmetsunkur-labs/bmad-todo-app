import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { createTestApp, type TestApp } from "./helpers"

const REQUIRED_KEYS = ["reqId", "method", "route", "statusCode", "responseTime"]
const BODY_KEYS = ["body", "payload", "req", "res", "request", "response"]

describe("request logging", () => {
  let t: TestApp
  const received: unknown[] = []
  beforeAll(() => {
    t = createTestApp({
      configure(app) {
        // A route that parses its body, so a body leak would be observable.
        app.post(
          "/api/v1/test/echo",
          {
            schema: { body: z.strictObject({ description: z.string() }) },
          },
          async (request) => {
            received.push(request.body)
            return { ok: true }
          }
        )
      },
    })
  })
  afterAll(() => t.close())

  it("emits exactly one line per request with the AD-11 fields", async () => {
    t.logs.clear()
    await t.app.inject({ method: "GET", url: "/api/v1/health" })

    expect(t.logs.lines).toHaveLength(1)
    const line = t.logs.lines[0]!
    for (const key of REQUIRED_KEYS) expect(line).toHaveProperty(key)
    expect(line).toMatchObject({
      method: "GET",
      route: "/api/v1/health",
      statusCode: 200,
    })
    expect(line.responseTime).toEqual(expect.any(Number))
  })

  it("logs one line per request, never with body keys", async () => {
    t.logs.clear()
    await t.app.inject({ method: "GET", url: "/api/v1/health" })
    await t.app.inject({ method: "GET", url: "/api/v1/nope" })
    await t.app.inject({
      method: "POST",
      url: "/api/v1/test/echo",
      payload: { description: "top secret todo" },
    })

    const lines = t.logs.requestLines()
    expect(lines).toHaveLength(3)
    expect(t.logs.lines).toHaveLength(3)
    expect(new Set(lines.map((l) => l.reqId)).size).toBe(3)
    expect(lines.map((l) => l.statusCode)).toEqual([200, 404, 200])
    expect(received).toEqual([{ description: "top secret todo" }])
    for (const line of lines) {
      for (const key of BODY_KEYS) expect(line).not.toHaveProperty(key)
    }
    expect(JSON.stringify(t.logs.lines)).not.toContain("top secret todo")
  })
})
