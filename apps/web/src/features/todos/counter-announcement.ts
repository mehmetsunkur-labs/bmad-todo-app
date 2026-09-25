import { COUNTER_THRESHOLD, DESCRIPTION_MAX } from "@todos/shared"

/**
 * The counter text, when a change in length should be announced: crossing
 * `COUNTER_THRESHOLD` or `DESCRIPTION_MAX` upwards. Shared by the Add row
 * and the inline edit field.
 */
export function counterAnnouncement(
  previous: number,
  next: number
): string | null {
  const crossed = (limit: number) => previous < limit && next >= limit
  if (crossed(DESCRIPTION_MAX) || crossed(COUNTER_THRESHOLD)) {
    return `${next} / ${DESCRIPTION_MAX}`
  }
  return null
}
