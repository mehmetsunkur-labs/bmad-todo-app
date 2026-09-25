/**
 * The store behind the one polite live region (`<Announcer />`, mounted once
 * in `AppProviders`). `announce` can be called from anywhere: "Todo added",
 * the character counter, and Epic 2's announcements.
 */
export interface Announcement {
  readonly text: string
  /** Bumped per message, so repeating the same text is announced again. */
  readonly seq: number
}

let current: Announcement = { text: "", seq: 0 }
const listeners = new Set<() => void>()

export function announce(text: string): void {
  current = { text, seq: current.seq + 1 }
  for (const listener of listeners) listener()
}

export function subscribeAnnouncements(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    // With no live region mounted, a stale message has nowhere to go.
    if (listeners.size === 0) current = { text: "", seq: current.seq }
  }
}

export function getAnnouncement(): Announcement {
  return current
}
