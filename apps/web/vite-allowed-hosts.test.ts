import { describe, expect, it } from "vitest"

import { parseAllowedHosts } from "./vite-allowed-hosts"

describe("parseAllowedHosts", () => {
  it("returns no hosts when DEV_ALLOWED_HOSTS is unset or empty", () => {
    expect(parseAllowedHosts(undefined)).toEqual([])
    expect(parseAllowedHosts("")).toEqual([])
    expect(parseAllowedHosts(" , ,")).toEqual([])
  })

  it("returns a single host", () => {
    expect(parseAllowedHosts("a.example")).toEqual(["a.example"])
  })

  it("splits a comma list, trimming spaces and dropping empties", () => {
    expect(parseAllowedHosts(" a.example , b.example,,c.example ")).toEqual([
      "a.example",
      "b.example",
      "c.example",
    ])
  })

  it("lowercases host names, since browsers send them in lowercase", () => {
    expect(parseAllowedHosts(" MyHost.Example ")).toEqual(["myhost.example"])
  })
})
