import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type pg from "pg"
import { describe, expect, it, vi } from "vitest"

import { runMigrations } from "../src/db/migrate"
import { createLogger } from "../src/logger"
import { LogCapture } from "./helpers"

describe("runMigrations", () => {
  it("is a no-op when drizzle/meta/_journal.json is absent", async () => {
    const folder = mkdtempSync(join(tmpdir(), "todos-migrations-"))
    const logs = new LogCapture()
    const pool = { connect: vi.fn(), query: vi.fn() } as unknown as pg.Pool

    await runMigrations(pool, createLogger("info", logs), folder)

    expect(pool.connect).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled()
    expect(logs.lines.map((l) => l.msg)).toEqual(["no migrations to apply"])
  })
})
