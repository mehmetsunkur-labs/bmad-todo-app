import { act, fireEvent, screen, within } from "@testing-library/react"

/** Toast messages on screen (each toast's message has role="status"). */
export const toasts = () =>
  screen
    .queryAllByRole("status")
    .filter((el) =>
      el.closest("[data-sonner-toast]:not([data-removed='true'])")
    )
    .map((el) => el.textContent)

export const announcer = () => screen.getByTestId("announcer")

/**
 * Each row's Description, in list order. Throws when the list isn't
 * rendered, unless `allowMissing` (then `[]`). With `preferEditField`, a row
 * in edit shows its edit field's value instead.
 */
export function rows({
  allowMissing = false,
  preferEditField = false,
}: { allowMissing?: boolean; preferEditField?: boolean } = {}) {
  const list = allowMissing
    ? screen.queryByRole("list", { name: "Todos" })
    : screen.getByRole("list", { name: "Todos" })
  if (!list) return []
  return within(list)
    .queryAllByRole("listitem")
    .map((li) =>
      preferEditField
        ? (li.querySelector("textarea")?.value ??
          li.querySelector("p")!.textContent)
        : (li.querySelector("p")?.textContent ?? null)
    )
}

export const checkbox = (name: string) => screen.getByRole("checkbox", { name })
export const deleteButton = (name: string) =>
  screen.getByRole("button", { name: `Delete todo: ${name}` })
export const addInput = () => screen.getByRole("textbox", { name: "New todo" })
export const retryButton = () => screen.queryByRole("button", { name: "Retry" })

/** Clicks `element` inside `act`. */
export async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Focuses `element`, then clicks it, inside one `act`. */
export async function focusAndClick(element: HTMLElement) {
  await act(async () => {
    element.focus()
    fireEvent.click(element)
  })
}
