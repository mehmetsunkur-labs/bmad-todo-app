import { act, fireEvent, screen, within } from "@testing-library/react"
import {
  normalizeDescription,
  REQUEST_TIMEOUT_MS,
  type Todo,
} from "@todos/shared"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TODOS_QUERY_KEY } from "@/api/query-client"
import {
  HOVER_POINTER_QUERY,
  REDUCED_MOTION_QUERY,
} from "@/lib/use-media-query"
import {
  advance,
  deferredFetch,
  fetchMock,
  hangingFetch,
  setupFetchAndFakeTimers,
} from "@/test/fetch"
import { setMediaQuery } from "@/test/media"
import { jsonResponse, makeTodo, renderWithProviders } from "@/test/render"

import { TodoList } from "./todo-list"

const RESTORED = "Couldn't add that todo. Your text is back in the box."
const TOO_LONG = "That todo is too long. The limit is 500 characters."
const V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const existing = makeTodo({
  id: "00000000-0000-7000-8000-000000000001",
  description: "Existing",
  createdAt: "2026-09-24T09:00:00.000Z",
})

/** Echoes the POSTed Todo back as the server would, with its own time. */
function serverTodo(
  init: RequestInit | undefined,
  createdAt = "2026-09-24T15:30:00.123Z"
): Todo {
  const body = JSON.parse(init!.body as string) as {
    id: string
    description: string
  }
  return makeTodo({ ...body, createdAt })
}

async function renderPopulated(todos: Todo[] = [existing]) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ todos }))
  const result = renderWithProviders(<TodoList />)
  await advance(0)
  return result
}

const input = () => screen.getByRole("textbox", { name: "New todo" })
const addButton = () => screen.getByRole("button", { name: "Add" })
const form = () => input().closest("form")!
const counter = () => screen.getByTestId("character-counter")
const announcer = () => screen.getByTestId("announcer")
const rows = () =>
  within(screen.getByRole("list", { name: "Todos" }))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("p")!.textContent)
const posts = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([path, init]) => ({
      path,
      body: JSON.parse(init!.body as string) as {
        id: string
        description: string
      },
    }))
/** Toast messages on screen (each toast's message has role="status"). */
const toasts = () =>
  screen
    .queryAllByRole("status")
    .filter((el) =>
      el.closest("[data-sonner-toast]:not([data-removed='true'])")
    )
    .map((el) => el.textContent)
const retryButton = () => screen.queryByRole("button", { name: "Retry" })

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } })
}

/** Enter in the input submits the form (jsdom has no implicit submission). */
async function pressEnter() {
  await act(async () => {
    fireEvent.submit(form())
  })
}

async function add(text: string) {
  type(text)
  await pressEnter()
}

const networkError = () => new TypeError("Failed to fetch")

/** Adds `text`, types `busy` into the input, then fails the POST. */
async function failWhileBusy(text: string, busy = "new") {
  const post = deferredFetch()
  await add(text)
  type(busy)
  await post.resolve(
    jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
  )
}

// UTC, as this file has always used (todo-list uses local time).
setupFetchAndFakeTimers(new Date("2026-09-24T15:30:00.000Z"))

describe("Add row: layout and states", () => {
  it("is a form with the labelled input, the Add button, and a reserved counter line", async () => {
    await renderPopulated()

    expect(input()).toHaveAttribute("placeholder", "Add a todo…")
    expect(input()).toHaveAttribute("maxLength", "500")
    expect(input().tagName).toBe("INPUT")
    expect(form()).toContainElement(addButton())
    expect(addButton()).toHaveAttribute("type", "submit")
    // The Add row comes before the list.
    expect(
      form().compareDocumentPosition(screen.getByRole("list")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    // The counter line is always there, empty below the threshold.
    expect(counter()).toHaveClass("h-counter-line")
    expect(counter()).toHaveAttribute("aria-hidden", "true")
    expect(counter()).toHaveTextContent("")
  })

  it("disabled while the list is Loading, then enabled", async () => {
    const list = deferredFetch()
    renderWithProviders(<TodoList />)

    expect(input()).toBeDisabled()
    expect(addButton()).toBeDisabled()

    await list.resolve(jsonResponse({ todos: [] }))
    expect(input()).toBeEnabled()
    expect(addButton()).toBeEnabled()
  })

  it("disabled in the Load error state", async () => {
    fetchMock.mockRejectedValueOnce(networkError())
    renderWithProviders(<TodoList />)
    await advance(0)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(input()).toBeDisabled()
    expect(addButton()).toBeDisabled()
  })

  it("focuses the input when the list loads on a hover-capable fine pointer", async () => {
    setMediaQuery(HOVER_POINTER_QUERY, true)
    await renderPopulated([])
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument()
    expect(input()).toHaveFocus()
  })

  it("doesn't focus the input on touch or coarse pointers", async () => {
    await renderPopulated()
    expect(input()).not.toHaveFocus()
  })
})

describe("Add row: adding", () => {
  it("Add: Enter shows the row at the top before the fetch resolves", async () => {
    await renderPopulated()
    const post = deferredFetch()
    input().focus()

    await add("Buy milk")

    expect(rows()).toEqual(["Buy milk", "Existing"])
    expect(input()).toHaveValue("")
    expect(input()).toHaveFocus()
    expect(announcer()).toHaveTextContent("Todo added")
    expect(posts()).toHaveLength(1)
    const [{ path, body }] = posts()
    expect(path).toBe("/api/v1/todos")
    expect(Object.keys(body).sort()).toEqual(["description", "id"])
    expect(body.description).toBe("Buy milk")
    expect(body.id).toMatch(V7)
    // A pending Todo looks exactly like a confirmed one.
    const [pendingRow] = screen.getAllByRole("listitem")
    const [, confirmedRow] = screen.getAllByRole("listitem")
    expect(pendingRow!.className).toBe(confirmedRow!.className)

    const [, init] = fetchMock.mock.calls.at(-1)!
    await post.resolve(jsonResponse(serverTodo(init), 201))
    expect(rows()).toEqual(["Buy milk", "Existing"])
    expect(toasts()).toEqual([])
  })

  it("Add by button: trims the Description and keeps focus in the input", async () => {
    await renderPopulated()
    fetchMock.mockImplementationOnce(async (_p, init) =>
      jsonResponse(serverTodo(init), 201)
    )

    type("  a  ")
    await act(async () => {
      addButton().focus()
      fireEvent.click(addButton())
    })
    await advance(0)

    expect(posts().map((p) => p.body.description)).toEqual(["a"])
    expect(posts()[0]!.body.id).toMatch(V7)
    expect(rows()).toEqual(["a", "Existing"])
    expect(input()).toHaveValue("")
    expect(input()).toHaveFocus()
    expect(announcer()).toHaveTextContent("Todo added")
  })

  it("Confirmed: the server's values replace the provisional ones, re-placed by compareTodos", async () => {
    const newest = makeTodo({
      id: "00000000-0000-7000-8000-000000000003",
      description: "Newest",
      createdAt: "2026-09-24T12:00:00.000Z",
    })
    await renderPopulated([newest, existing])
    const post = deferredFetch()

    await add("Mine")
    expect(rows()).toEqual(["Mine", "Newest", "Existing"])
    const before = screen.getAllByRole("listitem")

    // The server's createdAt sorts it between the other two.
    const [, init] = fetchMock.mock.calls.at(-1)!
    const confirmed = serverTodo(init, "2026-09-24T10:00:00.000Z")
    await post.resolve(jsonResponse(confirmed, 201))

    expect(rows()).toEqual(["Newest", "Mine", "Existing"])
    const after = screen.getAllByRole("listitem")
    // The other rows are the same elements, untouched.
    expect(after[0]).toBe(before[1])
    expect(after[2]).toBe(before[2])
    expect(after[1]!.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-09-24T10:00:00.000Z"
    )
  })

  it.each(["", "   "])(
    "Empty submit (%j): no fetch, no toast, no row, focus stays",
    async (text) => {
      await renderPopulated()
      input().focus()

      await add(text)
      await act(async () => {
        fireEvent.click(addButton())
      })
      await advance(0)

      expect(fetchMock).toHaveBeenCalledTimes(1) // only the list load
      expect(posts()).toEqual([])
      expect(toasts()).toEqual([])
      expect(rows()).toEqual(["Existing"])
      expect(input()).toHaveFocus()
      expect(announcer()).not.toHaveTextContent("Todo added")
    }
  )

  it("announces 'Todo added' again for a second add", async () => {
    await renderPopulated()
    fetchMock.mockImplementation(async (_p, init) =>
      jsonResponse(serverTodo(init), 201)
    )

    await add("one")
    const first = announcer().firstElementChild
    await add("two")
    expect(announcer()).toHaveTextContent("Todo added")
    // A fresh node, so screen readers announce the repeat.
    expect(announcer().firstElementChild).not.toBe(first)
  })
})

describe("Add row: character counter", () => {
  it("hidden at 449; '450 / 500' at 450, announced; destructive '500 / 500' at 500, announced", async () => {
    await renderPopulated()
    const height = counter().className

    type("a".repeat(449))
    expect(counter()).toHaveTextContent("")
    expect(announcer()).toHaveTextContent("")

    type("a".repeat(450))
    expect(counter()).toHaveTextContent("450 / 500")
    expect(counter().firstElementChild).not.toHaveClass("text-destructive")
    expect(counter()).toHaveClass("text-meta", "text-right")
    expect(announcer()).toHaveTextContent("450 / 500")

    // Not announced on every keystroke.
    type("a".repeat(451))
    expect(counter()).toHaveTextContent("451 / 500")
    expect(announcer()).toHaveTextContent("450 / 500")

    type("a".repeat(500))
    expect(counter()).toHaveTextContent("500 / 500")
    expect(counter().firstElementChild).toHaveClass("text-destructive")
    expect(announcer()).toHaveTextContent("500 / 500")

    // The reserved line never changes, so the list doesn't move.
    expect(counter().className).toBe(height)
  })

  it("counts the raw input length, including spaces", async () => {
    await renderPopulated()
    type(`${" ".repeat(10)}${"a".repeat(440)}`)
    expect(counter()).toHaveTextContent("450 / 500")
  })
})

describe("Add row: failed create, input empty", () => {
  const failures: [string, () => void][] = [
    ["NETWORK", () => fetchMock.mockRejectedValueOnce(networkError())],
    [
      "a 5xx envelope",
      () =>
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500)
        ),
    ],
    [
      "a 503 UNAVAILABLE",
      () =>
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ error: { code: "UNAVAILABLE", message: "db" } }, 503)
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
    [
      "a 409 CONFLICT",
      () =>
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ error: { code: "CONFLICT", message: "c" } }, 409)
        ),
    ],
  ]

  it.each(failures)(
    "%s: row removed, text back, one plain restore toast",
    async (_name, fail) => {
      await renderPopulated()
      input().focus()
      fail()

      await add("  Buy milk  ")
      await advance(0)

      expect(rows()).toEqual(["Existing"])
      // The normalized Description that was sent, not the raw keystrokes.
      expect(input()).toHaveValue("Buy milk")
      expect(input()).toHaveFocus()
      expect(toasts()).toEqual([RESTORED])
      expect(retryButton()).not.toBeInTheDocument()
      expect(document.body).not.toHaveTextContent(/boom|db\b/)
    }
  )

  it(`after the ${REQUEST_TIMEOUT_MS} ms timeout`, async () => {
    await renderPopulated()
    hangingFetch()

    await add("Buy milk")
    await advance(REQUEST_TIMEOUT_MS - 1)
    expect(rows()).toEqual(["Buy milk", "Existing"])
    expect(toasts()).toEqual([])

    await advance(1)
    // The toast renders on Sonner's next timer tick.
    await advance(1)
    expect(rows()).toEqual(["Existing"])
    expect(input()).toHaveValue("Buy milk")
    expect(toasts()).toEqual([RESTORED])
  })

  it("moves focus to the input from <body>", async () => {
    await renderPopulated()
    const post = deferredFetch()
    await add("Buy milk")
    await act(async () => {
      input().blur()
    })
    expect(document.activeElement).toBe(document.body)

    await post.resolve(
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
    )
    expect(input()).toHaveValue("Buy milk")
    expect(input()).toHaveFocus()
  })

  it("leaves focus alone when it is elsewhere", async () => {
    await renderPopulated()
    const post = deferredFetch()
    await add("Buy milk")
    const elsewhere = screen.getByRole("checkbox", { name: "Existing" })
    await act(async () => {
      elsewhere.focus()
    })

    await post.resolve(
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
    )
    expect(input()).toHaveValue("Buy milk")
    expect(elsewhere).toHaveFocus()
    expect(toasts()).toEqual([RESTORED])
  })

  it("moves focus to the input from the list region (free focus, like <body>)", async () => {
    await renderPopulated()
    const post = deferredFetch()
    await add("Buy milk")
    const region = screen.getByTestId("todo-list-region")
    await act(async () => {
      region.focus()
    })

    await post.resolve(
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
    )
    expect(input()).toHaveValue("Buy milk")
    expect(input()).toHaveFocus()
    expect(toasts()).toEqual([RESTORED])
  })
})

describe("Add row: resubmitting restored text", () => {
  /** Adds `text` and fails it by the 10 s timeout, so it is restored. */
  async function timeOut(text: string) {
    hangingFetch()
    await add(text)
    await advance(REQUEST_TIMEOUT_MS)
    await advance(1)
    expect(input()).toHaveValue(normalizeDescription(text))
    expect(toasts()).toEqual([RESTORED])
  }

  const echo = () =>
    fetchMock.mockImplementationOnce(async (_p, init) =>
      jsonResponse(serverTodo(init), 200)
    )

  it("resubmitting after a timeout sends the same id and Description; one row", async () => {
    await renderPopulated()
    await timeOut("Buy milk")

    // The first POST may have committed: the server replays it (200).
    echo()
    await pressEnter()
    await advance(0)

    const [first, second] = posts()
    expect(posts()).toHaveLength(2)
    expect(second!.body).toEqual(first!.body)
    expect(second!.body).toEqual({
      id: first!.body.id,
      description: "Buy milk",
    })
    expect(rows()).toEqual(["Buy milk", "Existing"])
  })

  it("text that normalizes to the restored Description reuses the id", async () => {
    await renderPopulated()
    await timeOut("Buy milk")

    echo()
    await add("  Buy milk   ")
    await advance(0)

    const [first, second] = posts()
    expect(second!.body).toEqual({
      id: first!.body.id,
      description: "Buy milk",
    })
  })

  it("edited text gets a new id", async () => {
    await renderPopulated()
    await timeOut("Buy milk")

    echo()
    await add("Buy milk!")
    await advance(0)

    const [first, second] = posts()
    expect(second!.body.description).toBe("Buy milk!")
    expect(second!.body.id).toMatch(V7)
    expect(second!.body.id).not.toBe(first!.body.id)
  })

  it("the remembered id is used once: a later add of the same text gets a new id", async () => {
    await renderPopulated()
    await timeOut("Buy milk")

    echo()
    await pressEnter()
    await advance(0)
    fetchMock.mockImplementationOnce(async (_p, init) =>
      jsonResponse(serverTodo(init), 201)
    )
    await add("Buy milk")
    await advance(0)

    const [first, second, third] = posts()
    expect(second!.body.id).toBe(first!.body.id)
    expect(third!.body).toEqual({
      id: expect.stringMatching(V7),
      description: "Buy milk",
    })
    expect(third!.body.id).not.toBe(first!.body.id)
  })

  it("an edited submit also clears the remembered id", async () => {
    await renderPopulated()
    await timeOut("Buy milk")

    echo()
    await add("Other")
    await advance(0)
    echo()
    await add("Buy milk")
    await advance(0)

    const [first, , third] = posts()
    expect(third!.body.description).toBe("Buy milk")
    expect(third!.body.id).not.toBe(first!.body.id)
  })

  it("a newer restore replaces the remembered id", async () => {
    await renderPopulated()
    await timeOut("Buy milk")
    // The edited resubmit fails too and is restored under its new id, which
    // replaces the remembered one.
    fetchMock.mockRejectedValueOnce(networkError())
    await add("Buy milk!")
    await advance(1)
    expect(input()).toHaveValue("Buy milk!")

    echo()
    await pressEnter()
    await advance(0)

    const [first, second, third] = posts()
    expect(second!.body.id).not.toBe(first!.body.id)
    expect(third!.body).toEqual({
      id: second!.body.id,
      description: "Buy milk!",
    })
  })

  it("input busy: nothing is remembered, so re-adding the failed text gets a new id", async () => {
    await renderPopulated()
    await failWhileBusy("Buy milk")
    expect(input()).toHaveValue("new")
    expect(toasts()).toEqual(["Couldn't add “Buy milk”."])

    echo()
    await add("Buy milk")
    await advance(0)

    const [first, second] = posts()
    expect(second!.body.description).toBe("Buy milk")
    expect(second!.body.id).not.toBe(first!.body.id)
  })
})

describe("Add row: failed create, input busy", () => {
  it("keeps the new text; persistent toast quotes the failed text; Retry resends the same id and text", async () => {
    await renderPopulated()
    const post = deferredFetch()
    await add("Buy milk")
    type("new")

    await post.resolve(
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
    )
    expect(rows()).toEqual(["Existing"])
    expect(input()).toHaveValue("new")
    expect(toasts()).toEqual(["Couldn't add “Buy milk”."])
    expect(retryButton()).toBeInTheDocument()

    // Persistent: still there long after 8 s.
    await advance(60_000)
    expect(toasts()).toEqual(["Couldn't add “Buy milk”."])

    const retry = deferredFetch()
    const announcedBefore = announcer().firstElementChild
    await act(async () => {
      fireEvent.click(retryButton()!)
    })
    await advance(0)
    expect(rows()).toEqual(["Buy milk", "Existing"])
    // Retry announces "Todo added" again, in a fresh node.
    expect(announcer()).toHaveTextContent("Todo added")
    expect(announcer().firstElementChild).not.toBe(announcedBefore)
    const [first, second] = posts()
    expect(second!.body).toEqual(first!.body)
    expect(second!.body).toEqual({
      id: first!.body.id,
      description: "Buy milk",
    })
    // Clicking Retry dismisses that toast.
    await advance(500)
    expect(toasts()).toEqual([])
    expect(input()).toHaveValue("new")

    const [, init] = fetchMock.mock.calls.at(-1)!
    await retry.resolve(jsonResponse(serverTodo(init), 201))
    expect(rows()).toEqual(["Buy milk", "Existing"])
    expect(toasts()).toEqual([])
  })

  it("a Retry that fails again applies the rules to the input as it is then", async () => {
    await renderPopulated()
    await failWhileBusy("Buy milk")
    expect(toasts()).toEqual(["Couldn't add “Buy milk”."])

    // The user clears the input, then retries: the retry fails too.
    type("")
    fetchMock.mockRejectedValueOnce(networkError())
    await act(async () => {
      fireEvent.click(retryButton()!)
    })
    await advance(500)

    expect(rows()).toEqual(["Existing"])
    expect(input()).toHaveValue("Buy milk")
    expect(toasts()).toEqual([RESTORED])
  })

  it("quotes the first 40 characters and '…' for a longer Description", async () => {
    await renderPopulated()
    await failWhileBusy(`${"x".repeat(40)}yz`)

    expect(toasts()).toEqual([`Couldn't add “${"x".repeat(40)}…”.`])
  })

  it("quotes a Description of exactly 40 characters as-is", async () => {
    await renderPopulated()
    await failWhileBusy("y".repeat(40))

    expect(toasts()).toEqual([`Couldn't add “${"y".repeat(40)}”.`])
  })
})

describe("Add row: too long", () => {
  const tooLong = () =>
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "description is too long",
            details: [{ field: "description", reason: "too_long" }],
          },
        },
        400
      )
    )

  it("input empty: too-long copy, text restored", async () => {
    await renderPopulated()
    tooLong()
    await add("Buy milk")
    await advance(0)

    expect(rows()).toEqual(["Existing"])
    expect(input()).toHaveValue("Buy milk")
    expect(toasts()).toEqual([TOO_LONG])
    expect(document.body).not.toHaveTextContent("description is too long")
  })

  it("input busy: too-long copy, input left alone", async () => {
    await renderPopulated()
    const post = deferredFetch()
    await add("Buy milk")
    type("new")
    await post.resolve(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "m",
            details: [{ field: "description", reason: "too_long" }],
          },
        },
        400
      )
    )

    expect(input()).toHaveValue("new")
    expect(toasts()).toEqual([TOO_LONG])
  })

  it("another VALIDATION_ERROR uses the create failure copy", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "m",
            details: [{ field: "description", reason: "empty" }],
          },
        },
        400
      )
    )
    await add("Buy milk")
    await advance(0)
    expect(toasts()).toEqual([RESTORED])
  })
})

describe("Add row: other Todos and toasts", () => {
  it("two creates failing in the same tick: the first is restored, the second gets Retry", async () => {
    await renderPopulated()
    const release: ((response: Response) => void)[] = []
    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(
        () => new Promise<Response>((resolve) => release.push(resolve))
      )
    }
    await add("First")
    await add("Second")
    expect(release).toHaveLength(2)

    // Both failures settle inside one act, before React re-renders.
    await act(async () => {
      for (const resolve of release) {
        resolve(
          jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
        )
      }
    })
    await advance(1)

    expect(rows()).toEqual(["Existing"])
    expect(input()).toHaveValue("First")
    expect(toasts().sort()).toEqual([RESTORED, "Couldn't add “Second”."].sort())
    expect(toasts().filter((t) => t === RESTORED)).toHaveLength(1)
    expect(retryButton()).toBeInTheDocument()
  })

  it("keeps the other rows' cached objects when a Todo is added and confirmed", async () => {
    const other = makeTodo({
      id: "00000000-0000-7000-8000-000000000002",
      description: "Other",
      createdAt: "2026-09-24T08:00:00.000Z",
    })
    const { queryClient } = await renderPopulated([existing, other])
    const cached = () => queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)!
    const [existingObj, otherObj] = cached()

    const post = deferredFetch()
    await add("Buy milk")
    const [, init] = fetchMock.mock.calls.at(-1)!
    await post.resolve(jsonResponse(serverTodo(init), 201))

    expect(cached().map((t) => t.description)).toEqual([
      "Buy milk",
      "Existing",
      "Other",
    ])
    expect(cached()[1]).toBe(existingObj)
    expect(cached()[2]).toBe(otherObj)
  })

  it("Other Todos: only the failed row is removed", async () => {
    await renderPopulated()
    const first = deferredFetch()
    const second = deferredFetch()

    await add("First")
    await add("Second")
    // Same provisional time: the later v7 id sorts first.
    expect(rows()).toEqual(["Second", "First", "Existing"])

    await second.resolve(
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 500)
    )
    expect(rows()).toEqual(["First", "Existing"])
    expect(toasts()).toEqual([RESTORED])

    const [, init] = fetchMock.mock.calls[1]!
    await first.resolve(jsonResponse(serverTodo(init), 201))
    expect(rows()).toEqual(["First", "Existing"])
  })
})

describe("Add row: new row entrance", () => {
  function stubAnimate() {
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null }))
    Object.defineProperty(HTMLElement.prototype, "animate", {
      value: animate,
      configurable: true,
      writable: true,
    })
    return animate
  }

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  })

  it("loaded rows don't animate; a new row expands its height over 150 ms at full opacity", async () => {
    const animate = stubAnimate()
    await renderPopulated()
    expect(animate).not.toHaveBeenCalled()

    deferredFetch()
    await add("Buy milk")
    expect(animate).toHaveBeenCalledTimes(1)
    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions,
    ]
    expect(keyframes[0]).toMatchObject({ height: "0px" })
    expect(keyframes.some((k) => "opacity" in k)).toBe(false)
    expect(options).toMatchObject({ duration: 150 })
  })

  it("the first add from the Empty state animates too", async () => {
    const animate = stubAnimate()
    await renderPopulated([])
    deferredFetch()
    await add("First")
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it("is instant under prefers-reduced-motion", async () => {
    setMediaQuery(REDUCED_MOTION_QUERY, true)
    const animate = stubAnimate()
    await renderPopulated()
    deferredFetch()
    await add("Buy milk")
    expect(rows()).toEqual(["Buy milk", "Existing"])
    expect(animate).not.toHaveBeenCalled()
  })
})
