import { toast, type Action } from "sonner"

/** Plain failure toasts auto-dismiss after this long, paused on hover or focus. */
export const PLAIN_TOAST_MS = 8_000

/**
 * Plain-toast timers. Sonner pauses its own timer on hover but not on focus,
 * so plain toasts are shown with `duration: Infinity` and dismissed from
 * here instead; `setToastsPaused` (driven by the Toaster on hover and focus)
 * pauses every running timer, as Sonner does for hover.
 */
interface Timer {
  remaining: number
  startedAt: number
  handle: ReturnType<typeof setTimeout> | undefined
}

const timers = new Map<string | number, Timer>()
let paused = false

function run(id: string | number, timer: Timer) {
  timer.startedAt = Date.now()
  timer.handle = setTimeout(() => {
    timers.delete(id)
    toast.dismiss(id)
  }, timer.remaining)
}

function clearTimer(id: string | number) {
  const timer = timers.get(id)
  if (timer?.handle !== undefined) clearTimeout(timer.handle)
  timers.delete(id)
}

export function setToastsPaused(next: boolean): void {
  if (next === paused) return
  paused = next
  for (const [id, timer] of timers) {
    if (paused) {
      if (timer.handle !== undefined) clearTimeout(timer.handle)
      timer.handle = undefined
      timer.remaining = Math.max(
        0,
        timer.remaining - (Date.now() - timer.startedAt)
      )
    } else {
      run(id, timer)
    }
  }
}

/** Dismisses the newest visible toast (Escape). Returns whether one was dismissed. */
export function dismissNewestToast(): boolean {
  const newest = toast.getToasts().at(-1)
  if (!newest) return false
  clearTimer(newest.id)
  toast.dismiss(newest.id)
  return true
}

/**
 * One failure toast: Sonner's error type (the destructive CircleX icon),
 * with `role="status"` so it never interrupts. With an action ("Retry") it
 * persists until the user acts on it or dismisses it; otherwise it
 * auto-dismisses after `PLAIN_TOAST_MS`.
 */
export function showErrorToast(
  message: string,
  { action }: { action?: Action } = {}
): string | number {
  const id = toast.error(<span role="status">{message}</span>, {
    duration: Infinity,
    action,
    onDismiss: (t) => clearTimer(t.id),
  })
  if (!action) {
    const timer: Timer = {
      remaining: PLAIN_TOAST_MS,
      startedAt: Date.now(),
      handle: undefined,
    }
    timers.set(id, timer)
    if (!paused) run(id, timer)
  }
  return id
}
