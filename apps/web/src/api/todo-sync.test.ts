import { describe, expect, it } from "vitest"

import { makeTodo } from "@/test/render"

import { createTodoSync } from "./todo-sync"

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
