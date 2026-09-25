import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PLAIN_TOAST_MS, showErrorToast } from "@/lib/toast"
import { advance } from "@/test/fetch"
import { setMediaQuery } from "@/test/media"

import { Toaster } from "./sonner"

const RESTORED = "Couldn't add that todo. Your text is back in the box."

/** Toast messages on screen (each toast's message has role="status"). */
const toasts = () =>
  screen
    .queryAllByRole("status")
    .filter((el) =>
      el.closest("[data-sonner-toast]:not([data-removed='true'])")
    )
    .map((el) => el.textContent)

/** Something outside the toasts to move focus to. */
const outside = () => screen.getByRole("textbox", { name: "Outside" })

function renderToaster() {
  return render(
    <>
      <input aria-label="Outside" />
      <Toaster />
    </>
  )
}

/** A plain (auto-dismissing) failure toast. */
async function plainToast(message = RESTORED) {
  await act(async () => {
    showErrorToast(message)
  })
  await advance(0)
}

/** A persistent failure toast with a Retry action. */
async function retryToast(message: string) {
  await act(async () => {
    showErrorToast(message, { action: { label: "Retry", onClick: () => {} } })
  })
  await advance(0)
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Toaster", () => {
  it(`the plain toast auto-dismisses after ${PLAIN_TOAST_MS} ms`, async () => {
    renderToaster()
    await plainToast()
    expect(toasts()).toEqual([RESTORED])

    await advance(PLAIN_TOAST_MS - 100)
    expect(toasts()).toEqual([RESTORED])
    await advance(500)
    expect(toasts()).toEqual([])
  })

  it("the plain toast's timer pauses while it is hovered or focused", async () => {
    renderToaster()
    await plainToast()
    const toastEl = screen
      .getByRole("status")
      .closest<HTMLElement>("[data-sonner-toast]")!

    await advance(4_000)
    fireEvent.mouseEnter(toastEl)
    await advance(30_000)
    expect(toasts()).toEqual([RESTORED])

    fireEvent.mouseLeave(toastEl)
    await act(async () => {
      toastEl.focus()
    })
    await advance(30_000)
    expect(toasts()).toEqual([RESTORED])

    // Focus leaves: the remaining ~4 s run out.
    await act(async () => {
      outside().focus()
    })
    await advance(3_000)
    expect(toasts()).toEqual([RESTORED])
    await advance(1_500)
    expect(toasts()).toEqual([])
  })

  it("toasts sit bottom-center below 640px and bottom-right from 640px", async () => {
    renderToaster()
    await plainToast()
    await advance(1)
    const toaster = () =>
      document.querySelector<HTMLElement>("[data-sonner-toaster]")!

    expect(toasts()).toEqual([RESTORED])
    expect(toaster()).toHaveAttribute("data-y-position", "bottom")
    expect(toaster()).toHaveAttribute("data-x-position", "center")

    await act(async () => {
      setMediaQuery("(min-width: 640px)", true)
    })
    await advance(1)
    expect(toaster()).toHaveAttribute("data-y-position", "bottom")
    expect(toaster()).toHaveAttribute("data-x-position", "right")
  })

  it("Escape dismisses the newest toast", async () => {
    renderToaster()
    await plainToast()
    await retryToast("Couldn't add “Two”.")
    expect(toasts().sort()).toEqual([RESTORED, "Couldn't add “Two”."].sort())

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" })
    })
    await advance(500)
    expect(toasts()).toEqual([RESTORED])
  })

  it("shows at most 3 toasts at once", async () => {
    renderToaster()
    for (const text of ["a", "b", "c", "d"]) {
      await retryToast(`Couldn't add “${text}”.`)
    }
    expect(toasts()).toHaveLength(4)
    const visible = document.querySelectorAll(
      "[data-sonner-toast][data-visible='true']"
    )
    expect(visible).toHaveLength(3)
  })

  it("the toast has the destructive CircleX icon and no rich colors", async () => {
    renderToaster()
    await plainToast()

    const toastEl = screen
      .getByRole("status")
      .closest<HTMLElement>("[data-sonner-toast]")!
    expect(toastEl.getAttribute("data-rich-colors")).not.toBe("true")
    expect(toastEl.querySelector("svg")).toHaveClass(
      "lucide-circle-x",
      "text-destructive"
    )
  })
})
