import { ErrorEnvelopeSchema, TodoSchema } from "@todos/shared"
import {
  ERROR_CASES,
  SUCCESS_CASES,
  type WireRequest,
} from "@todos/shared/fixtures"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestApp, truncateTodos, type TestApp } from "./helpers"

/**
 * The server side of the shared wire contract: every fixture request, sent
 * to the real app, gets exactly the fixture's status and body. The web side
 * (`apps/web/src/api/http.contract.test.ts`) parses the same bodies.
 */
describe("POST /api/v1/todos wire contract", () => {
  let t: TestApp
  beforeAll(() => {
    t = createTestApp()
  })
  beforeEach(() => truncateTodos(t.pool))
  afterAll(() => t.close())

  const send = (request: WireRequest) =>
    t.app.inject({
      method: request.method,
      url: request.path,
      headers: request.headers,
      payload: request.body,
    })

  async function sendCase(c: { seed?: WireRequest; request: WireRequest }) {
    if (c.seed) {
      const seeded = await send(c.seed)
      expect(seeded.statusCode).toBe(201)
    }
    return send(c.request)
  }

  it.each(Object.entries(SUCCESS_CASES))(
    "%s → the fixture's status and a Todo with the fixture's keys",
    async (_name, c) => {
      const res = await sendCase(c)
      expect(res.statusCode).toBe(c.status)
      expect(res.headers["content-type"]).toMatch(/^application\/json/)
      const body = res.json()
      expect(TodoSchema.parse(body)).toEqual(body)
      expect(Object.keys(body).sort()).toEqual(Object.keys(c.body).sort())
      expect(body).toMatchObject({
        id: c.body.id,
        description: c.body.description,
        completed: c.body.completed,
      })
    }
  )

  it.each(Object.entries(ERROR_CASES))(
    "%s → exactly the fixture's status and error body",
    async (_name, c) => {
      const res = await sendCase(c)
      expect(res.statusCode).toBe(c.status)
      expect(res.headers["content-type"]).toMatch(/^application\/json/)
      const body = res.json()
      expect(body).toEqual(c.body)
      expect(ErrorEnvelopeSchema.parse(body)).toEqual(body)
    }
  )
})
