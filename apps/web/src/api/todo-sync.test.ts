import type { Todo } from "@todos/shared"
import { describe, expect, it, vi } from "vitest"

import { makeTodo } from "@/test/render"

import { createQueryClient, TODOS_QUERY_KEY } from "./query-client"
import {
  createOp,
  createTodoMutation,
  createTodoSync,
  DroppedError,
  getTodoSync,
} from "./todo-sync"

describe("todo-sync seedFromList", () => {
  it("confirms every listed Todo and nulls confirmed ids that are gone", () => {
    const sync = createTodoSync()
    const a = makeTodo({ id: "00000000-0000-7000-8000-00000000000a" })
    const b = makeTodo({ id: "00000000-0000-7000-8000-00000000000b" })

    sync.seedFromList([a, b])
    expect(sync.confirmed).toEqual(
      new Map([
        [a.id, a],
        [b.id, b],
      ])
    )

    sync.seedFromList([b])
    expect(sync.confirmed.get(a.id)).toBeNull()
    expect(sync.confirmed.get(b.id)).toEqual(b)
    expect(sync.pending.size).toBe(0)
    expect(sync.generation.size).toBe(0)
  })
})

describe("createTodoMutation (AD-12)", () => {
  const NEW_ID = "0199a0b2-3c4d-7e8f-9a0b-000000000099"
  const older = makeTodo({
    id: "00000000-0000-7000-8000-000000000001",
    description: "older",
    createdAt: "2026-09-24T09:00:00.000Z",
  })
  const newer = makeTodo({
    id: "00000000-0000-7000-8000-000000000002",
    description: "newer",
    createdAt: "2026-09-24T10:00:00.000Z",
  })

  /** A request the test settles by hand. */
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  function setup() {
    const queryClient = createQueryClient()
    // As useTodosQuery sets it: rows keep their objects across writes.
    queryClient.setQueryDefaults(TODOS_QUERY_KEY, { structuralSharing: false })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const sync = getTodoSync(queryClient)
    sync.seedFromList([newer, older])
    queryClient.setQueryData<Todo[]>(TODOS_QUERY_KEY, [newer, older])
    const list = () => queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)!
    const [cachedNewer, cachedOlder] = list()
    return { queryClient, invalidate, sync, list, cachedNewer, cachedOlder }
  }

  interface Vars {
    id: string
    description: string
  }

  function createKind(
    request: (vars: Vars) => Promise<Todo | null>,
    onFailure = vi.fn()
  ) {
    const mutation = createTodoMutation<Vars>("create", {
      op: (vars) =>
        createOp(vars.id, vars.description, "2026-09-24T11:00:00.000Z"),
      request,
      onFailure,
    })
    return { mutation, onFailure }
  }

  it("uses scope { id } and the pinned mutation defaults", () => {
    const { queryClient } = setup()
    const { mutation } = createKind(vi.fn())
    const options = mutation.options(queryClient, {
      id: NEW_ID,
      description: "x",
    })
    expect(options.scope).toEqual({ id: NEW_ID })
    expect(options).not.toHaveProperty("retry")
    expect(options).not.toHaveProperty("networkMode")
    expect(options).not.toHaveProperty("gcTime")
  })

  it("onMutate renders the op at once; onSuccess confirms and re-places only that id", async () => {
    const { queryClient, invalidate, sync, list, cachedNewer, cachedOlder } =
      setup()
    const request = deferred<Todo>()
    const { mutation, onFailure } = createKind(() => request.promise)

    const done = mutation.mutate(queryClient, { id: NEW_ID, description: "a" })
    await flush()

    // Optimistic: at the top, with the provisional client time.
    expect(list().map((t) => t.id)).toEqual([NEW_ID, newer.id, older.id])
    expect(list()[0]).toMatchObject({
      description: "a",
      completed: false,
      createdAt: "2026-09-24T11:00:00.000Z",
    })
    expect(sync.pending.get(NEW_ID)).toHaveLength(1)
    expect(sync.generation.get(NEW_ID) ?? 0).toBe(0)

    // The server's createdAt places it between the two others.
    const confirmed = makeTodo({
      id: NEW_ID,
      description: "a",
      createdAt: "2026-09-24T09:30:00.000Z",
    })
    request.resolve(confirmed)
    await done

    expect(list().map((t) => t.id)).toEqual([newer.id, NEW_ID, older.id])
    expect(list()[1]).toEqual(confirmed)
    // Other rows keep their objects: only that id was written.
    expect(list()[0]).toBe(cachedNewer)
    expect(list()[2]).toBe(cachedOlder)
    expect(sync.confirmed.get(NEW_ID)).toEqual(confirmed)
    expect(sync.pending.has(NEW_ID)).toBe(false)
    expect(onFailure).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("a failure rolls back only that id and calls onFailure exactly once", async () => {
    const { queryClient, invalidate, sync, list, cachedNewer, cachedOlder } =
      setup()
    const error = new Error("boom")
    const { mutation, onFailure } = createKind(() => Promise.reject(error))

    await mutation.mutate(queryClient, { id: NEW_ID, description: "a" })

    expect(list()).toEqual([newer, older])
    expect(list()[0]).toBe(cachedNewer)
    expect(list()[1]).toBe(cachedOlder)
    expect(sync.pending.has(NEW_ID)).toBe(false)
    expect(sync.generation.get(NEW_ID)).toBe(1)
    expect(sync.confirmed.has(NEW_ID)).toBe(false)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0]![0]).toMatchObject({
      vars: { id: NEW_ID, description: "a" },
      error,
    })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("another Todo's pending create survives this one's failure", async () => {
    const { queryClient, list } = setup()
    const other = deferred<Todo>()
    const OTHER_ID = "0199a0b2-3c4d-7e8f-9a0b-000000000098"
    const { mutation } = createKind((vars) =>
      vars.id === OTHER_ID ? other.promise : Promise.reject(new Error("x"))
    )

    const otherDone = mutation.mutate(queryClient, {
      id: OTHER_ID,
      description: "stays",
    })
    await mutation.mutate(queryClient, { id: NEW_ID, description: "fails" })

    expect(list().map((t) => t.description)).toEqual([
      "stays",
      "newer",
      "older",
    ])
    other.resolve(makeTodo({ id: OTHER_ID, description: "stays" }))
    await otherDone
  })

  it("drops a queued op after an earlier failure: no fetch, no second onFailure", async () => {
    const { queryClient, sync, list } = setup()
    const first = deferred<Todo>()
    const { mutation: create, onFailure } = createKind(() => first.promise)
    const secondRequest = vi.fn(async () => makeTodo({ id: NEW_ID }))
    const secondFailure = vi.fn()
    const rename = createTodoMutation<Vars>("edit", {
      op: (vars) => ({
        kind: "edit",
        apply: (prev) => prev && { ...prev, description: vars.description },
      }),
      request: secondRequest,
      onFailure: secondFailure,
    })

    const createDone = create.mutate(queryClient, {
      id: NEW_ID,
      description: "a",
    })
    const renameDone = rename.mutate(queryClient, {
      id: NEW_ID,
      description: "b",
    })
    await flush()
    // Both ops apply at once, in order, even though the second is queued.
    expect(sync.pending.get(NEW_ID)).toHaveLength(2)
    expect(list()[0]).toMatchObject({ id: NEW_ID, description: "b" })
    expect(secondRequest).not.toHaveBeenCalled()

    first.reject(new Error("boom"))
    await Promise.all([createDone, renameDone])

    expect(secondRequest).not.toHaveBeenCalled()
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(secondFailure).not.toHaveBeenCalled()
    expect(list()).toEqual([newer, older])
    expect(sync.pending.has(NEW_ID)).toBe(false)
    expect(sync.generation.get(NEW_ID)).toBe(1)
  })

  it("retry resends the same variables through the same mutation", async () => {
    const { queryClient, sync, list } = setup()
    const request = vi
      .fn<(vars: Vars) => Promise<Todo>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementationOnce(async (vars) => makeTodo(vars))
    const { mutation, onFailure } = createKind(request)

    await mutation.mutate(queryClient, { id: NEW_ID, description: "a" })
    expect(onFailure).toHaveBeenCalledTimes(1)
    const { retry } = onFailure.mock.calls[0]![0] as { retry: () => void }

    retry()
    await flush()
    await flush()

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]![0]).toEqual({ id: NEW_ID, description: "a" })
    expect(list().map((t) => t.id)).toContain(NEW_ID)
    expect(sync.confirmed.get(NEW_ID)).toMatchObject({ id: NEW_ID })
    expect(onFailure).toHaveBeenCalledTimes(1)
  })
})

describe("DroppedError", () => {
  it("is an Error named DroppedError", () => {
    const error = new DroppedError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("DroppedError")
  })
})
