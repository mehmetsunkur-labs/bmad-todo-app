import { onlineManager } from "@tanstack/react-query"
import { act, fireEvent, screen, within } from "@testing-library/react"
import { REQUEST_TIMEOUT_MS } from "@todos/shared"
import { describe, expect, it } from "vitest"

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

/** A fetch whose response the test releases by hand (flushed in the same act). */
const deferredFetch = () => makeDeferredFetch({ flushInSameAct: true })

const skeletons = () => screen.queryAllByTestId("todo-skeleton")
const list = () => screen.queryByRole("list", { name: "Todos" })

// Local wall-clock time, as this file has always used (add-row uses UTC).
setupFetchAndFakeTimers(new Date(2026, 8, 24, 15, 30, 0))

describe("TodoList: List States", () => {
  it("fast load: data before 300 ms never renders the skeleton", async () => {
    const pending = deferredFetch()
    renderWithProviders(<TodoList />)

    expect(list()).toHaveAttribute("aria-busy", "true")
    expect(skeletons()).toHaveLength(0)
    await advance(200)
    expect(skeletons()).toHaveLength(0)

    await pending.resolve(jsonResponse({ todos: [makeTodo()] }))
    expect(skeletons()).toHaveLength(0)
    await advance(1_000)
    expect(skeletons()).toHaveLength(0)
    expect(screen.getByText("Buy milk")).toBeInTheDocument()
    expect(list()).not.toHaveAttribute("aria-busy")
  })

  it("slow load: 4 aria-hidden skeleton rows after 300 ms, aria-busy until data", async () => {
    const pending = deferredFetch()
    renderWithProviders(<TodoList />)

    await advance(299)
    expect(skeletons()).toHaveLength(0)
    expect(list()).toHaveAttribute("aria-busy", "true")

    await advance(1)
    const rows = skeletons()
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row).toHaveAttribute("aria-hidden", "true")
      // Single column like the real row: a text bar and a short meta bar,
      // no checkbox square until Epic 2.
      const bars = row.querySelectorAll('[data-slot="skeleton"]')
      expect(bars).toHaveLength(2)
      expect(row.querySelector(".size-4")).toBeNull()
    }
    expect(list()).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument()

    await pending.resolve(jsonResponse({ todos: [makeTodo()] }))
    expect(skeletons()).toHaveLength(0)
    expect(list()).not.toHaveAttribute("aria-busy")
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("empty DB: shows the Empty state with its exact copy", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [] }))
    renderWithProviders(<TodoList />)
    await advance(0)

    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument()
    expect(screen.getByText("Add your first todo above.")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument()
  })

  it("populated: rows newest first, each with its Description and Created At", async () => {
    const older = makeTodo({
      id: "00000000-0000-7000-8000-000000000001",
      description: "older",
      createdAt: new Date(2026, 8, 24, 13, 0, 0).toISOString(),
    })
    const newer = makeTodo({
      id: "00000000-0000-7000-8000-000000000002",
      description: "newer",
      createdAt: new Date(2026, 8, 24, 15, 25, 0).toISOString(),
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [older, newer] }))
    const { queryClient } = renderWithProviders(<TodoList />)
    await advance(0)

    const items = within(list()!).getAllByRole("listitem")
    expect(items.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "newer",
      "older",
    ])
    const time = items[0]!.querySelector("time")!
    expect(time).toHaveAttribute("dateTime", newer.createdAt)
    expect(time).toHaveTextContent("5m ago")
    expect(items[1]!.querySelector("time")).toHaveTextContent("2h ago")

    // The list success seeds todo-sync confirmed state.
    expect(getTodoSync(queryClient).confirmed.get(newer.id)).toEqual(newer)
  })

  it("refreshes Created At every minute from the shared ticker", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        todos: [makeTodo({ createdAt: new Date().toISOString() })],
      })
    )
    renderWithProviders(<TodoList />)
    await advance(0)

    const time = screen.getByRole("listitem").querySelector("time")!
    expect(time).toHaveTextContent("just now")
    await advance(60_000)
    expect(time).toHaveTextContent("1m ago")
    await advance(4 * 60_000)
    expect(time).toHaveTextContent("5m ago")
  })

  it("shows the full date and time: Tooltip on hover, and 'Created …' text for focus-within", async () => {
    const createdAt = new Date(2026, 8, 24, 9, 14, 0).toISOString()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ todos: [makeTodo({ createdAt })] })
    )
    renderWithProviders(<TodoList />)
    await advance(0)

    const time = screen.getByRole("listitem").querySelector("time")!
    expect(time).toHaveTextContent("6h ago")
    // The focus-within text is present but hidden until the row has focus.
    expect(within(time).getByText("Created Sep 24, 2026, 9:14 AM")).toHaveClass(
      "hidden"
    )
    // The time adds no tab stop.
    expect(time).not.toHaveAttribute("tabindex")

    // A touch pointer doesn't open the Tooltip; a mouse pointer over it does.
    fireEvent.pointerMove(time, { pointerType: "touch" })
    await advance(0)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    fireEvent.pointerMove(time, { pointerType: "mouse" })
    await advance(0)
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Sep 24, 2026, 9:14 AM"
    )
  })

  it("renders unsafe text literally, unlinked, and wrappable", async () => {
    const html = "<b>x</b> https://a.b"
    const long = "a".repeat(500)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        todos: [
          makeTodo({
            id: "00000000-0000-7000-8000-000000000002",
            description: html,
          }),
          makeTodo({
            id: "00000000-0000-7000-8000-000000000001",
            description: long,
          }),
        ],
      })
    )
    renderWithProviders(<TodoList />)
    await advance(0)

    const htmlText = screen.getByText(html)
    expect(htmlText.querySelector("b")).toBeNull()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()

    const longText = screen.getByText(long)
    expect(longText.textContent).toHaveLength(500)
    expect(longText).toHaveClass("wrap-anywhere")
    expect(longText.className).not.toMatch(/truncate|line-clamp|ellipsis/)
  })

  it("extra field: a Todo with an unknown key parses and renders", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ todos: [{ ...makeTodo(), ownerId: "o-1" }], extra: 1 })
    )
    renderWithProviders(<TodoList />)
    await advance(0)

    expect(screen.getByText("Buy milk")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("TodoList: Load error", () => {
  const failures: [string, () => void][] = [
    [
      "a network error",
      () => fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")),
    ],
    [
      "a 5xx envelope",
      () =>
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500)
        ),
    ],
    [
      "a non-envelope body",
      () =>
        fetchMock.mockResolvedValueOnce(
          new Response("<html>502 Bad Gateway</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          })
        ),
    ],
  ]

  function expectLoadError() {
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Couldn't load your todos.")
    expect(alert).toHaveTextContent("Check your connection and try again.")
    expect(
      within(alert).getByRole("button", { name: "Try again" })
    ).toBeInTheDocument()
    // Never an empty list, never the Empty state.
    expect(list()).not.toBeInTheDocument()
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument()
    expect(alert).not.toHaveTextContent("boom")
  }

  it.each(failures)(
    "shows the Load error state for %s",
    async (_name, fail) => {
      fail()
      renderWithProviders(<TodoList />)
      await advance(0)
      expectLoadError()
    }
  )

  it(`shows the Load error state after the ${REQUEST_TIMEOUT_MS} ms timeout`, async () => {
    hangingFetch()
    renderWithProviders(<TodoList />)

    await advance(REQUEST_TIMEOUT_MS - 1)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(skeletons()).toHaveLength(4)

    await advance(1)
    expectLoadError()
  })

  it("Try again → Loading → the refetched result", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    renderWithProviders(<TodoList />)
    await advance(0)
    expectLoadError()

    const pending = deferredFetch()
    await act(async () => {
      screen.getByRole("button", { name: "Try again" }).click()
    })
    await advance(0)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(list()).toHaveAttribute("aria-busy", "true")
    expect(skeletons()).toHaveLength(0)
    await advance(300)
    expect(skeletons()).toHaveLength(4)

    await pending.resolve(jsonResponse({ todos: [makeTodo()] }))
    expect(screen.getByText("Buy milk")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("Try again can land in the Empty state", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [] }))
    renderWithProviders(<TodoList />)
    await advance(0)
    await act(async () => {
      screen.getByRole("button", { name: "Try again" }).click()
    })
    await advance(0)
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument()
  })

  it("offline: a rejected fetch still shows the Load error (networkMode 'always')", async () => {
    onlineManager.setOnline(false)
    try {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      renderWithProviders(<TodoList />)
      await advance(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expectLoadError()
    } finally {
      onlineManager.setOnline(true)
    }
  })
})

describe("TodoList: focus after Try again", () => {
  const region = () => screen.getByTestId("todo-list-region")

  async function failThenPressTryAgain() {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    renderWithProviders(<TodoList />)
    await advance(0)
    const button = screen.getByRole("button", { name: "Try again" })
    button.focus()
    expect(button).toHaveFocus()
    return button
  }

  it("the list region is a non-tabbable focus target around every state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [makeTodo()] }))
    renderWithProviders(<TodoList />)
    expect(region()).toHaveAttribute("tabindex", "-1")
    expect(region()).toContainElement(list())
    await advance(0)
    expect(region()).toContainElement(list())
  })

  it("moves focus to the list region and keeps it there through Loading to rows", async () => {
    const button = await failThenPressTryAgain()
    const pending = deferredFetch()

    await act(async () => {
      fireEvent.click(button)
    })
    expect(region()).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)

    await advance(300)
    expect(skeletons()).toHaveLength(4)
    expect(region()).toContainElement(list())
    expect(region()).toHaveFocus()

    await pending.resolve(jsonResponse({ todos: [makeTodo()] }))
    expect(screen.getByText("Buy milk")).toBeInTheDocument()
    expect(region()).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it("keeps focus on the list region when the retry lands in the Empty state", async () => {
    const button = await failThenPressTryAgain()
    fetchMock.mockResolvedValueOnce(jsonResponse({ todos: [] }))

    await act(async () => {
      fireEvent.click(button)
    })
    await advance(0)
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument()
    expect(region()).toHaveFocus()
  })

  it("keeps focus on the list region when the retry fails again", async () => {
    const button = await failThenPressTryAgain()
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))

    await act(async () => {
      fireEvent.click(button)
    })
    await advance(0)
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(region()).toContainElement(screen.getByRole("alert"))
    expect(region()).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })
})
