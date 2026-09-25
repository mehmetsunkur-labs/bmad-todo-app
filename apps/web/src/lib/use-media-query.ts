import { useCallback, useSyncExternalStore } from "react"

/** Whether a media query matches right now (false where matchMedia is missing). */
export function matchesMedia(query: string): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false
}

/** Hover-capable fine pointers: the Add row input is auto-focused only there. */
export const HOVER_POINTER_QUERY = "(hover: hover) and (pointer: fine)"

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** A media query's current result, updated when it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {}
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => matchesMedia(query),
    () => false
  )
}
