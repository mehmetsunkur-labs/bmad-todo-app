import { act, fireEvent, screen, within } from "@testing-library/react"
import { REQUEST_TIMEOUT_MS, type Todo } from "@todos/shared"
import { describe, expect, it } from "vitest"

import { createQueryClient, TODOS_QUERY_KEY } from "@/api/query-client"
import { getTodoSync } from "@/api/todo-sync"
import {
  advance,
  deferredFetch as makeDeferredFetch,
  fetchMock,
  hangingFetch,
  setupFetchAndFakeTimers,
} from "@/test/fetch"
import { jsonResponse, makeTodo, renderWithProviders } from "@/test/render"

import { TodoList } from "./todo-list"

const TOGGLE_FAILED = "Couldn't update that todo. Please try again."
const CREATE_RESTORED = "Couldn't add that todo. Your text is back in the box."

/** A fetch whose response the test releases by hand (flushed in the same act). */
const deferredFetch = () => makeDeferredFetch({ flushInSameAct: true })

const newer = makeTodo({
  id: "00000000-0000-7000-8000-000000000002",
  description: "Newer",
  createdAt: "2026-09-24T10:00:00.000Z",
})
const older = makeTodo({
  id: "00000000-0000-7000-8000-000000000001",
  description: "Older",
  createdAt: "2026-09-24T09:00:00.000Z",
})

async function renderPopulated(
  todos: Todo[] = [newer, older],
  queryClient = createQueryClient()
) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ todos }))
  const result = renderWithProviders(<TodoList />, { queryClient })
  await advance(0)
  return result
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name })
const queryCheckbox = (name: string) => screen.queryByRole("checkbox", { name })
const description = (name: string) => screen.getByText(name, { selector: "p" })
const rows = () =>
  within(screen.getByRole("list", { name: "Todos" }))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("p")!.textContent)
const announcer = () => screen.getByTestId("announcer")
/** Toast messages on screen (each toast's message has role="status"). */
const toasts = () =>
  screen
    .queryAllByRole("status")
    .filter((el) =>
      el.closest("[data-sonner-toast]:not([data-removed='true'])")
    )
    .map((el) => el.textContent)
const patches = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PATCH")
    .map(([path, init]) => ({
      path,
      body: JSON.parse(init!.body as string) as unknown,
    }))

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element)
  })
}

function expectCompleted(name: string) {
  const box = checkbox(name)
  expect(box).toHaveAttribute("aria-checked", "true")
  expect(box).toHaveAttribute("data-state", "checked")
  expect(description(name)).toHaveClass("line-through", "text-muted-foreground")
}

function expectActive(name: string) {
  const box = checkbox(name)
  expect(box).toHaveAttribute("aria-checked", "false")
  expect(box).toHaveAttribute("data-state", "unchecked")
  expect(description(name)).not.toHaveClass("line-through")
  expect(description(name)).not.toHaveClass("text-muted-foreground")
}

const serverError = () =>
  jsonResponse({ error: { code: "INTERNAL", message: "db exploded" } }, 500)

setupFetchAndFakeTimers(new Date("2026-09-24T15:30:00.000Z"))

describe("TodoRow: Completion checkbox", () => {
  it("every row starts with a checkbox named by its Description, aria-checked matching completed", async () => {
    await renderPopulated([newer, { ...older, completed: true }])

    const items = within(
      screen.getByRole("list", { name: "Todos" })
    ).getAllByRole("listitem")
    for (const item of items) {
      // The checkbox comes first in the row (and first in tab order).
      const first = item.querySelector("button, input, textarea, a")
      expect(first).toHaveAttribute("role", "checkbox")
    }
    expectActive("Newer")
    expectCompleted("Older")
    // 16 px box in a 44 px hit area.
    expect(checkbox("Newer")).toHaveClass("size-4")
    expect(checkbox("Newer").parentElement).toHaveClass("size-touch-target")
  })

  it("complete: checked, filled and struck through at once; PATCH { completed: true }; announced; row keeps its index", async () => {
    await renderPopulated()
    const patch = deferredFetch()

    await click(checkbox("Older"))

    // Before any response.
    expectCompleted("Older")
    expect(rows()).toEqual(["Newer", "Older"])
    expect(announcer()).toHaveTextContent("Marked as done")
    expect(patches()).toEqual([
      { path: `/api/v1/todos/${older.id}`, body: { completed: true } },
    ])

    await patch.resolve(jsonResponse({ ...older, completed: true }))
    expectCompleted("Older")
    expect(rows()).toEqual(["Newer", "Older"])
    expect(toasts()).toEqual([])
  })

  it("un-complete: unchecked, normal text, PATCH { completed: false }, 'Marked as not done'", async () => {
    await renderPopulated([newer, { ...older, completed: true }])
    const patch = deferredFetch()

    await click(checkbox("Older"))
    expectActive("Older")
    expect(announcer()).toHaveTextContent("Marked as not done")
    expect(patches()).toEqual([
      { path: `/api/v1/todos/${older.id}`, body: { completed: false } },
    ])

    await patch.resolve(jsonResponse({ ...older, completed: false }))
    expectActive("Older")
  })

  it("the accessible name is the Description before and after a toggle", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...older, completed: true }))
    const box = checkbox("Older")
    expect(box).toHaveAccessibleName("Older")

    await click(box)
    await advance(0)
    expect(box).toHaveAccessibleName("Older")
    expect(checkbox("Older")).toBe(box)
  })

  it("Space toggles: the checkbox is a native button whose Space key isn't blocked", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...older, completed: true }))
    const box = checkbox("Older")
    box.focus()

    expect(box.tagName).toBe("BUTTON")
    expect(box).toHaveAttribute("type", "button")
    // Browsers activate a focused button on Space (keyup → click); jsdom
    // doesn't, so the test dispatches the click the browser would.
    expect(fireEvent.keyDown(box, { key: " ", code: "Space" })).toBe(true)
    expect(fireEvent.keyUp(box, { key: " ", code: "Space" })).toBe(true)
    await click(box)

    expectCompleted("Older")
    expect(box).toHaveFocus()
    expect(patches()).toHaveLength(1)
  })

  it("double toggle: the second PATCH waits for the first, and the box never flips back", async () => {
    await renderPopulated()
    const first = deferredFetch()
    const second = deferredFetch()

    await click(checkbox("Older"))
    await click(checkbox("Older"))
    expectActive("Older")
    expect(patches()).toEqual([
      { path: `/api/v1/todos/${older.id}`, body: { completed: true } },
    ])

    await first.resolve(jsonResponse({ ...older, completed: true }))
    expectActive("Older")
    expect(patches().map((p) => p.body)).toEqual([
      { completed: true },
      { completed: false },
    ])

    await second.resolve(jsonResponse({ ...older, completed: false }))
    expectActive("Older")
    expect(rows()).toEqual(["Newer", "Older"])
    expect(toasts()).toEqual([])
  })
})

describe("TodoRow: toggle failure", () => {
  const failures: [string, () => Promise<void>][] = [
    [
      "a network error",
      async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await click(checkbox("Older"))
        await advance(0)
      },
    ],
    [
      "a 5xx envelope",
      async () => {
        fetchMock.mockResolvedValueOnce(serverError())
        await click(checkbox("Older"))
        await advance(0)
      },
    ],
    [
      "a non-envelope body",
      async () => {
        fetchMock.mockResolvedValueOnce(
          new Response("<html>502 Bad Gateway</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          })
        )
        await click(checkbox("Older"))
        await advance(0)
      },
    ],
    [
      `the ${REQUEST_TIMEOUT_MS} ms timeout`,
      async () => {
        hangingFetch()
        await click(checkbox("Older"))
        await advance(REQUEST_TIMEOUT_MS - 1)
        expectCompleted("Older")
        expect(toasts()).toEqual([])
        await advance(1)
        // The toast renders on Sonner's next timer tick.
        await advance(1)
      },
    ],
  ]

  it.each(failures)(
    "%s: the row returns to its confirmed state, one toast, focus stays",
    async (_name, fail) => {
      await renderPopulated()
      const box = checkbox("Older")
      box.focus()

      await fail()

      expectActive("Older")
      expect(rows()).toEqual(["Newer", "Older"])
      expect(toasts()).toEqual([TOGGLE_FAILED])
      expect(screen.queryByText(/db exploded/)).not.toBeInTheDocument()
      expect(box).toHaveFocus()
      expect(checkbox("Older")).toBe(box)
    }
  )

  it("a failure rolls back a completed Todo to completed", async () => {
    await renderPopulated([newer, { ...older, completed: true }])
    fetchMock.mockResolvedValueOnce(serverError())

    await click(checkbox("Older"))
    await advance(0)

    expectCompleted("Older")
    expect(toasts()).toEqual([TOGGLE_FAILED])
  })

  it("a toggle queued after a failed toggle is dropped: no fetch, no second toast", async () => {
    await renderPopulated()
    const first = deferredFetch()

    await click(checkbox("Older"))
    await click(checkbox("Older"))
    await first.resolve(serverError())
    await advance(0)

    expect(patches()).toHaveLength(1)
    expect(toasts()).toEqual([TOGGLE_FAILED])
    expectActive("Older")
  })

  it("PATCH 404: the Todo is gone, so the row is removed, with one toggle toast; focus moves to the previous row", async () => {
    const { queryClient } = await renderPopulated()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "Todo not found" } },
        404
      )
    )

    act(() => checkbox("Older").focus())
    await click(checkbox("Older"))
    await advance(0)

    expect(queryCheckbox("Older")).not.toBeInTheDocument()
    expect(rows()).toEqual(["Newer"])
    expect(toasts()).toEqual([TOGGLE_FAILED])
    expect(getTodoSync(queryClient).confirmed.get(older.id)).toBeNull()
    // The removed row held focus: it goes to the previous row's checkbox.
    expect(checkbox("Newer")).toHaveFocus()
  })

  it("a toggle on a pending create is dropped when the create fails: only the create failure shows", async () => {
    await renderPopulated()
    const post = deferredFetch()

    const input = screen.getByRole("textbox", { name: "New todo" })
    fireEvent.change(input, { target: { value: "Brand new" } })
    await act(async () => {
      fireEvent.submit(input.closest("form")!)
    })
    expect(rows()).toEqual(["Brand new", "Newer", "Older"])

    act(() => checkbox("Brand new").focus())
    await click(checkbox("Brand new"))
    expectCompleted("Brand new")

    await post.resolve(serverError())
    await advance(0)

    expect(patches()).toEqual([])
    expect(rows()).toEqual(["Newer", "Older"])
    expect(toasts()).toEqual([CREATE_RESTORED])
    // The removed pending row held focus: it goes to the next row's checkbox.
    expect(checkbox("Newer")).toHaveFocus()
  })
})

describe("TodoRow: seeding and reload", () => {
  it("a list refetch while a toggle is pending keeps the toggle applied", async () => {
    const { queryClient } = await renderPopulated()
    const patch = deferredFetch()

    await click(checkbox("Older"))
    // A list fetch lands while the PATCH is in flight (server not yet updated).
    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [newer, older] }))
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: TODOS_QUERY_KEY })
    })
    expectCompleted("Older")
    expect(rows()).toEqual(["Newer", "Older"])

    await patch.resolve(jsonResponse({ ...older, completed: true }))
    expectCompleted("Older")
  })

  it("a list refetch while a create is pending keeps the pending row", async () => {
    const { queryClient } = await renderPopulated()
    const post = deferredFetch()

    const input = screen.getByRole("textbox", { name: "New todo" })
    fireEvent.change(input, { target: { value: "Brand new" } })
    await act(async () => {
      fireEvent.submit(input.closest("form")!)
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [newer, older] }))
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: TODOS_QUERY_KEY })
    })
    expect(rows()).toEqual(["Brand new", "Newer", "Older"])

    const body = JSON.parse(
      fetchMock.mock.calls.find(([, init]) => init?.method === "POST")![1]!
        .body as string
    ) as { id: string; description: string }
    await post.resolve(
      jsonResponse(
        makeTodo({ ...body, createdAt: "2026-09-24T15:30:00.000Z" }),
        201
      )
    )
    expect(rows()).toEqual(["Brand new", "Newer", "Older"])
  })

  it("reload: a fresh query shows the persisted completed, checked and struck through, in createdAt/id order", async () => {
    const { unmount } = await renderPopulated()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...older, completed: true }))
    await click(checkbox("Older"))
    await advance(0)
    unmount()

    // A completed and an active Todo with the same createdAt: order is by id
    // only, never by completion.
    const twin = makeTodo({
      id: "00000000-0000-7000-8000-000000000000",
      description: "Twin",
      createdAt: older.createdAt,
    })
    await renderPopulated([twin, newer, { ...older, completed: true }])

    expect(rows()).toEqual(["Newer", "Older", "Twin"])
    expectCompleted("Older")
    expectActive("Twin")
  })
})
