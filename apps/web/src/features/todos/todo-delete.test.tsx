import { StrictMode, useEffect } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { act, fireEvent, screen, within } from "@testing-library/react"
import { REQUEST_TIMEOUT_MS, type Todo } from "@todos/shared"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useToggleTodo, type ToggleTodoVars } from "@/api/hooks/use-toggle-todo"
import { getTodoSync } from "@/api/todo-sync"
import { setMediaQuery } from "@/test/media"
import { stubAnimate, unstubAnimate, type FakeAnimation } from "@/test/animate"
import {
  advance,
  callsWith,
  deferredFetchSameAct as deferredFetch,
  fetchMock,
  hangingFetch,
  setupFetchAndFakeTimers,
} from "@/test/fetch"
import { bottom, middle, notFound, serverError, top } from "@/test/fixtures"
import {
  addInput,
  announcer,
  checkbox,
  deleteButton,
  focusAndClick,
  rows as listRows,
  toasts,
} from "@/test/queries"
import { jsonResponse, renderWithProviders } from "@/test/render"
import { renderPopulated as renderTodoList } from "@/test/render-todo-list"
import {
  HOVER_POINTER_QUERY,
  REDUCED_MOTION_QUERY,
} from "@/lib/use-media-query"

import { ROW_EXIT_COLLAPSE_MS, ROW_EXIT_FADE_MS } from "./row-exit"
import { TodoList } from "./todo-list"
import { showToggleFailure } from "./toggle-failure"

const DELETE_FAILED = "Couldn't delete that todo. Please try again."
const CREATE_RESTORED = "Couldn't add that todo. Your text is back in the box."

/** Renders the list, plus an optional probe that can queue a toggle by id. */
let queueToggle: ((vars: ToggleTodoVars) => void) | undefined
function ToggleProbe() {
  const toggle = useToggleTodo(showToggleFailure)
  useEffect(() => {
    queueToggle = toggle
  }, [toggle])
  return null
}

const renderPopulated = (
  todos: Todo[] = [top, middle, bottom],
  {
    probe = false,
    queryClient,
  }: { probe?: boolean; queryClient?: QueryClient } = {}
) => renderTodoList(todos, { queryClient, extra: probe && <ToggleProbe /> })

const queryRow = (name: string) =>
  screen.queryByText(name, { selector: "li p" })?.closest("li") ?? null
const rows = () => listRows({ allowMissing: true })
const deletes = () => callsWith("DELETE")

const noContent = () => new Response(null, { status: 204 })

setupFetchAndFakeTimers(new Date("2026-09-24T15:30:00.000Z"))

afterEach(() => {
  // jsdom has no Web Animations API; drop any stub a test installed.
  unstubAnimate()
  queueToggle = undefined
})

describe("TodoRow: Delete button", () => {
  it("is a ghost icon button named 'Delete todo: {Description}', muted and destructive on hover/focus", async () => {
    await renderPopulated()
    const button = deleteButton("Middle")

    expect(button).toHaveAccessibleName("Delete todo: Middle")
    expect(button).toHaveAttribute("data-variant", "ghost")
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveClass(
      "size-touch-target",
      "text-muted-foreground",
      "hover:text-destructive",
      "focus-visible:text-destructive"
    )
    // A 16 px lucide Trash2 icon, hidden from assistive technology.
    const icon = button.querySelector("svg")!
    expect(icon).toHaveClass("lucide-trash-2", "size-4")
    expect(icon).toHaveAttribute("aria-hidden", "true")
  })

  it("sits after the Description column; tab order within a row is checkbox, Edit, then Delete", async () => {
    await renderPopulated()
    const row = queryRow("Middle")!
    const focusable = Array.from(
      row.querySelectorAll<HTMLElement>(
        "button, input, textarea, a, [tabindex]"
      )
    )
    expect(focusable).toEqual([
      checkbox("Middle"),
      screen.getByRole("button", { name: "Edit todo: Middle" }),
      deleteButton("Middle"),
    ])
    expect(row.lastElementChild).toContainElement(deleteButton("Middle"))
    expect(deleteButton("Middle")).not.toHaveAttribute("tabindex", "-1")
  })

  it("hover and fine pointer: actions are opacity-0 until the row is hovered or has focus inside, and still tabbable", async () => {
    setMediaQuery(HOVER_POINTER_QUERY, true)
    await renderPopulated()
    const actions = within(queryRow("Middle")!).getByTestId("row-actions")

    expect(actions).toHaveClass(
      "opacity-0",
      "group-hover/row:opacity-100",
      "group-focus-within/row:opacity-100"
    )
    expect(queryRow("Middle")).toHaveClass("group/row")
    expect(deleteButton("Middle")).not.toHaveAttribute("tabindex", "-1")
  })

  it("no hover-capable fine pointer: actions are always visible", async () => {
    await renderPopulated()
    const actions = within(queryRow("Middle")!).getByTestId("row-actions")
    expect(actions).not.toHaveClass("opacity-0")
  })

  it("visibility follows the input capability when it changes", async () => {
    await renderPopulated()
    const actions = () => within(queryRow("Middle")!).getByTestId("row-actions")
    expect(actions()).not.toHaveClass("opacity-0")
    await act(async () => setMediaQuery(HOVER_POINTER_QUERY, true))
    expect(actions()).toHaveClass("opacity-0")
  })
})

describe("TodoRow: delete", () => {
  it("click: DELETE with no body or Content-Type, the row leaves, 'Todo deleted', focus on the next row's checkbox", async () => {
    await renderPopulated()
    const del = deferredFetch()

    await focusAndClick(deleteButton("Middle"))

    // Before any response.
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(checkbox("Bottom")).toHaveFocus()
    expect(announcer()).toHaveTextContent("Todo deleted")
    expect(deletes()).toHaveLength(1)
    const [path, init] = deletes()[0]!
    expect(path).toBe(`/api/v1/todos/${middle.id}`)
    expect(init?.body).toBeUndefined()
    expect(init?.headers).toBeUndefined()

    await del.resolve(noContent())
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(toasts()).toEqual([])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull()
  })

  it("Enter and Space: the Delete button is a native button (browsers click it on both keys)", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(noContent())
    const button = deleteButton("Middle")
    button.focus()

    expect(button.tagName).toBe("BUTTON")
    expect(fireEvent.keyDown(button, { key: "Enter", code: "Enter" })).toBe(
      true
    )
    expect(fireEvent.keyDown(button, { key: " ", code: "Space" })).toBe(true)
    // jsdom doesn't synthesize the click a browser would; dispatch it.
    await focusAndClick(button)
    await advance(0)

    expect(rows()).toEqual(["Top", "Bottom"])
    expect(deletes()).toHaveLength(1)
  })

  it("the bottom row: focus goes to the previous row's checkbox", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(noContent())

    await focusAndClick(deleteButton("Bottom"))
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle"])
    expect(checkbox("Middle")).toHaveFocus()
  })

  it("the only Todo: focus goes to the Add input, then the Empty state shows and the Add row stays", async () => {
    await renderPopulated([middle])
    const form = addInput().closest("form")!
    fetchMock.mockResolvedValueOnce(noContent())

    await focusAndClick(deleteButton("Middle"))
    await advance(0)

    expect(addInput()).toHaveFocus()
    expect(screen.queryByRole("list", { name: "Todos" })).toBeNull()
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument()
    // The Add row is the same element, still above the list region.
    expect(addInput().closest("form")).toBe(form)
    expect(
      form.compareDocumentPosition(screen.getByTestId("todo-list-region")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(document.activeElement).not.toBe(document.body)
  })

  it("focus skips rows that are still exiting", async () => {
    setMediaQuery(REDUCED_MOTION_QUERY, false)
    const animations: FakeAnimation[] = []
    stubAnimate(animations)
    await renderPopulated()
    fetchMock.mockResolvedValue(noContent())

    await focusAndClick(deleteButton("Middle"))
    // Middle is still fading; deleting Top skips it for Bottom.
    await focusAndClick(deleteButton("Top"))

    expect(checkbox("Bottom")).toHaveFocus()
  })

  it("204: confirmed null, and after a reload the Todo stays gone", async () => {
    const { queryClient, unmount } = await renderPopulated()
    fetchMock.mockResolvedValueOnce(noContent())

    await focusAndClick(deleteButton("Middle"))
    await advance(0)
    expect(getTodoSync(queryClient).confirmed.get(middle.id)).toBeNull()
    expect(getTodoSync(queryClient).pending.has(middle.id)).toBe(false)
    unmount()

    // The server no longer lists it.
    await renderPopulated([top, bottom])
    expect(rows()).toEqual(["Top", "Bottom"])
  })

  it("404: treated as success, no toast, the row stays gone", async () => {
    const { queryClient } = await renderPopulated()
    fetchMock.mockResolvedValueOnce(notFound())

    await focusAndClick(deleteButton("Middle"))
    await advance(0)
    await advance(1)

    expect(rows()).toEqual(["Top", "Bottom"])
    expect(toasts()).toEqual([])
    expect(getTodoSync(queryClient).confirmed.get(middle.id)).toBeNull()
    expect(checkbox("Bottom")).toHaveFocus()
  })

  it("announces 'Todo deleted' exactly once per delete", async () => {
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(noContent())
    const texts: string[] = []
    const observer = new MutationObserver(() =>
      texts.push(announcer().textContent ?? "")
    )
    observer.observe(announcer(), {
      childList: true,
      subtree: true,
      characterData: true,
    })

    await focusAndClick(deleteButton("Middle"))
    await advance(0)
    observer.disconnect()

    expect(texts.filter((t) => t.includes("Todo deleted"))).toHaveLength(1)
  })
})

describe("TodoRow: delete failure", () => {
  const failures: [string, () => Promise<void>][] = [
    [
      "a network error",
      async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await focusAndClick(deleteButton("Middle"))
        await advance(0)
      },
    ],
    [
      "a 5xx envelope",
      async () => {
        fetchMock.mockResolvedValueOnce(serverError())
        await focusAndClick(deleteButton("Middle"))
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
        await focusAndClick(deleteButton("Middle"))
        await advance(0)
      },
    ],
    [
      `the ${REQUEST_TIMEOUT_MS} ms timeout`,
      async () => {
        hangingFetch()
        await focusAndClick(deleteButton("Middle"))
        await advance(REQUEST_TIMEOUT_MS - 1)
        expect(rows()).toEqual(["Top", "Bottom"])
        expect(toasts()).toEqual([])
        await advance(1)
        // The toast renders on Sonner's next timer tick.
        await advance(1)
      },
    ],
  ]

  it.each(failures)(
    "%s: the row returns at its position, one toast, focus back on its checkbox",
    async (_name, fail) => {
      await renderPopulated([top, { ...middle, completed: true }, bottom])

      await fail()

      expect(rows()).toEqual(["Top", "Middle", "Bottom"])
      expect(checkbox("Middle")).toHaveAttribute("aria-checked", "true")
      expect(queryRow("Middle")).not.toHaveAttribute("inert")
      expect(toasts()).toEqual([DELETE_FAILED])
      expect(screen.queryByText(/db exploded/)).not.toBeInTheDocument()
      expect(checkbox("Middle")).toHaveFocus()
    }
  )

  it("focus moved elsewhere since the delete: it stays put", async () => {
    await renderPopulated()
    const del = deferredFetch()

    await focusAndClick(deleteButton("Middle"))
    expect(checkbox("Bottom")).toHaveFocus()
    act(() => addInput().focus())

    await del.resolve(serverError())
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(addInput()).toHaveFocus()
    expect(toasts()).toEqual([DELETE_FAILED])
  })

  it("focus fell to <body>: it goes to the restored row's checkbox", async () => {
    await renderPopulated()
    const del = deferredFetch()

    await focusAndClick(deleteButton("Middle"))
    act(() => (document.activeElement as HTMLElement).blur())
    expect(document.activeElement).toBe(document.body)

    await del.resolve(serverError())
    await advance(0)

    expect(checkbox("Middle")).toHaveFocus()
  })

  it("focus on the list region: it goes to the restored row's checkbox", async () => {
    await renderPopulated()
    const del = deferredFetch()

    await focusAndClick(deleteButton("Middle"))
    act(() => screen.getByTestId("todo-list-region").focus())

    await del.resolve(serverError())
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(checkbox("Middle")).toHaveFocus()
    expect(toasts()).toEqual([DELETE_FAILED])
  })

  it("a rollback mid-exit brings the real row back and undoes the motion", async () => {
    const animations: FakeAnimation[] = []
    stubAnimate(animations)
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(serverError())

    await focusAndClick(deleteButton("Middle"))
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(queryRow("Middle")).not.toHaveAttribute("inert")
    expect(animations[0]!.cancel).toHaveBeenCalled()
    expect(toasts()).toEqual([DELETE_FAILED])
    expect(checkbox("Middle")).toHaveFocus()
  })

  it("a rollback in the collapse phase cancels the collapse and restores the row's styles", async () => {
    const animations: FakeAnimation[] = []
    stubAnimate(animations)
    await renderPopulated()
    const del = deferredFetch()

    await focusAndClick(deleteButton("Middle"))
    await act(async () => animations[0]!.finish())
    expect(animations).toHaveLength(2)
    expect(queryRow("Middle")!.style.overflow).toBe("hidden")

    await del.resolve(serverError())
    await advance(0)

    expect(animations[1]!.cancel).toHaveBeenCalled()
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(queryRow("Middle")!.style.overflow).toBe("")
    expect(queryRow("Middle")).not.toHaveAttribute("inert")
    expect(toasts()).toEqual([DELETE_FAILED])
  })

  it("a toggle queued behind a failing delete is dropped: no PATCH, no second toast", async () => {
    await renderPopulated(undefined, { probe: true })
    const del = deferredFetch()

    await focusAndClick(deleteButton("Middle"))
    await act(async () => queueToggle!({ id: middle.id, completed: true }))
    await del.resolve(serverError())
    await advance(0)

    expect(callsWith("PATCH")).toHaveLength(0)
    expect(toasts()).toEqual([DELETE_FAILED])
    expect(checkbox("Middle")).toHaveAttribute("aria-checked", "false")
  })

  /**
   * Adds "Brand new", then deletes it while its POST is still pending (held
   * by the `fetch` stub `holdPost` installs), and returns what it returned.
   */
  async function deletePendingCreate<T>(holdPost: () => T): Promise<T> {
    await renderPopulated()
    const held = holdPost()

    fireEvent.change(addInput(), { target: { value: "Brand new" } })
    await act(async () => {
      fireEvent.submit(addInput().closest("form")!)
    })
    expect(rows()).toEqual(["Brand new", "Top", "Middle", "Bottom"])

    await focusAndClick(deleteButton("Brand new"))
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    // The delete moved focus to the next row's checkbox.
    expect(checkbox("Top")).toHaveFocus()
    expect(deletes()).toHaveLength(0)
    return held
  }

  /** A pending fetch the test rejects by hand. */
  function rejectableFetch() {
    let reject!: (error: unknown) => void
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((_res, rej) => (reject = rej))
    )
    return {
      reject: (error: unknown) =>
        act(async () => {
          reject(error)
          await vi.advanceTimersByTimeAsync(0)
        }),
    }
  }

  const createFailures: [string, () => Promise<() => Promise<void>>][] = [
    [
      "a 5xx",
      async () => {
        const post = await deletePendingCreate(deferredFetch)
        return () => post.resolve(serverError())
      },
    ],
    [
      "a network error",
      async () => {
        const post = await deletePendingCreate(rejectableFetch)
        return () => post.reject(new TypeError("Failed to fetch"))
      },
    ],
    [
      `the ${REQUEST_TIMEOUT_MS} ms timeout (the POST may have committed)`,
      async () => {
        await deletePendingCreate(hangingFetch)
        return async () => {
          await advance(REQUEST_TIMEOUT_MS)
        }
      },
    ],
  ]

  it.each(createFailures)(
    "delete on a pending create that fails by %s: the DELETE is still sent, counts as done, no toast, the Add input untouched",
    async (_name, setup) => {
      const failPost = await setup()
      fetchMock.mockResolvedValueOnce(noContent())

      await failPost()
      await advance(0)
      await advance(1)

      expect(deletes()).toHaveLength(1)
      // The DELETE is for the created Todo's id.
      const [, postInit] = callsWith("POST")[0]!
      const { id } = JSON.parse(String(postInit!.body)) as { id: string }
      expect(String(deletes()[0]![0])).toContain(id)
      expect(rows()).toEqual(["Top", "Middle", "Bottom"])
      expect(toasts()).toEqual([])
      expect(addInput()).toHaveValue("")
      expect(checkbox("Top")).toHaveFocus()
    }
  )

  it("the resent DELETE gets a 404: success, no toast", async () => {
    const post = await deletePendingCreate(deferredFetch)
    fetchMock.mockResolvedValueOnce(notFound())

    await post.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(deletes()).toHaveLength(1)
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(toasts()).toEqual([])
  })

  it("the resent DELETE fails: one delete toast, the row stays gone", async () => {
    const post = await deletePendingCreate(deferredFetch)
    fetchMock.mockResolvedValueOnce(serverError())

    await post.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(deletes()).toHaveLength(1)
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(toasts()).toEqual([DELETE_FAILED])
    expect(screen.queryByText(/db exploded/)).not.toBeInTheDocument()
    expect(addInput()).toHaveValue("")
    expect(checkbox("Top")).toHaveFocus()
  })

  it("toggle then delete: the DELETE waits for the PATCH, the row is removed at once", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    const del = deferredFetch()

    await focusAndClick(checkbox("Middle"))
    await focusAndClick(deleteButton("Middle"))

    expect(rows()).toEqual(["Top", "Bottom"])
    expect(callsWith("PATCH")).toHaveLength(1)
    expect(deletes()).toHaveLength(0)

    await patch.resolve(jsonResponse({ ...middle, completed: true }))
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(deletes()).toHaveLength(1)

    await del.resolve(noContent())
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(toasts()).toEqual([])
  })
})

describe("TodoRow: a delete queued behind a failed toggle", () => {
  it("PATCH 500: the row is back with its confirmed state, only the delete toast, focus back on its checkbox", async () => {
    await renderPopulated()
    const patch = deferredFetch()

    await focusAndClick(checkbox("Middle"))
    await focusAndClick(deleteButton("Middle"))
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(checkbox("Bottom")).toHaveFocus()

    await patch.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(deletes()).toHaveLength(0)
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(checkbox("Middle")).toHaveAttribute("aria-checked", "false")
    expect(queryRow("Middle")).not.toHaveAttribute("inert")
    expect(toasts()).toEqual([DELETE_FAILED])
    expect(screen.queryByText(/db exploded/)).not.toBeInTheDocument()
    expect(checkbox("Middle")).toHaveFocus()
  })

  it("PATCH 404: the delete counts as done, no toast, focus stays where the delete moved it", async () => {
    await renderPopulated()
    const patch = deferredFetch()

    await focusAndClick(checkbox("Middle"))
    await focusAndClick(deleteButton("Middle"))
    expect(checkbox("Bottom")).toHaveFocus()

    await patch.resolve(notFound())
    await advance(0)
    await advance(1)

    expect(deletes()).toHaveLength(0)
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(toasts()).toEqual([])
    expect(checkbox("Bottom")).toHaveFocus()
  })

  it("a later failed delete of another row still restores its own focus (no stale entry)", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await focusAndClick(checkbox("Middle"))
    await focusAndClick(deleteButton("Middle"))
    await patch.resolve(serverError())
    await advance(0)
    expect(checkbox("Middle")).toHaveFocus()

    fetchMock.mockResolvedValueOnce(serverError())
    await focusAndClick(deleteButton("Top"))
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(checkbox("Top")).toHaveFocus()
  })
})

describe("TodoRow: a dropped delete that counts as done, then another failed delete", () => {
  it("PATCH 404 behind which a delete was dropped: a later failed delete of another row restores its own focus", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await focusAndClick(checkbox("Middle"))
    await focusAndClick(deleteButton("Middle"))
    await patch.resolve(notFound())
    await advance(0)
    expect(rows()).toEqual(["Top", "Bottom"])
    expect(toasts()).toEqual([])

    const del = deferredFetch()
    await focusAndClick(deleteButton("Top"))
    expect(checkbox("Bottom")).toHaveFocus()
    await del.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(rows()).toEqual(["Top", "Bottom"])
    expect(checkbox("Top")).toHaveFocus()
    expect(toasts()).toEqual([DELETE_FAILED])
  })
})

describe("TodoRow: focus after a removal", () => {
  const TOGGLE_FAILED = "Couldn't update that todo. Please try again."

  it.each([
    ["the checkbox", (name: string) => checkbox(name)],
    ["Delete", (name: string) => deleteButton(name)],
    [
      "Edit",
      (name: string) =>
        screen.getByRole("button", { name: `Edit todo: ${name}` }),
    ],
  ])(
    "a toggle 404 removes the focused row (focus on %s): focus goes to the next row's checkbox",
    async (_where, target) => {
      await renderPopulated()
      const patch = deferredFetch()
      await focusAndClick(checkbox("Middle"))
      act(() => target("Middle").focus())

      await patch.resolve(notFound())
      await advance(0)
      await advance(1)

      expect(rows()).toEqual(["Top", "Bottom"])
      expect(checkbox("Bottom")).toHaveFocus()
      expect(toasts()).toEqual([TOGGLE_FAILED])
    }
  )

  it("the bottom row: focus goes to the previous row's checkbox", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await focusAndClick(checkbox("Bottom"))

    await patch.resolve(notFound())
    await advance(0)

    expect(rows()).toEqual(["Top", "Middle"])
    expect(checkbox("Middle")).toHaveFocus()
  })

  it("the only row: focus goes to the Add input", async () => {
    await renderPopulated([middle])
    const patch = deferredFetch()
    await focusAndClick(checkbox("Middle"))

    await patch.resolve(notFound())
    await advance(0)

    expect(rows()).toEqual([])
    expect(addInput()).toHaveFocus()
  })

  it("skips rows that are still exiting", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    const del = deferredFetch()
    await focusAndClick(checkbox("Middle"))
    // Bottom is exiting (its DELETE pending); focus goes back to Middle.
    await focusAndClick(deleteButton("Bottom"))
    act(() => checkbox("Middle").focus())

    await patch.resolve(notFound())
    await advance(0)

    expect(checkbox("Top")).toHaveFocus()
    await del.resolve(noContent())
  })

  describe("under StrictMode (its simulated unmount is not a removal)", () => {
    async function renderStrict() {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ todos: [top, middle, bottom] })
      )
      renderWithProviders(
        <StrictMode>
          <TodoList />
        </StrictMode>
      )
      await advance(0)
    }

    it("a failed delete's restored row keeps the focus it is given", async () => {
      await renderStrict()
      const del = deferredFetch()
      await focusAndClick(deleteButton("Middle"))
      await advance(1000)
      expect(rows()).toEqual(["Top", "Bottom"])

      await del.resolve(serverError())
      await advance(0)
      await advance(1)

      expect(rows()).toEqual(["Top", "Middle", "Bottom"])
      expect(checkbox("Middle")).toHaveFocus()
    })

    it("a toggle 404 on the focused row still moves focus to the next row", async () => {
      await renderStrict()
      const patch = deferredFetch()
      await focusAndClick(checkbox("Middle"))

      await patch.resolve(notFound())
      await advance(0)

      expect(rows()).toEqual(["Top", "Bottom"])
      expect(checkbox("Bottom")).toHaveFocus()
    })
  })

  it("an unfocused row's removal leaves focus alone", async () => {
    await renderPopulated()
    const patch = deferredFetch()
    await focusAndClick(checkbox("Middle"))
    act(() => addInput().focus())

    await patch.resolve(notFound())
    await advance(0)

    expect(rows()).toEqual(["Top", "Bottom"])
    expect(addInput()).toHaveFocus()
  })

  it("a failed create removes the focused pending row: focus goes to the next row's checkbox, the create UI is unchanged", async () => {
    await renderPopulated()
    const post = deferredFetch()
    fireEvent.change(addInput(), { target: { value: "Brand new" } })
    await act(async () => {
      fireEvent.submit(addInput().closest("form")!)
    })
    act(() => checkbox("Brand new").focus())

    await post.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(checkbox("Top")).toHaveFocus()
    expect(addInput()).toHaveValue("Brand new")
    expect(toasts()).toEqual([CREATE_RESTORED])
  })
})

describe("TodoRow: exit motion", () => {
  it(`fades over ${ROW_EXIT_FADE_MS} ms, then collapses over ${ROW_EXIT_COLLAPSE_MS} ms, then leaves`, async () => {
    const animations: FakeAnimation[] = []
    await renderPopulated([middle])
    stubAnimate(animations)
    fetchMock.mockResolvedValueOnce(noContent())

    await focusAndClick(deleteButton("Middle"))
    await advance(0)

    // Still shown (inert) while exiting; the Empty state waits for it.
    expect(rows()).toEqual(["Middle"])
    expect(queryRow("Middle")).toHaveAttribute("inert")
    expect(screen.queryByText("Nothing here yet.")).toBeNull()
    expect(animations).toHaveLength(1)
    expect(animations[0]!.options.duration).toBe(100)
    expect(animations[0]!.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }])

    await act(async () => animations[0]!.finish())
    expect(animations).toHaveLength(2)
    expect(animations[1]!.options.duration).toBe(150)
    expect(animations[1]!.keyframes.at(-1)).toMatchObject({
      height: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
    })
    expect(rows()).toEqual(["Middle"])

    await act(async () => animations[1]!.finish())
    expect(rows()).toEqual([])
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument()
    expect(addInput()).toHaveFocus()
  })

  it("an exiting row keeps its compareTodos position among the other rows", async () => {
    const animations: FakeAnimation[] = []
    stubAnimate(animations)
    await renderPopulated()
    fetchMock.mockResolvedValueOnce(noContent())

    await focusAndClick(deleteButton("Middle"))
    await advance(0)

    expect(queryRow("Middle")).toHaveAttribute("inert")
    expect(rows()).toEqual(["Top", "Middle", "Bottom"])
  })

  it("reduced motion: no animation, the row is removed at once", async () => {
    setMediaQuery(REDUCED_MOTION_QUERY, true)
    const animations: FakeAnimation[] = []
    await renderPopulated()
    const animate = stubAnimate(animations)
    fetchMock.mockResolvedValueOnce(noContent())

    await focusAndClick(deleteButton("Middle"))

    expect(animate).not.toHaveBeenCalled()
    expect(rows()).toEqual(["Top", "Bottom"])
  })
})
