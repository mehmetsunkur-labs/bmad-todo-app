// Unit test for the stack smoke test's port choice (runs in `pnpm test` and
// `pnpm test:stack`).

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { pickSmokePort } from "./lib/smoke-port.mjs"

describe("pickSmokePort", () => {
  it("ignores WEB_PORT", () => {
    assert.equal(pickSmokePort({ WEB_PORT: "8080" }, 18080), "18080")
  })

  it("uses SMOKE_WEB_PORT when set", () => {
    assert.equal(pickSmokePort({ SMOKE_WEB_PORT: "19999" }, 18080), "19999")
    assert.equal(
      pickSmokePort({ SMOKE_WEB_PORT: "19999", WEB_PORT: "8080" }, 18080),
      "19999"
    )
  })
})
