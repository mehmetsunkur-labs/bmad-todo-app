import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("keeps a custom type-role size next to a text colour", () => {
    expect(cn("text-meta", "text-muted-foreground")).toBe(
      "text-meta text-muted-foreground"
    )
    expect(
      cn("text-todo-description", "text-muted-foreground line-through")
    ).toBe("text-todo-description text-muted-foreground line-through")
  })

  it("still resolves a custom size against another font size", () => {
    expect(cn("text-meta", "text-sm")).toBe("text-sm")
    expect(cn("text-app-title text-empty-title")).toBe("text-empty-title")
  })
})
