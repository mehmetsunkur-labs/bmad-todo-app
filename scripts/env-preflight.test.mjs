// Unit test for the harnesses' `.env` preflight (runs in `pnpm test` and
// `pnpm test:stack`).

import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"

import { envPreflight } from "./lib/env-preflight.mjs"

const MESSAGE = /copy \.env\.example to \.env/

describe("envPreflight", () => {
  const dir = mkdtempSync(join(tmpdir(), "todos-preflight-"))
  after(() => rmSync(dir, { recursive: true, force: true }))

  /**
   * A fresh repo root, with `.env` holding `contents` if given.
   * @param {string} [contents]
   */
  const root = (contents) => {
    const d = mkdtempSync(join(dir, "root-"))
    if (contents !== undefined) writeFileSync(join(d, ".env"), contents)
    return d
  }

  const PG = {
    POSTGRES_USER: "u",
    POSTGRES_PASSWORD: "p",
    POSTGRES_DB: "d",
  }

  it("throws without .env and without POSTGRES_*", () => {
    assert.throws(() => envPreflight(root(), {}), MESSAGE)
  })

  it("throws without .env when only some POSTGRES_* are set", () => {
    assert.throws(
      () => envPreflight(root(), { POSTGRES_USER: "u", POSTGRES_DB: "d" }),
      MESSAGE
    )
  })

  it("throws with an incomplete .env", () => {
    assert.throws(
      () => envPreflight(root("POSTGRES_USER=u\nPOSTGRES_DB=d\n"), {}),
      MESSAGE
    )
  })

  it("passes without .env when POSTGRES_USER, _PASSWORD and _DB are set", () => {
    assert.doesNotThrow(() => envPreflight(root(), PG))
  })

  it("passes with a complete .env", () => {
    assert.doesNotThrow(() =>
      envPreflight(
        root(
          "# comment\nPOSTGRES_USER=u\nPOSTGRES_PASSWORD=p\nPOSTGRES_DB=d\n"
        ),
        {}
      )
    )
  })

  it("passes when .env and the environment together set all three", () => {
    assert.doesNotThrow(() =>
      envPreflight(root("POSTGRES_USER=u\nPOSTGRES_DB=d\n"), {
        POSTGRES_PASSWORD: "p",
      })
    )
  })
})
