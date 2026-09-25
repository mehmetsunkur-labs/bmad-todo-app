import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { TEST_DATABASE_URL } from "./helpers"

const API_DIR = fileURLToPath(new URL("..", import.meta.url))

interface Run {
  code: number | null
  lines: Record<string, unknown>[]
}

function startServer(env: Record<string, string | undefined>) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: API_DIR,
    env: { PATH: process.env.PATH, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const lines: Record<string, unknown>[] = []
  let buffer = ""
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    let idx
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line.startsWith("{")) lines.push(JSON.parse(line))
    }
  })
  const exited = new Promise<Run>((resolve) => {
    child.on("exit", (code) => resolve({ code, lines }))
  })
  return { child, lines, exited }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address()
      srv.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port"))
      )
    })
  })
}

async function waitFor(check: () => boolean, timeoutMs = 15_000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out")
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe("server process", () => {
  it.each([
    [{ DATABASE_URL: TEST_DATABASE_URL, PORT: "abc" }, "PORT"],
    [{ PORT: "3000" }, "DATABASE_URL"],
  ])(
    "exits non-zero before listening on bad config %o",
    async (env, variable) => {
      const { exited } = startServer(env)
      const run = await exited
      expect(run.code).not.toBe(0)
      expect(run.code).not.toBeNull()
      const errorLine = run.lines.find((l) => l.level === 50)
      expect(errorLine?.msg).toContain(variable)
      expect(run.lines.some((l) => String(l.msg).includes("listening"))).toBe(
        false
      )
    }
  )

  it("on SIGTERM closes fastify, then the pool, then exits 0", async () => {
    const port = await freePort()
    const { child, lines, exited } = startServer({
      DATABASE_URL: TEST_DATABASE_URL,
      PORT: String(port),
      LOG_LEVEL: "info",
    })
    let run: Run
    try {
      await waitFor(() =>
        lines.some((l) => String(l.msg).includes("listening"))
      )

      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
      expect(res.status).toBe(200)

      child.kill("SIGTERM")
      run = await exited
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL")
      }
    }
    expect(run.code).toBe(0)
    const msgs = run.lines.map((l) => l.msg)
    const closed = msgs.indexOf("http server closed")
    const poolClosed = msgs.indexOf("database pool closed")
    expect(closed).toBeGreaterThanOrEqual(0)
    expect(poolClosed).toBeGreaterThan(closed)
  })
})
