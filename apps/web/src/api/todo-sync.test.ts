import type { Todo } from "@todos/shared"
import { describe, expect, it, vi } from "vitest"

import { makeTodo } from "@/test/render"

import { deleteTodoRequest } from "./hooks/use-delete-todo"
import { HttpError } from "./http"
import { createQueryClient, TODOS_QUERY_KEY } from "./query-client"
import {
  createOp,
  createTodoMutation,
  createTodoSync,
  deleteOp,
  DroppedError,
  editOp,
  getTodoSync,
  notFoundMeansDeleted,
  renderedList,
  toggleOp,
  type TodoWriteKind,
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

  it("never nulls an id with pending ops, and still confirms listed ids that have them", () => {
    const sync = createTodoSync()
    const a = makeTodo({ id: "00000000-0000-7000-8000-00000000000a" })
    const b = makeTodo({ id: "00000000-0000-7000-8000-00000000000b" })
    sync.seedFromList([a, b])
    sync.pending.set(a.id, [toggleOp(true)])
    sync.pending.set(b.id, [toggleOp(true)])

    // `a` is missing but pending: kept as it was. `b` is listed: re-confirmed.
    const b2 = { ...b, description: "changed elsewhere" }
    sync.seedFromList([b2])
    expect(sync.confirmed.get(a.id)).toEqual(a)
    expect(sync.confirmed.get(b.id)).toEqual(b2)

    // A pending create never confirmed stays unconfirmed (not null).
    const NEW = "00000000-0000-7000-8000-00000000000c"
    sync.pending.set(NEW, [createOp(NEW, "new")])
    sync.seedFromList([b2])
    expect(sync.confirmed.has(NEW)).toBe(false)
  })
})

describe("todo-sync renderedList", () => {
  const a = makeTodo({
    id: "00000000-0000-7000-8000-00000000000a",
    description: "a",
    createdAt: "2026-09-24T09:00:00.000Z",
  })
  const b = makeTodo({
    id: "00000000-0000-7000-8000-00000000000b",
    description: "b",
    createdAt: "2026-09-24T10:00:00.000Z",
  })

  it("re-applies pending ops to listed Todos and keeps unlisted pending creates, sorted", () => {
    const sync = createTodoSync()
    const NEW = "00000000-0000-7000-8000-00000000000c"
    sync.pending.set(a.id, [toggleOp(true)])
    sync.pending.set(NEW, [createOp(NEW, "new", "2026-09-24T11:00:00.000Z")])
    sync.seedFromList([a, b])

    const list = renderedList(sync, [a, b])
    expect(list.map((t) => t.id)).toEqual([NEW, b.id, a.id])
    expect(list[2]).toEqual({ ...a, completed: true })
    expect(list[1]).toBe(b)
  })

  it("keeps a confirmed Todo with pending ops that a later list no longer contains", () => {
    const sync = createTodoSync()
    sync.seedFromList([a, b])
    sync.pending.set(a.id, [toggleOp(true)])
    sync.seedFromList([b])

    expect(renderedList(sync, [b])).toEqual([b, { ...a, completed: true }])
  })

  it("drops Todos that render as null (an unlisted pending toggle on nothing)", () => {
    const sync = createTodoSync()
    const GONE = "00000000-0000-7000-8000-00000000000d"
    sync.pending.set(GONE, [toggleOp(true)])
    sync.seedFromList([a])
    expect(renderedList(sync, [a]).map((t) => t.id)).toEqual([a.id])
  })
})

describe("todo-sync toggleOp and notFoundMeansDeleted", () => {
  it("toggleOp sets an absolute completed and keeps a missing Todo missing", () => {
    const todo = makeTodo({ completed: false })
    expect(toggleOp(true).kind).toBe("toggle")
    expect(toggleOp(true).apply(todo)).toEqual({ ...todo, completed: true })
    expect(toggleOp(false).apply({ ...todo, completed: false })).toEqual(todo)
    expect(toggleOp(true).apply(null)).toBeNull()
  })

  it("maps only NOT_FOUND to null", () => {
    expect(
      notFoundMeansDeleted(new HttpError("NOT_FOUND", { status: 404 }))
    ).toBeNull()
    expect(
      notFoundMeansDeleted(new HttpError("INTERNAL", { status: 500 }))
    ).toBeUndefined()
    expect(notFoundMeansDeleted(new HttpError("NETWORK"))).toBeUndefined()
    expect(notFoundMeansDeleted(new Error("x"))).toBeUndefined()
  })

  it("kind is the typed union, not a free string", () => {
    const kinds: TodoWriteKind[] = ["create", "edit", "toggle", "delete"]
    expect(kinds).toHaveLength(4)
    createTodoMutation<{ id: string }>(
      // @ts-expect-error: a free-string kind is rejected
      "rename",
      { op: () => toggleOp(true), request: vi.fn(), onFailure: vi.fn() }
    )
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

describe("createTodoMutation: toggle kind", () => {
  const todo = makeTodo({
    id: "00000000-0000-7000-8000-000000000001",
    description: "todo",
    createdAt: "2026-09-24T09:00:00.000Z",
  })
  const other = makeTodo({
    id: "00000000-0000-7000-8000-000000000002",
    description: "other",
    createdAt: "2026-09-24T10:00:00.000Z",
  })
  const NEW_ID = "0199a0b2-3c4d-7e8f-9a0b-000000000099"

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
    queryClient.setQueryDefaults(TODOS_QUERY_KEY, { structuralSharing: false })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const sync = getTodoSync(queryClient)
    sync.seedFromList([other, todo])
    queryClient.setQueryData<Todo[]>(TODOS_QUERY_KEY, [other, todo])
    const list = () => queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)!
    const find = (id: string) => list().find((t) => t.id === id)
    return { queryClient, invalidate, sync, list, find }
  }

  interface ToggleVars {
    id: string
    completed: boolean
  }

  function toggleKind(
    request: (vars: ToggleVars) => Promise<Todo | null>,
    onFailure = vi.fn()
  ) {
    const mutation = createTodoMutation<ToggleVars>("toggle", {
      op: (vars) => toggleOp(vars.completed),
      request,
      failureState: notFoundMeansDeleted,
      onFailure,
    })
    return { mutation, onFailure }
  }

  it("the failure mapping sets confirmed to null on NOT_FOUND, removing the row", async () => {
    const { queryClient, sync, list, invalidate } = setup()
    const { mutation, onFailure } = toggleKind(() =>
      Promise.reject(new HttpError("NOT_FOUND", { status: 404 }))
    )

    await mutation.mutate(queryClient, { id: todo.id, completed: true })

    expect(sync.confirmed.get(todo.id)).toBeNull()
    expect(list().map((t) => t.id)).toEqual([other.id])
    expect(sync.pending.has(todo.id)).toBe(false)
    expect(sync.generation.get(todo.id)).toBe(1)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("the failure mapping leaves confirmed unchanged for other errors", async () => {
    const { queryClient, sync, list, find } = setup()
    const { mutation, onFailure } = toggleKind(() =>
      Promise.reject(new HttpError("INTERNAL", { status: 500 }))
    )

    await mutation.mutate(queryClient, { id: todo.id, completed: true })

    expect(sync.confirmed.get(todo.id)).toEqual(todo)
    expect(find(todo.id)).toEqual(todo)
    expect(list().map((t) => t.id)).toEqual([other.id, todo.id])
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it("double toggle: the second PATCH waits for the first, and the row never flips back", async () => {
    const { queryClient, sync, list, find } = setup()
    const first = deferred<Todo>()
    const second = deferred<Todo>()
    const request = vi
      .fn<(vars: ToggleVars) => Promise<Todo>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { mutation, onFailure } = toggleKind(request)

    const firstDone = mutation.mutate(queryClient, {
      id: todo.id,
      completed: true,
    })
    expect(find(todo.id)?.completed).toBe(true)
    const secondDone = mutation.mutate(queryClient, {
      id: todo.id,
      completed: false,
    })
    expect(find(todo.id)?.completed).toBe(false)
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toEqual({ id: todo.id, completed: true })

    first.resolve({ ...todo, completed: true })
    await flush()
    // The first response lands: the queued op still renders on top of it.
    expect(sync.confirmed.get(todo.id)).toMatchObject({ completed: true })
    expect(find(todo.id)?.completed).toBe(false)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]![0]).toEqual({ id: todo.id, completed: false })

    second.resolve({ ...todo, completed: false })
    await Promise.all([firstDone, secondDone])
    expect(find(todo.id)?.completed).toBe(false)
    expect(list().map((t) => t.id)).toEqual([other.id, todo.id])
    expect(sync.pending.has(todo.id)).toBe(false)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it("a toggle on a pending create is dropped when the create fails", async () => {
    const { queryClient, sync, list } = setup()
    const post = deferred<Todo>()
    const createFailure = vi.fn()
    const create = createTodoMutation<{ id: string; description: string }>(
      "create",
      {
        op: (vars) =>
          createOp(vars.id, vars.description, "2026-09-24T11:00:00.000Z"),
        request: () => post.promise,
        onFailure: createFailure,
      }
    )
    const patch = vi.fn<(vars: ToggleVars) => Promise<Todo>>()
    const { mutation: toggle, onFailure: toggleFailure } = toggleKind(patch)

    const createDone = create.mutate(queryClient, {
      id: NEW_ID,
      description: "new",
    })
    const toggleDone = toggle.mutate(queryClient, {
      id: NEW_ID,
      completed: true,
    })
    await flush()
    expect(list()[0]).toMatchObject({ id: NEW_ID, completed: true })

    post.reject(new HttpError("INTERNAL", { status: 500 }))
    await Promise.all([createDone, toggleDone])

    expect(patch).not.toHaveBeenCalled()
    expect(createFailure).toHaveBeenCalledTimes(1)
    expect(toggleFailure).not.toHaveBeenCalled()
    expect(list().map((t) => t.id)).toEqual([other.id, todo.id])
    expect(sync.pending.has(NEW_ID)).toBe(false)
  })

  it("a toggle queued after a failed toggle is dropped: no fetch, no second failure", async () => {
    const { queryClient, sync, find } = setup()
    const first = deferred<Todo>()
    const request = vi
      .fn<(vars: ToggleVars) => Promise<Todo>>()
      .mockImplementationOnce(() => first.promise)
    const { mutation, onFailure } = toggleKind(request)

    const a = mutation.mutate(queryClient, { id: todo.id, completed: true })
    const b = mutation.mutate(queryClient, { id: todo.id, completed: false })
    await flush()

    first.reject(new HttpError("NETWORK"))
    await Promise.all([a, b])

    expect(request).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(find(todo.id)).toEqual(todo)
    expect(sync.pending.has(todo.id)).toBe(false)
    expect(sync.generation.get(todo.id)).toBe(1)
  })
})

describe("createTodoMutation: delete kind", () => {
  const todo = makeTodo({
    id: "00000000-0000-7000-8000-000000000001",
    description: "todo",
    createdAt: "2026-09-24T09:00:00.000Z",
  })
  const other = makeTodo({
    id: "00000000-0000-7000-8000-000000000002",
    description: "other",
    createdAt: "2026-09-24T10:00:00.000Z",
  })
  const NEW_ID = "0199a0b2-3c4d-7e8f-9a0b-000000000099"

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
    queryClient.setQueryDefaults(TODOS_QUERY_KEY, { structuralSharing: false })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const sync = getTodoSync(queryClient)
    sync.seedFromList([other, todo])
    queryClient.setQueryData<Todo[]>(TODOS_QUERY_KEY, [other, todo])
    const list = () => queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)!
    const ids = () => list().map((t) => t.id)
    return { queryClient, invalidate, sync, list, ids }
  }

  interface DeleteVars {
    id: string
  }
  interface ToggleVars {
    id: string
    completed: boolean
  }

  function deleteKind(
    request: (vars: DeleteVars) => Promise<Todo | null>,
    onFailure = vi.fn()
  ) {
    const mutation = createTodoMutation<DeleteVars>("delete", {
      op: deleteOp,
      request,
      onFailure,
    })
    return { mutation, onFailure }
  }

  function toggleKind(
    request: (vars: ToggleVars) => Promise<Todo | null>,
    onFailure = vi.fn()
  ) {
    const mutation = createTodoMutation<ToggleVars>("toggle", {
      op: (vars) => toggleOp(vars.completed),
      request,
      failureState: notFoundMeansDeleted,
      onFailure,
    })
    return { mutation, onFailure }
  }

  it("deleteOp renders null whatever came before", () => {
    expect(deleteOp().kind).toBe("delete")
    expect(deleteOp().apply(todo)).toBeNull()
    expect(deleteOp().apply(null)).toBeNull()
  })

  it("removes the row at once; success confirms null", async () => {
    const { queryClient, sync, ids, invalidate } = setup()
    const request = deferred<null>()
    const { mutation, onFailure } = deleteKind(() => request.promise)

    const done = mutation.mutate(queryClient, { id: todo.id })
    await flush()
    expect(ids()).toEqual([other.id])

    request.resolve(null)
    await done
    expect(sync.confirmed.get(todo.id)).toBeNull()
    expect(sync.pending.has(todo.id)).toBe(false)
    expect(ids()).toEqual([other.id])
    expect(onFailure).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("a 404 is counted as success: confirmed null, no failure", async () => {
    const { queryClient, sync, ids } = setup()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "Todo not found" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)
    try {
      const { mutation, onFailure } = deleteKind(deleteTodoRequest)
      await mutation.mutate(queryClient, { id: todo.id })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]![1]?.method).toBe("DELETE")
      expect(sync.confirmed.get(todo.id)).toBeNull()
      expect(sync.generation.get(todo.id) ?? 0).toBe(0)
      expect(ids()).toEqual([other.id])
      expect(onFailure).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("a real failure re-renders the confirmed Todo at its position, once", async () => {
    const { queryClient, sync, list, ids } = setup()
    const { mutation, onFailure } = deleteKind(() =>
      Promise.reject(new HttpError("INTERNAL", { status: 500 }))
    )

    await mutation.mutate(queryClient, { id: todo.id })

    expect(ids()).toEqual([other.id, todo.id])
    expect(list()[1]).toEqual(todo)
    expect(sync.confirmed.get(todo.id)).toEqual(todo)
    expect(sync.generation.get(todo.id)).toBe(1)
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it("delete during a pending toggle: the DELETE waits for the PATCH, the row is removed at once", async () => {
    const { queryClient, sync, ids } = setup()
    const patch = deferred<Todo>()
    const patchRequest = vi.fn(() => patch.promise)
    const del = deferred<null>()
    const deleteRequest = vi.fn(() => del.promise)
    const { mutation: toggle } = toggleKind(patchRequest)
    const { mutation: remove, onFailure } = deleteKind(deleteRequest)

    const toggleDone = toggle.mutate(queryClient, {
      id: todo.id,
      completed: true,
    })
    const deleteDone = remove.mutate(queryClient, { id: todo.id })
    await flush()
    expect(ids()).toEqual([other.id])
    expect(patchRequest).toHaveBeenCalledTimes(1)
    expect(deleteRequest).not.toHaveBeenCalled()

    patch.resolve({ ...todo, completed: true })
    await flush()
    // The PATCH response lands under the pending delete: still removed.
    expect(ids()).toEqual([other.id])
    expect(deleteRequest).toHaveBeenCalledTimes(1)

    del.resolve(null)
    await Promise.all([toggleDone, deleteDone])
    expect(ids()).toEqual([other.id])
    expect(sync.confirmed.get(todo.id)).toBeNull()
    expect(sync.pending.has(todo.id)).toBe(false)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it("a delete on a pending create is dropped when the create fails: only the create failure", async () => {
    const { queryClient, sync, ids } = setup()
    const post = deferred<Todo>()
    const createFailure = vi.fn()
    const create = createTodoMutation<{ id: string; description: string }>(
      "create",
      {
        op: (vars) =>
          createOp(vars.id, vars.description, "2026-09-24T11:00:00.000Z"),
        request: () => post.promise,
        onFailure: createFailure,
      }
    )
    const deleteRequest = vi.fn(async () => null)
    const { mutation: remove, onFailure: deleteFailure } =
      deleteKind(deleteRequest)

    const createDone = create.mutate(queryClient, {
      id: NEW_ID,
      description: "new",
    })
    const deleteDone = remove.mutate(queryClient, { id: NEW_ID })
    await flush()
    expect(ids()).toEqual([other.id, todo.id])

    post.reject(new HttpError("INTERNAL", { status: 500 }))
    await Promise.all([createDone, deleteDone])

    expect(deleteRequest).not.toHaveBeenCalled()
    expect(createFailure).toHaveBeenCalledTimes(1)
    expect(createFailure.mock.calls[0]![0]).toMatchObject({
      dropped: ["delete"],
      state: null,
    })
    expect(deleteFailure).not.toHaveBeenCalled()
    expect(ids()).toEqual([other.id, todo.id])
    expect(sync.pending.has(NEW_ID)).toBe(false)
  })

  it("a toggle queued after a failed delete is dropped: no fetch, no second failure", async () => {
    const { queryClient, sync, list, ids } = setup()
    const del = deferred<null>()
    const { mutation: remove, onFailure: deleteFailure } = deleteKind(
      () => del.promise
    )
    const patchRequest = vi.fn<(vars: ToggleVars) => Promise<Todo>>()
    const { mutation: toggle, onFailure: toggleFailure } =
      toggleKind(patchRequest)

    const deleteDone = remove.mutate(queryClient, { id: todo.id })
    const toggleDone = toggle.mutate(queryClient, {
      id: todo.id,
      completed: true,
    })
    await flush()

    del.reject(new HttpError("NETWORK"))
    await Promise.all([deleteDone, toggleDone])

    expect(patchRequest).not.toHaveBeenCalled()
    expect(deleteFailure).toHaveBeenCalledTimes(1)
    expect(toggleFailure).not.toHaveBeenCalled()
    expect(ids()).toEqual([other.id, todo.id])
    expect(list()[1]).toEqual(todo)
    expect(sync.pending.has(todo.id)).toBe(false)
  })
})

describe("createTodoMutation: edit kind", () => {
  const todo = makeTodo({
    id: "00000000-0000-7000-8000-000000000001",
    description: "todo",
    createdAt: "2026-09-24T09:00:00.000Z",
  })
  const other = makeTodo({
    id: "00000000-0000-7000-8000-000000000002",
    description: "other",
    createdAt: "2026-09-24T10:00:00.000Z",
  })

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
    queryClient.setQueryDefaults(TODOS_QUERY_KEY, { structuralSharing: false })
    const sync = getTodoSync(queryClient)
    sync.seedFromList([other, todo])
    queryClient.setQueryData<Todo[]>(TODOS_QUERY_KEY, [other, todo])
    const list = () => queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)!
    const ids = () => list().map((t) => t.id)
    return { queryClient, sync, list, ids }
  }

  interface EditVars {
    id: string
    description: string
  }

  function editKind(
    request: (vars: EditVars) => Promise<Todo | null>,
    onFailure = vi.fn()
  ) {
    const mutation = createTodoMutation<EditVars>("edit", {
      op: (vars) => editOp(vars.description),
      request,
      failureState: notFoundMeansDeleted,
      onFailure,
    })
    return { mutation, onFailure }
  }

  function deleteKind(
    request: (vars: { id: string }) => Promise<Todo | null>,
    onFailure = vi.fn()
  ) {
    const mutation = createTodoMutation<{ id: string }>("delete", {
      op: deleteOp,
      request,
      onFailure,
    })
    return { mutation, onFailure }
  }

  it("editOp sets the Description, keeps every other field, and keeps a missing Todo missing", () => {
    expect(editOp("new").kind).toBe("edit")
    expect(editOp("new").apply(todo)).toEqual({ ...todo, description: "new" })
    expect(editOp("new").apply(null)).toBeNull()
  })

  it("shows the new Description at once in the same position; success confirms the server's Todo", async () => {
    const { queryClient, sync, list, ids } = setup()
    const patch = deferred<Todo>()
    const { mutation, onFailure } = editKind(() => patch.promise)

    const done = mutation.mutate(queryClient, {
      id: todo.id,
      description: "new",
    })
    await flush()
    expect(ids()).toEqual([other.id, todo.id])
    expect(list()[1]).toEqual({ ...todo, description: "new" })

    const saved = {
      ...todo,
      description: "new",
      updatedAt: "2026-09-24T12:00:00.000Z",
    }
    patch.resolve(saved)
    await done
    expect(sync.confirmed.get(todo.id)).toEqual(saved)
    expect(list()[1]).toEqual(saved)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it("a real failure rolls back to the confirmed Description, once", async () => {
    const { queryClient, list } = setup()
    const { mutation, onFailure } = editKind(() =>
      Promise.reject(new HttpError("INTERNAL", { status: 500 }))
    )

    await mutation.mutate(queryClient, { id: todo.id, description: "new" })

    expect(list()[1]).toEqual(todo)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0]![0].vars).toEqual({
      id: todo.id,
      description: "new",
    })
  })

  it("a 404 confirms null and removes the row", async () => {
    const { queryClient, sync, ids } = setup()
    const { mutation, onFailure } = editKind(() =>
      Promise.reject(new HttpError("NOT_FOUND", { status: 404 }))
    )

    await mutation.mutate(queryClient, { id: todo.id, description: "new" })

    expect(sync.confirmed.get(todo.id)).toBeNull()
    expect(ids()).toEqual([other.id])
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0]![0]).toMatchObject({
      dropped: [],
      state: null,
    })
  })

  it("a 404 with a delete queued: the failure reports the dropped delete and no Todo", async () => {
    const { queryClient, sync, ids } = setup()
    const patch = deferred<Todo>()
    const deleteRequest = vi.fn(async () => null)
    const { mutation: edit, onFailure: editFailure } = editKind(
      () => patch.promise
    )
    const { mutation: remove, onFailure: deleteFailure } =
      deleteKind(deleteRequest)

    const editDone = edit.mutate(queryClient, {
      id: todo.id,
      description: "new",
    })
    const deleteDone = remove.mutate(queryClient, { id: todo.id })
    await flush()

    patch.reject(new HttpError("NOT_FOUND", { status: 404 }))
    await Promise.all([editDone, deleteDone])

    expect(deleteRequest).not.toHaveBeenCalled()
    expect(editFailure).toHaveBeenCalledTimes(1)
    expect(editFailure.mock.calls[0]![0]).toMatchObject({
      dropped: ["delete"],
      state: null,
    })
    expect(deleteFailure).not.toHaveBeenCalled()
    expect(ids()).toEqual([other.id])
    expect(sync.pending.has(todo.id)).toBe(false)
  })

  it("delete during a pending edit: the DELETE waits for the PATCH, the row is removed at once", async () => {
    const { queryClient, sync, ids } = setup()
    const patch = deferred<Todo>()
    const patchRequest = vi.fn(() => patch.promise)
    const del = deferred<null>()
    const deleteRequest = vi.fn(() => del.promise)
    const { mutation: edit, onFailure: editFailure } = editKind(patchRequest)
    const { mutation: remove, onFailure: deleteFailure } =
      deleteKind(deleteRequest)

    const editDone = edit.mutate(queryClient, {
      id: todo.id,
      description: "new",
    })
    const deleteDone = remove.mutate(queryClient, { id: todo.id })
    await flush()
    expect(ids()).toEqual([other.id])
    expect(patchRequest).toHaveBeenCalledTimes(1)
    expect(deleteRequest).not.toHaveBeenCalled()

    patch.resolve({ ...todo, description: "new" })
    await flush()
    expect(ids()).toEqual([other.id])
    expect(deleteRequest).toHaveBeenCalledTimes(1)

    del.resolve(null)
    await Promise.all([editDone, deleteDone])
    expect(ids()).toEqual([other.id])
    expect(sync.confirmed.get(todo.id)).toBeNull()
    expect(sync.pending.has(todo.id)).toBe(false)
    expect(editFailure).not.toHaveBeenCalled()
    expect(deleteFailure).not.toHaveBeenCalled()
  })

  it("delete during a pending edit that fails: the DELETE is dropped with no fetch, one failure", async () => {
    const { queryClient, sync, list, ids } = setup()
    const patch = deferred<Todo>()
    const deleteRequest = vi.fn(async () => null)
    const { mutation: edit, onFailure: editFailure } = editKind(
      () => patch.promise
    )
    const { mutation: remove, onFailure: deleteFailure } =
      deleteKind(deleteRequest)

    const editDone = edit.mutate(queryClient, {
      id: todo.id,
      description: "new",
    })
    const deleteDone = remove.mutate(queryClient, { id: todo.id })
    await flush()
    expect(ids()).toEqual([other.id])

    patch.reject(new HttpError("NETWORK"))
    await Promise.all([editDone, deleteDone])

    expect(deleteRequest).not.toHaveBeenCalled()
    expect(editFailure).toHaveBeenCalledTimes(1)
    // The dropped kinds exclude the failed op; the state is the rollback's.
    expect(editFailure.mock.calls[0]![0]).toMatchObject({
      dropped: ["delete"],
      state: todo,
    })
    expect(deleteFailure).not.toHaveBeenCalled()
    expect(ids()).toEqual([other.id, todo.id])
    expect(list()[1]).toEqual(todo)
    expect(sync.pending.has(todo.id)).toBe(false)
  })
})

describe("DroppedError", () => {
  it("is an Error named DroppedError", () => {
    const error = new DroppedError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("DroppedError")
  })
})
