import { ErrorEnvelopeSchema } from "@todos/shared"
import type { LightMyRequestResponse } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { AppError } from "../src/errors"
import { createTestApp, type TestApp } from "./helpers"

const EchoBodySchema = z.strictObject({
  description: z.string().min(1).max(500),
})

function expectValidationError(res: LightMyRequestResponse, status: number) {
  expect(res.statusCode).toBe(status)
  expect(res.headers["content-type"]).toMatch(/^application\/json/)
  const body = ErrorEnvelopeSchema.parse(res.json())
  expect(body.error.code).toBe("VALIDATION_ERROR")
  return body
}

describe("error handling", () => {
  let t: TestApp
  beforeAll(() => {
    t = createTestApp({
      configure(app) {
        app.get("/api/v1/test/boom", async () => {
          throw new Error("kaboom: secret internals")
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
    const body = ErrorEnvelopeSchema.parse(res.json())
    expect(body.error.code).toBe("NOT_FOUND")
  })

  it("plain Error → 500 INTERNAL without the stack or message in the body", async () => {
    t.logs.clear()
    const res = await t.app.inject({ method: "GET", url: "/api/v1/test/boom" })
    expect(res.statusCode).toBe(500)
    const body = ErrorEnvelopeSchema.parse(res.json())
    expect(body.error.code).toBe("INTERNAL")
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
    expect(ErrorEnvelopeSchema.parse(res.json()).error.code).toBe("CONFLICT")
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
        const body = expectValidationError(res, 400)
        expect(body.error.details).toEqual([{ field, reason }])
      }
    )

    it("malformed percent-encoded URL → 400 via frameworkErrors", async () => {
      const res = await t.app.inject({ method: "GET", url: "/api/v1/%zz" })
      expectValidationError(res, 400)
    })
  })
})
