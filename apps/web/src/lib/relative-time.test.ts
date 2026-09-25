import { describe, expect, it } from "vitest"

import { formatFullDateTime, formatRelativeTime } from "./relative-time"

// Local-time constructors keep these independent of the machine's time zone.
const now = new Date(2026, 8, 24, 15, 30, 0).getTime() // Sep 24 2026, 3:30 PM
const at = (...args: [number, number, number, number?, number?, number?]) =>
  new Date(...(args as [number, number, number, number, number, number]))
const ago = (ms: number) => new Date(now - ms)

describe("formatRelativeTime", () => {
  it('says "just now" under one minute, including a slightly future time', () => {
    expect(formatRelativeTime(ago(0), now)).toBe("just now")
    expect(formatRelativeTime(ago(59_999), now)).toBe("just now")
    expect(formatRelativeTime(ago(-5_000), now)).toBe("just now")
  })

  it('says "{n}m ago" under 60 minutes', () => {
    expect(formatRelativeTime(ago(60_000), now)).toBe("1m ago")
    expect(formatRelativeTime(ago(5 * 60_000 + 30_000), now)).toBe("5m ago")
    expect(formatRelativeTime(ago(59 * 60_000 + 59_999), now)).toBe("59m ago")
  })

  it('says "{n}h ago" later the same calendar day', () => {
    expect(formatRelativeTime(ago(60 * 60_000), now)).toBe("1h ago")
    expect(formatRelativeTime(at(2026, 8, 24, 0, 0, 0), now)).toBe("15h ago")
  })

  it("uses minutes across midnight while under an hour", () => {
    const justAfterMidnight = at(2026, 8, 25, 0, 10, 0).getTime()
    expect(
      formatRelativeTime(at(2026, 8, 24, 23, 30, 0), justAfterMidnight)
    ).toBe("40m ago")
  })

  it('says "yesterday" for the previous calendar day', () => {
    expect(formatRelativeTime(at(2026, 8, 23, 23, 59, 59), now)).toBe(
      "yesterday"
    )
    expect(formatRelativeTime(at(2026, 8, 23, 0, 0, 0), now)).toBe("yesterday")
  })

  it('says "MMM D" for older dates in the same year', () => {
    expect(formatRelativeTime(at(2026, 8, 22, 23, 59, 59), now)).toBe("Sep 22")
    expect(formatRelativeTime(at(2026, 0, 1, 9, 0, 0), now)).toBe("Jan 1")
  })

  it('adds ", YYYY" when the year differs', () => {
    expect(formatRelativeTime(at(2025, 8, 12, 9, 0, 0), now)).toBe(
      "Sep 12, 2025"
    )
    const newYear = at(2027, 0, 1, 12, 0, 0).getTime()
    expect(formatRelativeTime(at(2026, 11, 31, 8, 0, 0), newYear)).toBe(
      "yesterday"
    )
    expect(formatRelativeTime(at(2026, 11, 30, 8, 0, 0), newYear)).toBe(
      "Dec 30, 2026"
    )
  })
})

describe("formatFullDateTime", () => {
  it('formats as "MMM D, YYYY, h:mm AM" with plain spaces', () => {
    expect(formatFullDateTime(at(2026, 8, 24, 9, 14, 0))).toBe(
      "Sep 24, 2026, 9:14 AM"
    )
    expect(formatFullDateTime(at(2026, 8, 24, 21, 5, 0))).toBe(
      "Sep 24, 2026, 9:05 PM"
    )
  })
})
