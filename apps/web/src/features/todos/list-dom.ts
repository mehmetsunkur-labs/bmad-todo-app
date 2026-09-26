// DOM queries over the rendered list region, shared by the list and its hooks.

/** A rendered, non-exiting row. */
export function rowOf(
  region: HTMLElement | null,
  id: string
): HTMLElement | null {
  for (const li of region?.querySelectorAll<HTMLElement>("li[data-todo-id]") ??
    []) {
    if (li.dataset.todoId === id && !li.hasAttribute("inert")) return li
  }
  return null
}

/** A rendered, non-exiting row's checkbox. */
export function checkboxOf(
  region: HTMLElement | null,
  id: string
): HTMLElement | null {
  return (
    rowOf(region, id)?.querySelector<HTMLElement>('[role="checkbox"]') ?? null
  )
}

/** The first target's checkbox still rendered, if any. */
export function firstCheckbox(
  region: HTMLElement | null,
  targets: readonly string[]
): HTMLElement | null {
  for (const id of targets) {
    const box = checkboxOf(region, id)
    if (box) return box
  }
  return null
}
