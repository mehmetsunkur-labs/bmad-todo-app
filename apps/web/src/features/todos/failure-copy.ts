/**
 * The failure copy that the create and edit failure handlers share, and the
 * rule for quoting a failed Description in a Retry toast.
 */

export const TOO_LONG_COPY =
  "That todo is too long. The limit is 500 characters."
export const RETRY_LABEL = "Retry"

/** How many characters of a failed Description the Retry toast quotes. */
export const QUOTE_MAX = 40

/**
 * The Description as-is up to `QUOTE_MAX` characters; otherwise its first
 * `QUOTE_MAX` and "…".
 */
export function quoteDescription(description: string): string {
  const chars = Array.from(description)
  return chars.length <= QUOTE_MAX
    ? description
    : `${chars.slice(0, QUOTE_MAX).join("")}…`
}
