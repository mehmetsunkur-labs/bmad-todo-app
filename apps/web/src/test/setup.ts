import "@testing-library/jest-dom/vitest"
import { notifyManager } from "@tanstack/react-query"
import { cleanup } from "@testing-library/react"
import { toast } from "sonner"
import { afterEach } from "vitest"

import { installMatchMedia, resetMediaQueries } from "./media"

afterEach(() => {
  cleanup()
  // Sonner's toast store is module-global; start every test without toasts.
  toast.dismiss()
  resetMediaQueries()
})

// jsdom has no matchMedia (Sonner's system theme, the toast position, the
// hover-pointer auto-focus, and reduced motion all read it).
installMatchMedia()

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
