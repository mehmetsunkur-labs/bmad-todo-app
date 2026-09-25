import { CONTRACT_ID, ERROR_CASES, SUCCESS_CASES } from "@todos/shared/fixtures"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isTooLong } from "@/features/todos/create-failure"
import { jsonResponse } from "@/test/render"

import { HttpError, createTodo } from "./http"

/**
 * The client side of the shared wire contract: the exact bodies the real
 * server sends (asserted by `apps/api/test/contract.test.ts`) go through the
 * real `createTodo` → `request()` parser.
 */
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

const vars = { id: CONTRACT_ID, description: "Buy milk" }

describe("createTodo against the wire contract", () => {
  it.each(Object.entries(SUCCESS_CASES))(
    "%s: resolves to the Todo",
    async (_name, c) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(c.body, c.status))
      await expect(createTodo(vars)).resolves.toEqual(c.body)
    }
  )

  it.each(Object.entries(ERROR_CASES))(
    "%s: rejects with the fixture's kind, status and details",
    async (_name, c) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(c.body, c.status))
      const error = await createTodo(vars).then(
        () => {
          throw new Error("expected a failure")
        },
        (e: unknown) => e
      )

      expect(error).toBeInstanceOf(HttpError)
      const httpError = error as HttpError
      expect(httpError.kind).toBe(c.kind)
      expect(httpError.status).toBe(c.status)
      expect(httpError.details).toEqual(c.body.error.details)
      expect(isTooLong(httpError)).toBe(c.tooLong)
      // The server's message is never kept.
      expect(httpError.message).toBe(`Request failed: ${c.kind}`)
    }
  )
})
