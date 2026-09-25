import { matchesMedia, REDUCED_MOTION_QUERY } from "@/lib/use-media-query"

/** How long a deleted row takes to fade out. */
export const ROW_EXIT_FADE_MS = 100
/** How long its height then takes to collapse. */
export const ROW_EXIT_COLLAPSE_MS = 150

/**
 * A deleted row's exit: its opacity goes to 0 over 100 ms, then its height
 * (with min-height, padding and border) collapses over 150 ms, then `onDone`
 * runs. Instant (`onDone` at once) with `prefers-reduced-motion: reduce` or
 * where the Web Animations API is missing (jsdom). Returns a cancel that
 * stops the motion, restores the row's own styles, and skips `onDone` (a
 * rollback brings the row back mid-exit).
 */
export function animateRowExit(
  row: HTMLElement,
  onDone: () => void
): () => void {
  if (typeof row.animate !== "function" || matchesMedia(REDUCED_MOTION_QUERY)) {
    onDone()
    return () => {}
  }

  let cancelled = false
  let collapse: Animation | undefined
  const fade = row.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: ROW_EXIT_FADE_MS,
    easing: "ease-out",
    fill: "forwards",
  })

  fade.onfinish = () => {
    if (cancelled) return
    const style = getComputedStyle(row)
    row.style.overflow = "hidden"
    collapse = row.animate(
      [
        {
          opacity: 0,
          height: `${row.offsetHeight}px`,
          minHeight: style.minHeight,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          borderBottomWidth: style.borderBottomWidth,
        },
        {
          opacity: 0,
          height: "0px",
          minHeight: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          borderBottomWidth: "0px",
        },
      ],
      { duration: ROW_EXIT_COLLAPSE_MS, easing: "ease-in", fill: "forwards" }
    )
    collapse.onfinish = () => {
      if (!cancelled) onDone()
    }
  }

  return () => {
    cancelled = true
    fade.cancel()
    collapse?.cancel()
    row.style.overflow = ""
  }
}
