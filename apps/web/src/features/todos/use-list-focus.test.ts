import type { Todo } from "@todos/shared"
import { describe, expect, it } from "vitest"

import type { DisplayedRow } from "./use-exiting-rows"
import { removalFocusTargets } from "./use-list-focus"

function row(id: string, exiting = false): DisplayedRow {
  const todo: Todo = {
    id,
    description: `Todo ${id}`,
    completed: false,
    createdAt: "2026-09-26T10:00:00.000Z",
    updatedAt: "2026-09-26T10:00:00.000Z",
  }
  return { todo, exiting }
}

const abc = [row("a"), row("b"), row("c")]

describe("removalFocusTargets", () => {
  it("removing the middle row: the next row first, then the previous", () => {
    expect(removalFocusTargets(abc, "b")).toEqual(["c", "a"])
  })

  it("removing the first row: the following rows, nearest first", () => {
    expect(removalFocusTargets(abc, "a")).toEqual(["b", "c"])
  })

  it("removing the last row: the previous rows, nearest first", () => {
    expect(removalFocusTargets(abc, "c")).toEqual(["b", "a"])
  })

  it("removing the only row: no target (the Add input)", () => {
    expect(removalFocusTargets([row("a")], "a")).toEqual([])
  })

  it("skips rows already exiting", () => {
    const shown = [row("a"), row("b"), row("c", true), row("d")]
    expect(removalFocusTargets(shown, "b")).toEqual(["d", "a"])
    expect(
      removalFocusTargets([row("a", true), row("b"), row("c", true)], "b")
    ).toEqual([])
  })

  it("a row not in the order: every live row, in order", () => {
    expect(removalFocusTargets(abc, "x")).toEqual(["a", "b", "c"])
  })
})
