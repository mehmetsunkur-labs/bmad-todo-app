import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { createQueryClient } from "../query-client"
import { deleteOp } from "../todo-sync"
import { useTodoMutation, type TodoHookConfig } from "./use-todo-mutation"

const CONFIG: TodoHookConfig<{ id: string }> = {
  kind: "delete",
  op: deleteOp,
  request: async () => null,
}

function renderTrigger(onFailure: () => void) {
  const queryClient = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(({ onFailure }) => useTodoMutation(CONFIG, onFailure), {
    wrapper,
    initialProps: { onFailure },
  })
}

describe("useTodoMutation", () => {
  it("returns the same trigger across rerenders with the same onFailure", () => {
    const onFailure = vi.fn()
    const { result, rerender } = renderTrigger(onFailure)
    const first = result.current
    rerender({ onFailure })
    expect(result.current).toBe(first)
  })

  it("returns a new trigger when onFailure changes", () => {
    const { result, rerender } = renderTrigger(vi.fn())
    const first = result.current
    rerender({ onFailure: vi.fn() })
    expect(result.current).not.toBe(first)
  })
})
