import { useSyncExternalStore } from "react"

const TICK_MS = 60_000

// One shared ticker for every subscriber: a single interval runs while at
// least one component is subscribed, and each tick re-renders only the
// subscribers (the Created At times), never the list around them.
let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function tick(): void {
  now = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === undefined) {
    now = Date.now()
    timer = setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

function getSnapshot(): number {
  return now
}

/** The current time in ms, refreshed once a minute by the shared ticker. */
export function useMinuteTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
