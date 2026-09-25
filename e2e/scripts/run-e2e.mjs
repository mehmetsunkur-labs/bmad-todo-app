// End-to-end suite orchestrator (Story 3.3).
//
//   pnpm test:e2e                          # every project
//   pnpm test:e2e -- --project=chromium    # extra args go to `playwright test`
//
// 1. Brings up `compose.yaml` on its own in the isolated Compose project
//    `todos-e2e` on a free WEB_PORT (from 18280), so the developer's `todos`
//    stack and its `todos-data` volume are never touched.
// 2. Starts the official Playwright image as a `run-server` on host
//    networking: all three engines come from the container, so nothing is
//    installed on the host. The runner stays on the host and connects to it.
// 3. Runs `playwright test` with the stack and server in the environment.
// 4. Always tears down: removes the server container, then `down -v` for
//    `todos-e2e` only. Exits with Playwright's exit code.

import { execFile, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { connect, createServer } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)

const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ROOT = resolve(E2E_DIR, "..")
const PROJECT = "todos-e2e"
// The installed runner's version, so the run-server image and npx match it.
const PLAYWRIGHT_VERSION = JSON.parse(
  readFileSync(
    resolve(E2E_DIR, "node_modules/@playwright/test/package.json"),
    "utf8"
  )
).version
const IMAGE = `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`
const SERVER_NAME = `todos-e2e-pw-${process.pid}-${randomBytes(3).toString("hex")}`

const log = (msg) => console.log(`run-e2e: ${msg}`)

/** Whether `port` can be bound on `host`. */
function canBind(port, host) {
  return new Promise((done) => {
    const server = createServer()
    server.once("error", () => done(false))
    server.listen(port, host, () => server.close(() => done(true)))
  })
}

/** The first port from `start` that can be bound on all interfaces. */
async function firstFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await canBind(port, "0.0.0.0")) return port
  }
  throw new Error(`no free port in ${start}-${start + 99}`)
}

/** Resolves once something accepts TCP connections on 127.0.0.1:`port`. */
function tcpOpen(port) {
  return new Promise((done) => {
    const socket = connect({ port, host: "127.0.0.1" })
    socket.setTimeout(2_000)
    socket.once("connect", () => {
      socket.destroy()
      done(true)
    })
    socket.once("timeout", () => {
      socket.destroy()
      done(false)
    })
    socket.once("error", () => done(false))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WEB_PORT = String(
  process.env.E2E_WEB_PORT || (await firstFreePort(18280))
)
let WS_PORT = await firstFreePort(18380)
if (String(WS_PORT) === WEB_PORT) WS_PORT = await firstFreePort(WS_PORT + 1)
// WEB_PORT from here wins over `.env`'s value (the user's stack may hold it).
const ENV = { ...process.env, WEB_PORT }

async function compose(args, { timeout = 900_000 } = {}) {
  await new Promise((done, fail) => {
    const child = spawn(
      "docker",
      ["compose", "-p", PROJECT, "-f", "compose.yaml", ...args],
      { cwd: ROOT, env: ENV, stdio: ["ignore", "inherit", "inherit"] }
    )
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout)
    child.once("error", fail)
    child.once("exit", (code, signal) => {
      clearTimeout(timer)
      if (code === 0) done()
      else
        fail(
          new Error(
            `docker compose ${args.join(" ")} failed (${signal ?? code})`
          )
        )
    })
  })
}

async function docker(args, { timeout = 120_000 } = {}) {
  const { stdout } = await run("docker", args, {
    cwd: ROOT,
    env: ENV,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout.trim()
}

async function startServer() {
  await docker(
    [
      "run",
      "-d",
      "--rm",
      "--init",
      "--ipc=host",
      "--network",
      "host",
      "--name",
      SERVER_NAME,
      "--label",
      "com.todos.e2e=run-server",
      IMAGE,
      "npx",
      "-y",
      `playwright@${PLAYWRIGHT_VERSION}`,
      "run-server",
      "--port",
      String(WS_PORT),
      "--host",
      "127.0.0.1",
    ],
    // The first run pulls the image.
    { timeout: 900_000 }
  )
  const deadline = Date.now() + 180_000
  for (;;) {
    if (await tcpOpen(WS_PORT)) return
    const running = await docker([
      "inspect",
      "-f",
      "{{.State.Running}}",
      SERVER_NAME,
    ]).catch(() => "false")
    if (running !== "true" || Date.now() > deadline) {
      const logs = await docker(["logs", SERVER_NAME]).catch(() => "")
      throw new Error(`run-server did not start on port ${WS_PORT}\n${logs}`)
    }
    await sleep(500)
  }
}

/** Polls the stack's health through nginx until 200 (web has no healthcheck). */
async function waitForWeb(timeoutMs = 120_000) {
  const url = `http://127.0.0.1:${WEB_PORT}/api/v1/health`
  const deadline = Date.now() + timeoutMs
  let last = "no response"
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (res.status === 200) return
      last = `status ${res.status}`
    } catch (err) {
      last = err.message
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${url} not 200 within ${timeoutMs / 1000} s (last: ${last})`
      )
    }
    await sleep(500)
  }
}

/** Tears down; returns false if `down -v` failed or anything was left behind. */
let tornDown = false
async function teardown() {
  if (tornDown) return true
  tornDown = true
  log("teardown")
  let ok = true
  await docker(["rm", "-f", SERVER_NAME]).catch(() => undefined)
  // Only ever the isolated e2e project; never the user's `todos` stack.
  await compose(["down", "-v"], { timeout: 180_000 }).catch((err) => {
    console.error(`run-e2e: ${err.message}`)
    ok = false
  })
  const label = `label=com.docker.compose.project=${PROJECT}`
  const left = await Promise.all([
    docker(["ps", "-a", "--filter", label, "--format", "container {{.Names}}"]),
    docker(["volume", "ls", "--filter", label, "--format", "volume {{.Name}}"]),
    docker([
      "ps",
      "-a",
      "--filter",
      `name=^${SERVER_NAME}$`,
      "--format",
      "container {{.Names}}",
    ]),
  ]).then(
    (outs) => outs.join("\n").split("\n").filter(Boolean),
    (err) => [`(could not list leftovers: ${err.message})`]
  )
  if (left.length > 0) {
    console.error(`run-e2e: teardown left behind:\n  ${left.join("\n  ")}`)
    ok = false
  }
  return ok
}

let child
let interrupted = false
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true
    // Playwright stops, then the normal path below tears down. Ctrl+C already
    // sent SIGINT to the whole process group; a second one would make
    // Playwright force-exit without its report.
    if (child && signal !== "SIGINT") child.kill(signal)
  })
}

let exitCode = 1
try {
  log(`starting ${PROJECT} on WEB_PORT=${WEB_PORT}`)
  await compose(["up", "-d", "--build", "--wait"])
  if (interrupted) throw new Error("interrupted")
  log(`starting ${IMAGE} run-server on port ${WS_PORT}`)
  await startServer()
  if (interrupted) throw new Error("interrupted")
  await waitForWeb()
  if (interrupted) throw new Error("interrupted")

  // `pnpm test:e2e -- --x` may forward the `--` itself.
  const extra = process.argv.slice(2)
  if (extra[0] === "--") extra.shift()

  exitCode = await new Promise((done, fail) => {
    child = spawn(
      process.execPath,
      [
        resolve(E2E_DIR, "node_modules/@playwright/test/cli.js"),
        "test",
        ...extra,
      ],
      {
        cwd: E2E_DIR,
        stdio: "inherit",
        env: {
          ...ENV,
          E2E_BASE_URL: `http://127.0.0.1:${WEB_PORT}`,
          E2E_WS_ENDPOINT: `ws://127.0.0.1:${WS_PORT}/`,
          E2E_COMPOSE_PROJECT: PROJECT,
          E2E_WEB_PORT: WEB_PORT,
          E2E_REPO_ROOT: ROOT,
        },
      }
    )
    child.once("error", fail)
    child.once("exit", (code, signal) => done(code ?? (signal ? 1 : 0)))
  })
} catch (err) {
  console.error(`run-e2e: ${err.message}`)
  exitCode = 1
} finally {
  if (!(await teardown()) && exitCode === 0) exitCode = 1
}
process.exit(exitCode)
