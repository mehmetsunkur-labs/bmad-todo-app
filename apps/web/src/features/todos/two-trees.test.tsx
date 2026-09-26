import { act, fireEvent, within } from "@testing-library/react"
import type { Todo } from "@todos/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  advance,
  deferredFetchSameAct as deferredFetch,
  fetchMock,
  setupFetchAndFakeTimers,
} from "@/test/fetch"
import { bottom, middle, serverError, top } from "@/test/fixtures"
import { focusAndClick, retryButton } from "@/test/queries"
import { jsonResponse, renderWithProviders } from "@/test/render"

import { TodoList } from "./todo-list"

/**
 * Two app trees mounted at once, each with its own `AppProviders` and
 * QueryClient: a failure is handled only by the UI of the tree whose write
 * failed. Tree B mounts after A, so a last-registered-wins controller would
 * belong to B. Toasts and announcements are global, so only
 * controller-driven effects are asserted.
 */

/** Renders one tree (its own client and container) and flushes its load. */
async function renderTree(todos: Todo[]) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ todos }))
  const result = renderWithProviders(<TodoList />)
  await advance(0)
  const q = within(result.container)
  return {
    ...result,
    input: () => q.getByRole("textbox", { name: "New todo" }),
    rows: () =>
      Array.from(
        q.getByRole("list", { name: "Todos" }).querySelectorAll("li"),
        (li) => li.querySelector("p")?.textContent ?? null
      ),
    checkbox: (name: string) => q.getByRole("checkbox", { name }),
    deleteButton: (name: string) =>
      q.getByRole("button", { name: `Delete todo: ${name}` }),
    editButton: (name: string) =>
      q.getByRole("button", { name: `Edit todo: ${name}` }),
    editField: () => q.queryByRole("textbox", { name: /^Edit todo: / }),
    submitAdd: async (text: string) => {
      const input = q.getByRole("textbox", { name: "New todo" })
      await act(async () => {
        fireEvent.change(input, { target: { value: text } })
        fireEvent.submit(input.closest("form")!)
      })
    },
  }
}

async function renderTwoTrees(todos: Todo[] = [top, middle, bottom]) {
  const a = await renderTree(todos)
  const b = await renderTree(todos)
  return { a, b }
}

setupFetchAndFakeTimers(new Date("2026-09-24T15:30:00.000Z"))

// jsdom's document never has focus; a real page does while the user is in it.
beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true)
})

describe("two app trees: each failure uses its own tree's UI", () => {
  it("create fails in A: the text returns to A's input; B's input is untouched", async () => {
    const { a, b } = await renderTwoTrees()
    const post = deferredFetch()
    await a.submitAdd("Buy milk")
    expect(a.input()).toHaveValue("")

    await post.resolve(serverError())

    expect(a.input()).toHaveValue("Buy milk")
    expect(b.input()).toHaveValue("")
  })

  it("delete fails in A after focus moved: the row and its focus come back in A only", async () => {
    const { a, b } = await renderTwoTrees()
    const del = deferredFetch()
    await focusAndClick(a.deleteButton("Middle"))
    await advance(1000)
    expect(a.rows()).toEqual(["Top", "Bottom"])
    expect(a.checkbox("Bottom")).toHaveFocus()

    await del.resolve(serverError())
    await advance(0)
    await advance(1)

    expect(a.rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(a.checkbox("Middle")).toHaveFocus()
    expect(b.rows()).toEqual(["Top", "Middle", "Bottom"])
    expect(b.checkbox("Middle")).not.toHaveFocus()
  })

  it("edit fails in A: A's field reopens with the attempt; B has no open edit", async () => {
    const { a, b } = await renderTwoTrees()
    const patch = deferredFetch()
    await focusAndClick(a.editButton("Middle"))
    await act(async () => {
      fireEvent.change(a.editField()!, { target: { value: "Changed" } })
    })
    await act(async () => {
      fireEvent.keyDown(a.editField()!, { key: "Enter" })
    })
    expect(a.editField()).toBeNull()

    await patch.resolve(serverError())
    await advance(0)

    expect(a.editField()).toHaveValue("Changed")
    expect(b.editField()).toBeNull()
    expect(b.rows()).toEqual(["Top", "Middle", "Bottom"])
  })

  it("B unmounts, then A's create fails: A's controllers still handle it", async () => {
    const { a, b } = await renderTwoTrees()
    b.unmount()
    const post = deferredFetch()
    await a.submitAdd("Buy milk")

    await post.resolve(serverError())

    expect(a.input()).toHaveValue("Buy milk")
    await advance(1)
    expect(retryButton()).toBeNull()
  })

  it("deleting A's last row focuses A's Add input, not B's", async () => {
    const { a, b } = await renderTwoTrees([middle])
    const del = deferredFetch()
    await focusAndClick(a.deleteButton("Middle"))

    expect(a.input()).toHaveFocus()
    expect(b.input()).not.toHaveFocus()
    await del.resolve(new Response(null, { status: 204 }))
  })
})
