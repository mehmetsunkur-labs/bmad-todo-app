import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "./App"

describe("App frame", () => {
  it("renders the Todos heading inside the header landmark", () => {
    render(<App />)

    const banner = screen.getByRole("banner")
    const heading = within(banner).getByRole("heading", { level: 1 })
    expect(heading).toHaveTextContent("Todos")
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  })

  it("renders an empty main landmark after the header", () => {
    render(<App />)

    const banner = screen.getByRole("banner")
    const main = screen.getByRole("main")
    expect(main).toBeEmptyDOMElement()
    expect(
      banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
