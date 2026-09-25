import "@testing-library/jest-dom/vitest"
import { notifyManager } from "@tanstack/react-query"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})

// TanStack Query batches observer notifications with setTimeout(0), which
// fake timers can leave unflushed; a microtask keeps tests deterministic
// without changing any query behavior.
notifyManager.setScheduler((callback) => queueMicrotask(callback))

// jsdom has no ResizeObserver; Radix (Tooltip positioning) needs one.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
