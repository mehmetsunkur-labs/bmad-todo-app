/**
 * A controllable `window.matchMedia` for jsdom, which has none. Every query
 * is false unless a test sets it with `setMediaQuery`; `setup.ts` installs
 * the stub and resets it after each test.
 */
const matches = new Map<string, boolean>()
const lists = new Map<string, Set<(event: MediaQueryListEvent) => void>>()

export function setMediaQuery(query: string, value: boolean): void {
  matches.set(query, value)
  for (const listener of lists.get(query) ?? []) {
    listener({ matches: value, media: query } as MediaQueryListEvent)
  }
}

export function resetMediaQueries(): void {
  matches.clear()
  lists.clear()
}

export function installMatchMedia(): void {
  window.matchMedia = (query: string) => {
    const listeners = lists.get(query) ?? new Set()
    lists.set(query, listeners)
    return {
      get matches() {
        return matches.get(query) ?? false
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListener) =>
        listeners.add(listener as (event: MediaQueryListEvent) => void),
      removeEventListener: (_type: string, listener: EventListener) =>
        listeners.delete(listener as (event: MediaQueryListEvent) => void),
      addListener: (listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }
}
