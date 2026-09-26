import type { Todo } from "@todos/shared"
import { describe, expect, it } from "vitest"

import {
  displayedRows,
  type ExitingRow,
  type ExitingRows,
  pruneExiting,
} from "./use-exiting-rows"

/** Newest first: `A` is the newest, so the list order is A, B, C. */
function todo(id: string, minute: number): Todo {
  const at = `2026-09-26T10:${String(minute).padStart(2, "0")}:00.000Z`
  return {
    id,
    description: `Todo ${id}`,
    completed: false,
    createdAt: at,
    updatedAt: at,
  }
}

const A = todo("a", 3)
const B = todo("b", 2)
const C = todo("c", 1)
const full: readonly Todo[] = [A, B, C]

function exitingOf(...rows: ExitingRow[]): ExitingRows {
  return new Map(rows.map((row) => [row.todo.id, row]))
}

function shown(list: readonly Todo[], exiting: ExitingRows) {
  return displayedRows(list, exiting).map(
    (row) => `${row.todo.id}${row.exiting ? "*" : ""}`
  )
}

describe("displayedRows", () => {
  it("sorts the list by compareTodos when nothing is exiting", () => {
    expect(shown([C, A, B], new Map())).toEqual(["a", "b", "c"])
  })

  it("marks a listed row exiting until the cache removes it", () => {
    const exiting = exitingOf({ todo: B, from: full, done: false })
    expect(shown(full, exiting)).toEqual(["a", "b*", "c"])
  })

  it("keeps a deleted row in its place while its exit runs", () => {
    const exiting = exitingOf({ todo: B, from: full, done: false })
    expect(shown([A, C], exiting)).toEqual(["a", "b*", "c"])
  })

  it("drops a deleted row once its exit is done", () => {
    const exiting = exitingOf({ todo: B, from: full, done: true })
    expect(shown([A, C], exiting)).toEqual(["a", "c"])
  })

  it("shows a rolled-back row live, not exiting", () => {
    const exiting = exitingOf({ todo: B, from: full, done: false })
    // The rollback re-renders the confirmed Todo: a new list with B back.
    expect(shown([A, B, C], exiting)).toEqual(["a", "b", "c"])
  })

  it("shows the only row exiting over an empty list", () => {
    const exiting = exitingOf({ todo: A, from: [A], done: false })
    expect(shown([], exiting)).toEqual(["a*"])
  })
})

describe("pruneExiting", () => {
  it("returns the same map when nothing is pruned", () => {
    const exiting = exitingOf(
      { todo: B, from: full, done: false },
      { todo: C, from: full, done: true }
    )
    expect(pruneExiting(full, exiting)).toBe(exiting)
  })

  it("keeps a row whose exit is still running", () => {
    const exiting = exitingOf({ todo: B, from: full, done: false })
    expect(pruneExiting([A, C], exiting)).toBe(exiting)
  })

  it("drops a row whose id is back in a new list (rolled back)", () => {
    const exiting = exitingOf(
      { todo: B, from: full, done: false },
      { todo: C, from: full, done: false }
    )
    const pruned = pruneExiting([A, B], exiting)
    expect([...pruned.keys()]).toEqual(["c"])
  })

  it("drops a row whose exit completed and that is gone from the list", () => {
    const exiting = exitingOf(
      { todo: B, from: full, done: true },
      { todo: C, from: full, done: false }
    )
    const pruned = pruneExiting([A], exiting)
    expect([...pruned.keys()]).toEqual(["c"])
  })

  it("keeps a finished row still listed (the cache removal is pending)", () => {
    const exiting = exitingOf({ todo: B, from: full, done: true })
    expect(pruneExiting(full, exiting)).toBe(exiting)
  })
})
