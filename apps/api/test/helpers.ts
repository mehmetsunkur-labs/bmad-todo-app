import { Writable } from "node:stream"

import type { ErrorDetail } from "@todos/shared"
import type { FastifyInstance, LightMyRequestResponse } from "fastify"
import type pg from "pg"
import { expect } from "vitest"

import { buildApp } from "../src/app"
import { createPool } from "../src/db/client"
import { runMigrations } from "../src/db/migrate"
import { createLogger } from "../src/logger"

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL as string

/** A pino destination that keeps every JSON log line for assertions. */
export class LogCapture extends Writable {
  readonly lines: Record<string, unknown>[] = []

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim()) this.lines.push(JSON.parse(line))
    }
    callback()
  }

  /** The per-request lines emitted by the onResponse hook. */
  requestLines(): Record<string, unknown>[] {
    return this.lines.filter((l) => l.msg === "request completed")
  }

  clear(): void {
    this.lines.length = 0
  }
}

export interface TestApp {
  app: FastifyInstance
  pool: pg.Pool
  logs: LogCapture
  close(): Promise<void>
}

export function createTestApp(
  options: {
    databaseUrl?: string
    queryTimeoutMillis?: number
    configure?: (app: FastifyInstance) => void
  } = {}
): TestApp {
  const logs = new LogCapture()
  const logger = createLogger("info", logs)
  const pool = createPool(options.databaseUrl ?? TEST_DATABASE_URL, logger, {
    connectionTimeoutMillis: 2_000,
    queryTimeoutMillis: options.queryTimeoutMillis,
  })
  const app = buildApp({ pool, logger })
  options.configure?.(app)
  return {
    app,
    pool,
    logs,
    async close() {
      await app.close()
      await pool.end()
    },
  }
}

/**
 * Applies the committed migrations to `todos_test`. Called once per run from
 * `test/global-setup.ts`, before any test file starts.
 */
export async function migrateTestDatabase(
  databaseUrl: string = TEST_DATABASE_URL
): Promise<void> {
  const logger = createLogger("silent")
  const pool = createPool(databaseUrl, logger)
  try {
    await runMigrations(pool, logger)
  } finally {
    await pool.end()
  }
}

/** Empties `todos` so every test starts from a known state. */
export async function truncateTodos(pool: pg.Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE todos")
}

// Exact envelope bodies: asserted on the raw `res.json()` with `toEqual`, so a
// leaked key fails the test (the shared response schemas strip unknown keys).
export const VALIDATION_BODY = {
  error: { code: "VALIDATION_ERROR", message: "The request is invalid." },
}
export const CONFLICT_BODY = {
  error: {
    code: "CONFLICT",
    message: "The request conflicts with the stored resource.",
  },
}
export const NOT_FOUND_BODY = {
  error: {
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  },
}

/** A JSON `VALIDATION_ERROR` envelope with `status`, and exactly `details` if given. */
export function expectValidationError(
  res: LightMyRequestResponse,
  status: number,
  details?: ErrorDetail[]
): void {
  expect(res.statusCode).toBe(status)
  expect(res.headers["content-type"]).toMatch(/^application\/json/)
  expect(res.json()).toEqual(
    details ? { error: { ...VALIDATION_BODY.error, details } } : VALIDATION_BODY
  )
}
