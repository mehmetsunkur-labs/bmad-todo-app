import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { jsonResponse, renderWithProviders } from "@/test/render"

import App from "./App"

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ todos: [] }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("App frame", () => {
  it("renders the Todos heading inside the header landmark", () => {
    renderWithProviders(<App />)

    const banner = screen.getByRole("banner")
    const heading = within(banner).getByRole("heading", { level: 1 })
    expect(heading).toHaveTextContent("Todos")
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  })

  it("renders the Todo List inside main, after the header", async () => {
    renderWithProviders(<App />)

    const banner = screen.getByRole("banner")
    const main = screen.getByRole("main")
    expect(
      within(main).getByRole("list", { name: "Todos" })
    ).toBeInTheDocument()
    expect(
      await within(main).findByText("Nothing here yet.")
    ).toBeInTheDocument()
    expect(
      banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
