import { act } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

import { fakeAbortSignalTimeout } from "./render"

/** The stubbed global `fetch` (installed by `setupFetchAndFakeTimers`). */
export const fetchMock = vi.fn<typeof fetch>()

/** Advances the fake timers by `ms`, inside `act`. */
export const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

/**
 * A fetch whose response the test releases by hand. `resolve` settles the
 * response inside `act` and then flushes pending timers (`advance(0)`):
 * by default in a second `act`, or in the same `act` with `flushInSameAct`.
 */
export function deferredFetch({
  flushInSameAct = false,
}: { flushInSameAct?: boolean } = {}) {
  let resolve!: (response: Response) => void
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((res) => {
        resolve = res
      })
  )
  return {
    resolve: async (r: Response) => {
      if (flushInSameAct) {
        await act(async () => {
          resolve(r)
          await vi.advanceTimersByTimeAsync(0)
        })
        return
      }
      await act(async () => {
        resolve(r)
      })
      await advance(0)
    },
  }
}

/** A fetch that only ends when its signal aborts (the 10 s timeout). */
export function hangingFetch() {
  fetchMock.mockImplementationOnce(
    (_path, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason)
        )
      })
  )
}

/**
 * Registers the per-test setup: fake timers at `systemTime`, a fake-timer
 * driven `AbortSignal.timeout`, and `fetchMock` as the global `fetch`; all
 * undone after each test.
 */
export function setupFetchAndFakeTimers(systemTime: Date) {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(systemTime)
    fakeAbortSignalTimeout()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })
}
