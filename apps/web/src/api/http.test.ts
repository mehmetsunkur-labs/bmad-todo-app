import {
  REQUEST_TIMEOUT_MS,
  TodoListResponseSchema,
  TodoSchema,
} from "@todos/shared"
import { afterEach, describe, expect, it, vi } from "vitest"

import { jsonResponse, makeTodo, fakeAbortSignalTimeout } from "@/test/render"

import { HttpError, createTodo, deleteTodo, listTodos, request } from "./http"

const fetchMock = vi.fn<typeof fetch>()

function stubFetch() {
  vi.stubGlobal("fetch", fetchMock)
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.then(
    () => {
      throw new Error("expected a failure")
    },
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(HttpError)
  return error as HttpError
}

describe("http request", () => {
  it("GETs the relative path with a timeout signal and no Content-Type", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({ todos: [] }))

    await expect(listTodos()).resolves.toEqual({ todos: [] })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe("/api/v1/todos")
    expect(init?.method).toBe("GET")
    expect(init?.headers).toBeUndefined()
    expect(init?.body).toBeUndefined()
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("sets Content-Type only when there is a body", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({ todos: [] }))

    await request("/api/v1/todos", {
      method: "POST",
      body: { a: 1 },
      schema: TodoListResponseSchema,
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.headers).toEqual({ "Content-Type": "application/json" })
    expect(init?.body).toBe('{"a":1}')
  })

  it("resolves a typed null for a 204 on a call that expects no body", async () => {
    stubFetch()
    const response = new Response(null, { status: 204 })
    const json = vi.spyOn(response, "json")
    fetchMock.mockResolvedValue(response)
    const result: null = await request("/api/v1/todos/x", {
      method: "DELETE",
      schema: null,
    })
    expect(result).toBeNull()
    expect(json).not.toHaveBeenCalled()
  })

  it("resolves null without parsing for any 2xx on a call that expects no body", async () => {
    stubFetch()
    const response = new Response("not json", { status: 200, headers: {} })
    const json = vi.spyOn(response, "json")
    fetchMock.mockResolvedValue(response)
    await expect(
      request("/api/v1/todos/x", { method: "DELETE", schema: null })
    ).resolves.toBeNull()
    expect(json).not.toHaveBeenCalled()
  })

  it("still classifies failures on a call that expects no body", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "Todo not found" } },
        404
      )
    )
    const error = await failure(
      request("/api/v1/todos/x", { method: "DELETE", schema: null })
    )
    expect(error.kind).toBe("NOT_FOUND")
    expect(error.status).toBe(404)
  })

  it("classifies a 204 on a call that expects a body as INTERNAL, without parsing", async () => {
    stubFetch()
    const response = new Response(null, { status: 204 })
    const json = vi.spyOn(response, "json")
    fetchMock.mockResolvedValue(response)
    const error = await failure(
      request("/api/v1/todos/x", {
        method: "PATCH",
        body: { completed: true },
        schema: TodoSchema,
      })
    )
    expect(error.kind).toBe("INTERNAL")
    expect(error.status).toBe(204)
    expect(json).not.toHaveBeenCalled()
  })

  it("deleteTodo sends DELETE with no body or Content-Type and resolves null on 204", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const id = "0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b"

    await expect(deleteTodo(id)).resolves.toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe(`/api/v1/todos/${id}`)
    expect(init?.method).toBe("DELETE")
    expect(init?.body).toBeUndefined()
    expect(init?.headers).toBeUndefined()
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("deleteTodo rejects NOT_FOUND for an unknown id", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "Todo not found" } },
        404
      )
    )
    expect((await failure(deleteTodo("x"))).kind).toBe("NOT_FOUND")
  })

  it("parses with the shared schema, ignoring unknown fields", async () => {
    stubFetch()
    const todo = makeTodo()
    fetchMock.mockResolvedValue(
      jsonResponse({ todos: [{ ...todo, ownerId: "o-1" }], cursor: null })
    )
    await expect(listTodos()).resolves.toEqual({ todos: [todo] })
  })

  it("classifies a fetch rejection as NETWORK", async () => {
    stubFetch()
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    expect((await failure(listTodos())).kind).toBe("NETWORK")
  })

  it(`classifies a ${REQUEST_TIMEOUT_MS} ms timeout as NETWORK`, async () => {
    vi.useFakeTimers()
    const timeout = fakeAbortSignalTimeout()
    stubFetch()
    fetchMock.mockImplementation(
      (_path, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          )
        })
    )

    const result = failure(listTodos())
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await result).kind).toBe("NETWORK")
    expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS)
  })

  it("classifies a timeout while reading the body (response.json) as NETWORK", async () => {
    vi.useFakeTimers()
    fakeAbortSignalTimeout()
    stubFetch()
    // Headers arrive at once; the body never finishes until the signal aborts.
    fetchMock.mockImplementation(async (_path, init) => {
      const signal = init!.signal!
      return {
        status: 200,
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason))
          }),
      } as Response
    })

    const result = failure(listTodos())
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    const error = await result
    expect(error.kind).toBe("NETWORK")
    expect(error.status).toBe(200)
  })

  it("classifies a body read that fails after the timeout fired as NETWORK", async () => {
    vi.useFakeTimers()
    fakeAbortSignalTimeout()
    stubFetch()
    // Some runtimes surface an aborted body stream as a generic TypeError.
    fetchMock.mockImplementation(async (_path, init) => {
      const signal = init!.signal!
      return {
        status: 200,
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new TypeError("terminated"))
            )
          }),
      } as Response
    })

    const result = failure(listTodos())
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    expect((await result).kind).toBe("NETWORK")
  })

  it("classifies a body that isn't JSON (no timeout) as INTERNAL", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    )
    expect((await failure(listTodos())).kind).toBe("INTERNAL")
  })

  it("passes a caller-signal abort during fetch through unchanged", async () => {
    stubFetch()
    fetchMock.mockImplementation(
      (_path, init) =>
        new Promise((_resolve, reject) => {
          const signal = init!.signal!
          signal.addEventListener("abort", () => reject(signal.reason))
        })
    )
    const controller = new AbortController()
    const reason = new DOMException("Cancelled by the caller", "AbortError")

    const result = listTodos(controller.signal).then(
      () => {
        throw new Error("expected a rejection")
      },
      (e: unknown) => e
    )
    controller.abort(reason)
    const error = await result
    expect(error).toBe(reason)
    expect(error).not.toBeInstanceOf(HttpError)
  })

  it("passes a caller-signal abort while reading the body through unchanged", async () => {
    stubFetch()
    const controller = new AbortController()
    const reason = new DOMException("Cancelled by the caller", "AbortError")
    fetchMock.mockImplementation(async (_path, init) => {
      const signal = init!.signal!
      return {
        status: 200,
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason))
          }),
      } as Response
    })

    const result = listTodos(controller.signal).then(
      () => {
        throw new Error("expected a rejection")
      },
      (e: unknown) => e
    )
    // Let fetch resolve so the abort lands while the body is being read.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort(reason)
    const error = await result
    expect(error).toBe(reason)
    expect(error).not.toBeInstanceOf(HttpError)
  })

  it("uses the envelope's code for an error envelope", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "UNAVAILABLE",
            message: "db down",
            details: [{ field: "x", reason: "invalid" }],
          },
        },
        503
      )
    )
    const error = await failure(listTodos())
    expect(error.kind).toBe("UNAVAILABLE")
    expect(error.status).toBe(503)
    expect(error.details).toEqual([{ field: "x", reason: "invalid" }])
    expect(error.message).not.toContain("db down")
  })

  it("classifies a 5xx envelope as its code (INTERNAL)", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500)
    )
    expect((await failure(listTodos())).kind).toBe("INTERNAL")
  })

  it("classifies a non-envelope error body (an HTML 502) as INTERNAL", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      })
    )
    const error = await failure(listTodos())
    expect(error.kind).toBe("INTERNAL")
    expect(error.status).toBe(502)
  })

  it("classifies a JSON error body that isn't the envelope as INTERNAL", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({ message: "nope" }, 400))
    expect((await failure(listTodos())).kind).toBe("INTERNAL")
  })

  it("classifies a success body that fails its schema as INTERNAL", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse([makeTodo()]))
    expect((await failure(listTodos())).kind).toBe("INTERNAL")
  })
})

describe("createTodo", () => {
  const body = {
    id: "0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b",
    description: "Buy milk",
  }

  it.each([201, 200])(
    "POSTs the JSON body and resolves a %i with the parsed Todo",
    async (status) => {
      stubFetch()
      const todo = makeTodo(body)
      fetchMock.mockResolvedValue(jsonResponse({ ...todo, extra: 1 }, status))

      await expect(createTodo(body)).resolves.toEqual(todo)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [path, init] = fetchMock.mock.calls[0]!
      expect(path).toBe("/api/v1/todos")
      expect(init?.method).toBe("POST")
      expect(init?.headers).toEqual({ "Content-Type": "application/json" })
      expect(JSON.parse(init?.body as string)).toEqual(body)
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  )

  it("keeps the envelope's details (too_long) on a 400", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "too long",
            details: [{ field: "description", reason: "too_long" }],
          },
        },
        400
      )
    )
    const error = await failure(createTodo(body))
    expect(error.kind).toBe("VALIDATION_ERROR")
    expect(error.details).toEqual([
      { field: "description", reason: "too_long" },
    ])
    expect(error.message).not.toContain("too long")
  })

  it("classifies a success body that isn't a Todo as INTERNAL", async () => {
    stubFetch()
    fetchMock.mockResolvedValue(jsonResponse({ todos: [] }, 201))
    expect((await failure(createTodo(body))).kind).toBe("INTERNAL")
  })
})
