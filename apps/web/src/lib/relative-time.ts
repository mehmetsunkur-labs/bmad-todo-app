const MINUTE = 60_000
const HOUR = 60 * MINUTE

const LOCALE = "en-US"

const shortDate = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
})
const shortDateWithYear = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
})
const fullDateTime = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** ICU may put a narrow no-break space before AM/PM; use a plain space. */
function plainSpaces(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ")
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * The Created At relative text, in local calendar terms:
 * under 1 minute "just now" (also for a slightly-future provisional time),
 * under 60 minutes "{n}m ago", the same calendar day "{n}h ago", the
 * previous calendar day "yesterday", otherwise "MMM D" (plus ", YYYY" when
 * the year differs from now's).
 */
export function formatRelativeTime(date: Date, now: number): string {
  const diff = now - date.getTime()
  if (diff < MINUTE) return "just now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`

  const nowDate = new Date(now)
  const today = startOfDay(nowDate)
  const day = startOfDay(date)
  if (day === today) return `${Math.floor(diff / HOUR)}h ago`

  const yesterday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate() - 1
  ).getTime()
  if (day === yesterday) return "yesterday"

  return date.getFullYear() === nowDate.getFullYear()
    ? shortDate.format(date)
    : shortDateWithYear.format(date)
}

/** The full date and time, e.g. "Sep 24, 2026, 9:14 AM". */
export function formatFullDateTime(date: Date): string {
  return plainSpaces(fullDateTime.format(date))
}
