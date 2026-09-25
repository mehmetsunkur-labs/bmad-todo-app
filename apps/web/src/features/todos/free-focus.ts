/** The attribute that marks an element as "free" focus (the list region). */
const FOCUS_FREE_ATTRIBUTE = "data-focus-free"

/**
 * Whether focus is "free": on nothing, on `<body>`, or on an element marked
 * `data-focus-free` (the list region, where a click on blank list space or
 * "Try again" leaves it). A failure handler may then move focus without
 * taking it from anything the user chose.
 */
export function focusIsFree(): boolean {
  const active = document.activeElement
  return (
    !active ||
    active === document.body ||
    active.hasAttribute(FOCUS_FREE_ATTRIBUTE)
  )
}
