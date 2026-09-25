import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type pg from "pg"
import { describe, expect, it, vi } from "vitest"

import { createPool } from "../src/db/client"
import { runMigrations } from "../src/db/migrate"
import { createLogger } from "../src/logger"
import { LogCapture, TEST_DATABASE_URL } from "./helpers"

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

  it("applies the committed migrations to a fresh database, creating the todos table", async () => {
    // A scratch database created for this test only: `todos_test` has already
    // been migrated by the global setup, where drizzle would skip every
    // recorded migration and a broken fresh migration could still pass.
    const scratchName = `todos_migrate_${process.pid}_${Date.now()}`
    const scratchUrl = new URL(TEST_DATABASE_URL)
    scratchUrl.pathname = `/${scratchName}`

    const admin = createPool(TEST_DATABASE_URL, createLogger("silent"))
    let created = false
    let pool: pg.Pool | undefined
    try {
      await admin.query(`CREATE DATABASE "${scratchName}"`)
      created = true

      const logs = new LogCapture()
      const logger = createLogger("info", logs)
      pool = createPool(scratchUrl.toString(), logger)

      const before = await pool.query(
        "SELECT to_regclass('public.todos') AS todos"
      )
      expect(before.rows[0].todos).toBeNull()

      await runMigrations(pool, logger)
      expect(logs.lines.map((l) => l.msg)).toContain("migrations applied")

      const { rows } = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default,
               datetime_precision
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'todos'
        ORDER BY ordinal_position
      `)
      expect(
        rows.map((r) => ({
          name: r.column_name,
          type: r.data_type,
          nullable: r.is_nullable,
          default: r.column_default,
          ...(r.data_type.startsWith("timestamp")
            ? { precision: r.datetime_precision }
            : {}),
        }))
      ).toEqual([
        { name: "id", type: "uuid", nullable: "NO", default: null },
        { name: "description", type: "text", nullable: "NO", default: null },
        {
          name: "completed",
          type: "boolean",
          nullable: "NO",
          default: "false",
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          nullable: "NO",
          default: "now()",
          precision: 3,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          nullable: "NO",
          default: "now()",
          precision: 3,
        },
      ])

      const pk = await pool.query(`
        SELECT a.attname FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'public.todos'::regclass AND i.indisprimary
      `)
      expect(pk.rows.map((r) => r.attname)).toEqual(["id"])
    } finally {
      try {
        await pool?.end()
        if (created) {
          await admin.query(
            `DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`
          )
        }
      } finally {
        await admin.end()
      }
    }
  })
})
