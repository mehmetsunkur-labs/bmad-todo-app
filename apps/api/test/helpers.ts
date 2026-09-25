import { Writable } from "node:stream"

import type { FastifyInstance } from "fastify"
import type pg from "pg"

import { buildApp } from "../src/app"
import { createPool } from "../src/db/client"
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
    configure?: (app: FastifyInstance) => void
  } = {}
): TestApp {
  const logs = new LogCapture()
  const logger = createLogger("info", logs)
  const pool = createPool(options.databaseUrl ?? TEST_DATABASE_URL, logger, {
    connectionTimeoutMillis: 2_000,
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
