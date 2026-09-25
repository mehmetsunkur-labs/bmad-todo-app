import { act, fireEvent, screen, within } from "@testing-library/react"
import { REQUEST_TIMEOUT_MS, type Todo } from "@todos/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createQueryClient } from "@/api/query-client"
import { getTodoSync } from "@/api/todo-sync"
import { HOVER_POINTER_QUERY } from "@/lib/use-media-query"
import {
  advance,
  deferredFetch as makeDeferredFetch,
  fetchMock,
  hangingFetch,
  setupFetchAndFakeTimers,
} from "@/test/fetch"
import { setMediaQuery } from "@/test/media"
import { jsonResponse, makeTodo, renderWithProviders } from "@/test/render"

import { TodoList } from "./todo-list"

const EDIT_FAILED = "Couldn't save your edit. Please try again."
const TOO_LONG = "That todo is too long. The limit is 500 characters."
const TOGGLE_FAILED = "Couldn't update that todo. Please try again."

/** A fetch whose response the test releases by hand (flushed in the same act). */
const deferredFetch = () => makeDeferredFetch({ flushInSameAct: true })

const top = makeTodo({
  id: "00000000-0000-7000-8000-000000000003",
  description: "Top",
  createdAt: "2026-09-24T11:00:00.000Z",
})
const middle = makeTodo({
  id: "00000000-0000-7000-8000-000000000002",
  description: "Middle",
  createdAt: "2026-09-24T10:00:00.000Z",
})
const bottom = makeTodo({
  id: "00000000-0000-7000-8000-000000000001",
  description: "Bottom",
  createdAt: "2026-09-24T09:00:00.000Z",
})

async function renderPopulated(
  todos: Todo[] = [top, middle, bottom],
  queryClient = createQueryClient()
) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ todos }))
  const result = renderWithProviders(<TodoList />, { queryClient })
  await advance(0)
  return result
}

const rowOf = (todo: Todo) =>
  document.querySelector<HTMLElement>(`li[data-todo-id="${todo.id}"]`)
const checkbox = (name: string) => screen.getByRole("checkbox", { name })
const editButton = (name: string) =>
  screen.getByRole("button", { name: `Edit todo: ${name}` })
const deleteButton = (name: string) =>
  screen.getByRole("button", { name: `Delete todo: ${name}` })
const field = () => screen.getByRole("textbox", { name: /^Edit todo: / })
const queryField = () => screen.queryByRole("textbox", { name: /^Edit todo: / })
const fieldIn = (todo: Todo) =>
  rowOf(todo)!.querySelector<HTMLTextAreaElement>("textarea")
const addInput = () => screen.getByRole("textbox", { name: "New todo" })
const retryButton = () => screen.queryByRole("button", { name: "Retry" })
/** Each row as shown: the edit field's value, or the Description. */
const rows = () =>
  within(screen.getByRole("list", { name: "Todos" }))
    .queryAllByRole("listitem")
    .map(
      (li) =>
        li.querySelector("textarea")?.value ??
        li.querySelector("p")!.textContent
    )
const announcer = () => screen.getByTestId("announcer")
const toasts = () =>
  screen
    .queryAllByRole("status")
    .filter((el) =>
      el.closest("[data-sonner-toast]:not([data-removed='true'])")
    )
    .map((el) => el.textContent)
const callsWith = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)
const patches = () =>
  callsWith("PATCH").map(([path, init]) => ({
    path,
    body: JSON.parse(init!.body as string) as unknown,
  }))

async function click(element: HTMLElement) {
  await act(async () => {
    element.focus()
    fireEvent.click(element)
  })
}

async function type(text: string, target: HTMLElement = field()) {
  await act(async () => {
    fireEvent.change(target, { target: { value: text } })
  })
}

async function press(key: string, target: HTMLElement = field()) {
  await act(async () => {
    fireEvent.keyDown(target, { key })
  })
}

async function focus(element: HTMLElement) {
  await act(async () => element.focus())
}

/** Opens `name`'s edit, types `text`, presses Enter. */
async function editWithEnter(name: string, text: string) {
  await click(editButton(name))
  await type(text)
  await press("Enter")
}

const saved = (todo: Todo, description: string): Todo => ({
  ...todo,
  description,
  updatedAt: "2026-09-24T15:30:00.000Z",
})
const serverError = () =>
  jsonResponse({ error: { code: "INTERNAL", message: "db exploded" } }, 500)
const notFound = () =>
  jsonResponse({ error: { code: "NOT_FOUND", message: "Todo not found" } }, 404)
const tooLong = () =>
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

setupFetchAndFakeTimers(new Date("2026-09-24T15:30:00.000Z"))

// jsdom's document never has focus; a real page does while the user is in it.
beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true)
})

describe("TodoRow: Edit button", () => {
  it("is a ghost Pencil icon button named 'Edit todo: {Description}', muted and foreground on hover/focus", async () => {
    await renderPopulated()
    const button = editButton("Middle")

    expect(button).toHaveAttribute("data-variant", "ghost")
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveClass(
      "size-touch-target",
      "text-muted-foreground",
      "hover:text-foreground",
      "focus-visible:text-foreground"
    )
    const icon = button.querySelector("svg")!
    expect(icon).toHaveClass("lucide-pencil", "size-4")
    expect(icon).toHaveAttribute("aria-hidden", "true")
  })

  it("sits in the Row actions before Delete; tab order is checkbox, Edit, Delete", async () => {
    await renderPopulated()
    const row = rowOf(middle)!
    const actions = within(row).getByTestId("row-actions")
    expect(actions).toContainElement(editButton("Middle"))
    const focusable = Array.from(
      row.querySelectorAll<HTMLElement>(
        "button, input, textarea, a, [tabindex]"
      )
    )
    expect(focusable).toEqual([
      checkbox("Middle"),
      editButton("Middle"),
      deleteButton("Middle"),
    ])
  })

  it("hover and fine pointer: hidden with the Row actions until hover or focus, still tabbable", async () => {
    setMediaQuery(HOVER_POINTER_QUERY, true)
    await renderPopulated()
    const actions = within(rowOf(middle)!).getByTestId("row-actions")
    expect(actions).toHaveClass(
      "opacity-0",
      "group-focus-within/row:opacity-100"
    )
    expect(editButton("Middle")).not.toHaveAttribute("tabindex", "-1")
  })
})

describe("TodoRow: open edit", () => {
  it("Edit: the field shows the Description, focused, all selected; checkbox, Created At and Row actions stay", async () => {
    await renderPopulated()
    await click(editButton("Middle"))

    const textarea = field()
    expect(textarea.tagName).toBe("TEXTAREA")
    expect(textarea).toHaveValue("Middle")
    expect(textarea).toHaveFocus()
    expect((textarea as HTMLTextAreaElement).selectionStart).toBe(0)
    expect((textarea as HTMLTextAreaElement).selectionEnd).toBe(6)
    expect(textarea).toHaveAttribute("rows", "1")
    expect(textarea).toHaveAttribute("maxLength", "500")
    expect(textarea).toHaveClass("text-(length:--text-todo-description)")

    const row = rowOf(middle)!
    expect(row).toContainElement(textarea)
    expect(within(row).getByRole("checkbox")).toBeInTheDocument()
    expect(row.querySelector("time")).toBeInTheDocument()
    expect(within(row).getByTestId("row-actions")).toContainElement(
      editButton("Middle")
    )
    expect(deleteButton("Middle")).toBeInTheDocument()
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
  })

  it("the checkbox's accessible name still resolves to the Description while editing", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    expect(checkbox("Middle")).toBeInTheDocument()
  })

  it("double-click on the Description opens edit on a hover device only", async () => {
    await renderPopulated()
    const description = () => screen.getByText("Middle", { selector: "li p" })

    await act(async () => {
      fireEvent.doubleClick(description())
    })
    expect(queryField()).toBeNull()

    await act(async () => setMediaQuery(HOVER_POINTER_QUERY, true))
    await act(async () => {
      fireEvent.doubleClick(description())
    })
    expect(field()).toHaveValue("Middle")
    expect(field()).toHaveFocus()
  })

  it("counter: shown and announced at 450, destructive and announced at 500", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    const counter = () =>
      within(rowOf(middle)!).getByTestId("character-counter")

    expect(counter()).toHaveTextContent("")
    await type("a".repeat(450))
    expect(counter()).toHaveTextContent("450 / 500")
    expect(announcer()).toHaveTextContent("450 / 500")
    expect(counter().querySelector("span")).not.toHaveClass("text-destructive")

    await type("a".repeat(500))
    expect(counter()).toHaveTextContent("500 / 500")
    expect(announcer()).toHaveTextContent("500 / 500")
    expect(counter().querySelector("span")).toHaveClass("text-destructive")
  })

  it("the field grows to its content height", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    const textarea = field()
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 72,
    })
    await type("a much longer Description")
    expect(textarea.style.height).toBe("72px")
  })
})

describe("TodoRow: save edit", () => {
  it("Enter: PATCH { description } normalized, shown at once in the same position, 'Todo updated', focus on Edit", async () => {
    await renderPopulated()
    const patch = deferredFetch()

    await click(editButton("Middle"))
    await type(" Buy  oat\nmilk ")
    expect(field()).toHaveValue(" Buy  oat milk ")
    await press("Enter")

    expect(patches()).toEqual([
      {
        path: `/api/v1/todos/${middle.id}`,
        body: { description: "Buy  oat milk" },
      },
    ])
    expect(queryField()).toBeNull()
    expect(rows()).toEqual(["Top", "Buy  oat milk", "Bottom"])
    expect(announcer()).toHaveTextContent("Todo updated")
    // Accessible names collapse whitespace.
    expect(editButton("Buy oat milk")).toHaveFocus()
    expect(checkbox("Buy oat milk")).toBeInTheDocument()

    await patch.resolve(jsonResponse(saved(middle, "Buy  oat milk")))
    expect(rows()).toEqual(["Top", "Buy  oat milk", "Bottom"])
    expect(toasts()).toEqual([])
  })

  it("Enter never inserts a line break (the key is prevented)", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(jsonResponse(saved(middle, "x")))
    await click(editButton("Middle"))
    await type("x")
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    })
    await act(async () => {
      field().dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(patches()).toHaveLength(1)
  })

  it("blur: the same PATCH and optimistic update; focus stays where it went", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(jsonResponse(saved(middle, "Changed")))

    await click(editButton("Middle"))
    await type("Changed")
    await focus(addInput())

    expect(patches()).toEqual([
      { path: `/api/v1/todos/${middle.id}`, body: { description: "Changed" } },
    ])
    expect(queryField()).toBeNull()
    expect(rows()).toEqual(["Top", "Changed", "Bottom"])
    expect(announcer()).toHaveTextContent("Todo updated")
    expect(addInput()).toHaveFocus()
    await advance(0)
  })

  it("paste: every line break becomes a space", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    await type("a\r\nb\nc")
    expect(field()).toHaveValue("a b c")
  })

  it.each([
    ["empty", ""],
    ["whitespace", "  \n "],
    ["unchanged", "Middle"],
    ["unchanged after normalizing", "  Middle "],
  ])(
    "no-op (%s): the field closes with no request and no announcement; the Todo stays",
    async (_name, text) => {
      await renderPopulated()
      await editWithEnter("Middle", text)

      expect(queryField()).toBeNull()
      expect(callsWith("PATCH")).toHaveLength(0)
      expect(callsWith("DELETE")).toHaveLength(0)
      expect(announcer()).not.toHaveTextContent("Todo updated")
      expect(rows()).toEqual(["Top", "Middle", "Bottom"])
      expect(editButton("Middle")).toHaveFocus()
    }
  )

  it("no-op on blur: closes with no request", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    await type("")
    await focus(addInput())
    expect(queryField()).toBeNull()
    expect(callsWith("PATCH")).toHaveLength(0)
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
  })

  it("a save triggers one PATCH only, even if the removed field fires blur", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValue(jsonResponse(saved(middle, "Changed")))
    await editWithEnter("Middle", "Changed")
    await focus(addInput())
    await advance(0)
    expect(patches()).toHaveLength(1)
  })

  it("switch: opening B commits A (saved if changed), then B opens", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(jsonResponse(saved(middle, "Changed")))

    await click(editButton("Middle"))
    await type("Changed")
    await click(editButton("Bottom"))

    expect(patches()).toEqual([
      { path: `/api/v1/todos/${middle.id}`, body: { description: "Changed" } },
    ])
    expect(
      screen.getAllByRole("textbox", { name: /^Edit todo: / })
    ).toHaveLength(1)
    expect(fieldIn(bottom)).toHaveValue("Bottom")
    expect(fieldIn(bottom)).toHaveFocus()
    expect(rows()).toEqual(["Top", "Changed", "Bottom"])
    await advance(0)
  })

  it("after a reload the new Description shows in the same position with createdAt unchanged", async () => {
    const { unmount } = await renderPopulated()
    const updated = saved(middle, "Changed")
    fetchMock.mockResolvedValueOnce(jsonResponse(updated))
    await editWithEnter("Middle", "Changed")
    await advance(0)
    unmount()

    // A fresh query: the server lists the persisted edit.
    await renderPopulated([top, updated, bottom])
    expect(rows()).toEqual(["Top", "Changed", "Bottom"])
    const time = rowOf(middle)!.querySelector("time")!
    expect(time).toHaveAttribute("dateTime", middle.createdAt)
  })
})

describe("TodoRow: cancel edit", () => {
  it("Escape with a toast visible: canceled, Description restored, focus on Edit, toast kept; the next Escape dismisses it", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(serverError())
    await click(checkbox("Top"))
    await advance(0)
    await advance(1)
    expect(toasts()).toEqual([TOGGLE_FAILED])

    await click(editButton("Middle"))
    await type("Changed")
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      field().dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(queryField()).toBeNull()
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(editButton("Middle")).toHaveFocus()
    expect(callsWith("PATCH")).toHaveLength(1) // the toggle only
    await advance(500)
    expect(toasts()).toEqual([TOGGLE_FAILED])

    await act(async () => {
      fireEvent.keyDown(editButton("Middle"), { key: "Escape" })
    })
    await advance(500)
    expect(toasts()).toEqual([])
  })

  it("the blur caused by closing doesn't save after Escape", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    await type("Changed")
    await press("Escape")
    await focus(addInput())
    expect(callsWith("PATCH")).toHaveLength(0)
    expect(announcer()).not.toHaveTextContent("Todo updated")
  })
})

describe("TodoRow: edit failure", () => {
  const failures: [string, () => Promise<void>][] = [
    [
      "a network error",
      async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await editWithEnter("Middle", "Changed")
        await advance(0)
      },
    ],
    [
      "a 5xx envelope",
      async () => {
        fetchMock.mockResolvedValueOnce(serverError())
        await editWithEnter("Middle", "Changed")
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
        await editWithEnter("Middle", "Changed")
        await advance(0)
      },
    ],
    [
      `the ${REQUEST_TIMEOUT_MS} ms timeout`,
      async () => {
        hangingFetch()
        await editWithEnter("Middle", "Changed")
        await advance(REQUEST_TIMEOUT_MS - 1)
        expect(toasts()).toEqual([])
        await advance(1)
        await advance(1)
      },
    ],
  ]

  it.each(failures)(
    "none open, %s: the row reopens with the sent text, focused (focus was in the row); one plain toast",
    async (_name, fail) => {
      const { queryClient } = await renderPopulated()
      await fail()

      expect(fieldIn(middle)).toHaveValue("Changed")
      expect(fieldIn(middle)).toHaveFocus()
      expect(toasts()).toEqual([EDIT_FAILED])
      expect(retryButton()).toBeNull()
      expect(screen.queryByText(/db exploded/)).not.toBeInTheDocument()
      expect(getTodoSync(queryClient).confirmed.get(middle.id)).toEqual(middle)
      // Escape now restores the confirmed Description.
      await press("Escape", fieldIn(middle)!)
      expect(rows()).toEqual(["Top", "Middle", "Bottom"])
      expect(editButton("Middle")).toHaveFocus()
    }
  )

  it("none open, focus moved elsewhere: the row reopens without taking focus", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await click(editButton("Middle"))
    await type("Changed")
    await focus(addInput())

    await patch.resolve(serverError())
    await advance(0)

    expect(fieldIn(middle)).toHaveValue("Changed")
    expect(addInput()).toHaveFocus()
    expect(toasts()).toEqual([EDIT_FAILED])
  })

  it("none open, focus on <body>: the reopened field takes focus", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await editWithEnter("Middle", "Changed")
    act(() => (document.activeElement as HTMLElement).blur())
    expect(document.activeElement).toBe(document.body)

    await patch.resolve(serverError())
    await advance(0)

    expect(fieldIn(middle)).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it("another row open: the row shows its confirmed text; persistent Retry toast; Retry resends and announces", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await editWithEnter("Middle", "Changed")
    await click(editButton("Bottom"))
    await type("Typing here")

    await patch.resolve(serverError())
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle", "Typing here"])
    expect(fieldIn(bottom)).toHaveFocus()
    expect(toasts()).toEqual(["Couldn't save your edit to “Changed”."])
    await advance(60_000)
    expect(toasts()).toEqual(["Couldn't save your edit to “Changed”."])

    const retry = deferredFetch()
    await act(async () => {
      fireEvent.click(retryButton()!)
    })
    expect(announcer()).toHaveTextContent("Todo updated")
    const [first, second] = patches()
    expect(second).toEqual(first)
    expect(fieldIn(bottom)).toHaveValue("Typing here")
    await retry.resolve(jsonResponse(saved(middle, "Changed")))
    expect(rows()).toEqual(["Top", "Changed", "Typing here"])
  })

  it("the same row reopened: the text being typed is kept; Retry toast", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await editWithEnter("Middle", "Changed")
    await click(editButton("Changed"))
    await type("Typing here")

    await patch.resolve(serverError())
    await advance(0)

    expect(fieldIn(middle)).toHaveValue("Typing here")
    expect(toasts()).toEqual(["Couldn't save your edit to “Changed”."])
    expect(retryButton()).toBeInTheDocument()
  })

  it("the Retry toast quotes the first 40 characters and '…'", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    const long = "x".repeat(45)
    await editWithEnter("Middle", long)
    await click(editButton("Bottom"))

    await patch.resolve(serverError())
    await advance(0)

    expect(toasts()).toEqual([
      `Couldn't save your edit to “${"x".repeat(40)}…”.`,
    ])
  })

  it("404: confirmed null, the row is removed, and the Retry toast shows", async () => {
    const { queryClient } = await renderPopulated()
    fetchMock.mockResolvedValueOnce(notFound())
    await editWithEnter("Middle", "Changed")
    await advance(0)
    await advance(1)

    expect(rows()).toEqual(["Top", "Bottom"])
    expect(getTodoSync(queryClient).confirmed.get(middle.id)).toBeNull()
    expect(toasts()).toEqual(["Couldn't save your edit to “Changed”."])
    expect(retryButton()).toBeInTheDocument()
  })

  it("too_long, none open: reopened with the too-long copy", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(tooLong())
    await editWithEnter("Middle", "Changed")
    await advance(0)

    expect(fieldIn(middle)).toHaveValue("Changed")
    expect(toasts()).toEqual([TOO_LONG])
    expect(retryButton()).toBeNull()
  })

  it("too_long, another open: the too-long copy with Retry", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await editWithEnter("Middle", "Changed")
    await click(editButton("Bottom"))

    await patch.resolve(tooLong())
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(toasts()).toEqual([TOO_LONG])
    expect(retryButton()).toBeInTheDocument()
  })

  it("edit then delete: the DELETE waits for the PATCH; a failed PATCH drops it with one edit toast", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await editWithEnter("Middle", "Changed")
    await click(deleteButton("Changed"))

    expect(callsWith("DELETE")).toHaveLength(0)
    await patch.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(callsWith("DELETE")).toHaveLength(0)
    expect(toasts()).toEqual([EDIT_FAILED])
    expect(rows()).toEqual(["Top", "Changed", "Bottom"])
    expect(fieldIn(middle)).toHaveValue("Changed")
  })

  it("edit then delete: a successful PATCH is followed by the DELETE", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await editWithEnter("Middle", "Changed")
    await click(deleteButton("Changed"))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await patch.resolve(jsonResponse(saved(middle, "Changed")))
    await advance(0)

    expect(callsWith("DELETE")).toHaveLength(1)
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(toasts()).toEqual([])
  })
})

describe("TodoRow: edit robustness", () => {
  /** Edits Middle, blurs to the Add input, and fails: reopened unfocused. */
  async function reopenMiddleUnfocused() {
    const patch = deferredFetch()
    await click(editButton("Middle"))
    await type("Changed")
    await focus(addInput())
    await patch.resolve(serverError())
    await advance(0)
    expect(fieldIn(middle)).toHaveValue("Changed")
    expect(addInput()).toHaveFocus()
  }

  it("an unfocused reopened field is committed when another edit opens", async () => {
    await renderPopulated()
    await reopenMiddleUnfocused()
    fetchMock.mockResolvedValueOnce(jsonResponse(saved(middle, "Changed")))

    await click(editButton("Bottom"))

    expect(patches()).toHaveLength(2)
    expect(patches()[1]).toEqual({
      path: `/api/v1/todos/${middle.id}`,
      body: { description: "Changed" },
    })
    expect(fieldIn(middle)).toBeNull()
    expect(fieldIn(bottom)).toHaveValue("Bottom")
    expect(fieldIn(bottom)).toHaveFocus()
    expect(rows()).toEqual(["Top", "Changed", "Bottom"])
    await advance(0)
  })

  it("Edit on the unfocused reopened row focuses its field", async () => {
    await renderPopulated()
    await reopenMiddleUnfocused()

    await click(editButton("Middle"))

    expect(fieldIn(middle)).toHaveFocus()
    expect(fieldIn(middle)).toHaveValue("Changed")
    expect(patches()).toHaveLength(1)
  })

  it("deleting the row of an open edit closes it: a later failure elsewhere reopens its own field", async () => {
    await renderPopulated()
    await reopenMiddleUnfocused()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await click(deleteButton("Middle"))
    await advance(0)
    expect(rows()).toEqual(["Top", "Bottom"])

    fetchMock.mockResolvedValueOnce(serverError())
    await editWithEnter("Top", "Top changed")
    await advance(0)

    expect(fieldIn(top)).toHaveValue("Top changed")
    expect(toasts().at(-1)).toBe(EDIT_FAILED)
    expect(retryButton()).toBeNull()
  })

  it.each([
    ["a composing Enter", { key: "Enter", isComposing: true }],
    ["a composing Escape", { key: "Escape", isComposing: true }],
    ["a keyCode 229 Enter", { key: "Enter", keyCode: 229 }],
  ])("%s makes no PATCH and leaves the field open", async (_name, init) => {
    await renderPopulated()
    await click(editButton("Middle"))
    await type("Changed")

    await act(async () => {
      fireEvent.keyDown(field(), init)
    })

    expect(callsWith("PATCH")).toHaveLength(0)
    expect(field()).toHaveValue("Changed")
    expect(field()).toHaveFocus()
  })

  it("a mid-text line break becomes a space with the caret just after it", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    const textarea = field() as HTMLTextAreaElement
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!

    await act(async () => {
      setValue.call(textarea, "Mid\ndle")
      textarea.setSelectionRange(4, 4)
      fireEvent.input(textarea)
    })

    expect(textarea).toHaveValue("Mid dle")
    expect(textarea.selectionStart).toBe(4)
  })

  it("leaving the window blurs without saving; the field stays open", async () => {
    await renderPopulated()
    await click(editButton("Middle"))
    await type("Half typed")
    vi.mocked(document.hasFocus).mockReturnValue(false)

    await act(async () => field().blur())

    expect(callsWith("PATCH")).toHaveLength(0)
    expect(fieldIn(middle)).toHaveValue("Half typed")
  })
})
