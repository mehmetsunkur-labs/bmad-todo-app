import { ErrorCodeSchema } from "@todos/shared"
import { describe, expect, it } from "vitest"

import { HttpError, isNotFound, type HttpErrorKind } from "./http"

const OTHER_KINDS: HttpErrorKind[] = [
  ...ErrorCodeSchema.options.filter((kind) => kind !== "NOT_FOUND"),
  "NETWORK",
]

describe("isNotFound", () => {
  it("is true for an HttpError of kind NOT_FOUND", () => {
    expect(isNotFound(new HttpError("NOT_FOUND", { status: 404 }))).toBe(true)
  })

  it.each(OTHER_KINDS)("is false for an HttpError of kind %s", (kind) => {
    expect(isNotFound(new HttpError(kind))).toBe(false)
  })

  it("is false for a plain Error, even one that looks like a 404", () => {
    const error = Object.assign(new Error("Not found"), { kind: "NOT_FOUND" })
    expect(isNotFound(error)).toBe(false)
  })

  it.each([null, undefined, "NOT_FOUND", 404, { kind: "NOT_FOUND" }])(
    "is false for the non-error value %j",
    (value) => {
      expect(isNotFound(value)).toBe(false)
    }
  )
})
