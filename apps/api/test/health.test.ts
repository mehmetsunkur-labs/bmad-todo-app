import { ErrorEnvelopeSchema, HealthResponseSchema } from "@todos/shared"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestApp, type TestApp } from "./helpers"

describe("GET /api/v1/health", () => {
  describe("when the database answers SELECT 1", () => {
    let t: TestApp
    beforeAll(() => {
      t = createTestApp()
    })
    afterAll(() => t.close())

    it("returns 200 {status: ok}", async () => {
      const res = await t.app.inject({ method: "GET", url: "/api/v1/health" })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: "ok" })
      expect(HealthResponseSchema.parse(res.json())).toEqual({ status: "ok" })
    })
  })

  describe("when the database is unreachable", () => {
    let t: TestApp
    beforeAll(() => {
      // Nothing listens on port 1: every connection attempt is refused.
      t = createTestApp({
        databaseUrl: "postgres://todos:todos@127.0.0.1:1/todos_test",
      })
    })
    afterAll(() => t.close())

    it("returns 503 UNAVAILABLE in the error envelope", async () => {
      const res = await t.app.inject({ method: "GET", url: "/api/v1/health" })
      expect(res.statusCode).toBe(503)
      const body = ErrorEnvelopeSchema.parse(res.json())
      expect(body.error.code).toBe("UNAVAILABLE")
      expect(body.error.message).toEqual(expect.any(String))
    })

    it("keeps serving later requests", async () => {
      const first = await t.app.inject({ method: "GET", url: "/api/v1/health" })
      const second = await t.app.inject({
        method: "GET",
        url: "/api/v1/health",
      })
      expect(first.statusCode).toBe(503)
      expect(second.statusCode).toBe(503)
      const notFound = await t.app.inject({ method: "GET", url: "/api/v1/x" })
      expect(notFound.statusCode).toBe(404)
    })
  })
})
