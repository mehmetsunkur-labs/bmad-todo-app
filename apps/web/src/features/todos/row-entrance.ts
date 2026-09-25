import { createContext } from "react"

import { matchesMedia, REDUCED_MOTION_QUERY } from "@/lib/use-media-query"

/** How long a new row's height takes to expand. */
export const ROW_ENTRANCE_MS = 150

/**
 * `current` is true once the list has shown its loaded rows, so only rows
 * that mount after that (new Todos) animate. Rows of the initial load, or of
 * a "Try again" reload, mount while it is still false.
 */
export const RowEntranceContext = createContext<{ readonly current: boolean }>({
  current: false,
})

/**
 * A new row appears at full opacity and its height expands over 150 ms
 * (instant with `prefers-reduced-motion: reduce`). No-op where the Web
 * Animations API is missing (jsdom).
 */
export function animateRowEntrance(row: HTMLElement): void {
  if (typeof row.animate !== "function") return
  if (matchesMedia(REDUCED_MOTION_QUERY)) return
  const style = getComputedStyle(row)
  const expanded = {
    height: `${row.offsetHeight}px`,
    minHeight: style.minHeight,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
  }
  row.style.overflow = "hidden"
  const animation = row.animate(
    [
      {
        height: "0px",
        minHeight: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
      },
      expanded,
    ],
    { duration: ROW_ENTRANCE_MS, easing: "ease-out" }
  )
  const done = () => {
    row.style.overflow = ""
  }
  animation.onfinish = done
  animation.oncancel = done
}
