import { useSyncExternalStore } from "react"

import { getAnnouncement, subscribeAnnouncements } from "./announce"

/**
 * The one polite, visually hidden live region. It renders the latest
 * `announce(text)` message in a fresh node each time, so the same text
 * ("Todo added" twice) is announced again.
 */
export function Announcer() {
  const { text, seq } = useSyncExternalStore(
    subscribeAnnouncements,
    getAnnouncement,
    getAnnouncement
  )
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="announcer"
    >
      {text && <span key={seq}>{text}</span>}
    </div>
  )
}
