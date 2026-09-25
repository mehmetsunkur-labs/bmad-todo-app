import type { ReactElement } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { vi } from "vitest"

import { createQueryClient } from "@/api/query-client"
import { AppProviders } from "@/app-providers"

/**
 * Renders inside the production `AppProviders` tree, with a fresh
 * `createQueryClient()` (the pinned defaults) that the test can inspect.
 */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createQueryClient() }: { queryClient?: QueryClient } = {}
) {
  return {
    queryClient,
    ...render(<AppProviders queryClient={queryClient}>{ui}</AppProviders>),
  }
}

/** A JSON `Response`, as the API would send it. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export function makeTodo(
  overrides: Partial<{
    id: string
    description: string
    completed: boolean
    createdAt: string
    updatedAt: string
  }> = {}
) {
  const createdAt = overrides.createdAt ?? "2026-09-24T09:14:00.000Z"
  return {
    id: "0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b",
    description: "Buy milk",
    completed: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

/**
 * `AbortSignal.timeout` runs on the platform's own timers, which Vitest's
 * fake timers don't control. This swaps in an equivalent signal driven by
 * (fake) `setTimeout`, so tests can advance time to the 10 s timeout.
 */
export function fakeAbortSignalTimeout() {
  return vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController()
    setTimeout(
      () =>
        controller.abort(
          new DOMException("The operation timed out.", "TimeoutError")
        ),
      ms
    )
    return controller.signal
  })
}
