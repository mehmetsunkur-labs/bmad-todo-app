// HTTP-level smoke test of the production-like stack (Story 3.1).
//
// Runs `compose.yaml` on its own in an isolated Compose project
// (`todos-smoke`), so the developer's `todos` stack and its data are never
// touched, and drives it through nginx on the host's LAN address, as a phone
// on the same network would. Needs Docker, so it is not part of `pnpm test`.
//
//   pnpm test:stack
//
// The web port is WEB_PORT from the shell environment if set (`.env`'s value
// is ignored, since the dev stack usually holds it); otherwise 18080, or the
// next free port above it when 18080 is taken.
//
// Credentials come from the environment or `.env` (Compose reads it).
// Teardown always runs `down -v`, and only for the `todos-smoke` project.

import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createServer } from "node:net"
import { networkInterfaces } from "node:os"
import { dirname, resolve } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PROJECT = "todos-smoke"
const WEB_PORT = process.env.WEB_PORT || String(await firstFreePort(18080))
const ENV = { ...process.env, WEB_PORT }

const HOST = pickHostAddress()
const BASE = `http://${HOST}:${WEB_PORT}`
const NETWORK = `${PROJECT}_default`
const FETCH_TIMEOUT_MS = 15_000

if (HOST === "127.0.0.1") {
  console.warn(
    "stack-smoke: WARNING no non-loopback IPv4 found; falling back to " +
      "127.0.0.1, so the LAN (phone) path is NOT exercised."
  )
}

/** The first port from `start` that can be bound on all interfaces. */
async function firstFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    const free = await new Promise((done) => {
      const server = createServer()
      server.once("error", () => done(false))
      server.listen(port, "0.0.0.0", () => server.close(() => done(true)))
    })
    if (free) return port
  }
  throw new Error(`no free port in ${start}-${start + 99}`)
}

/** First non-loopback IPv4, preferring real NICs over container bridges. */
function pickHostAddress() {
  const candidates = []
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        candidates.push({ name, address: addr.address })
      }
    }
  }
  const virtual =
    /^(docker|br-|veth|virbr|vnet|tap|tun|qg-|qr-|ovs|cni|flannel)/
  const physical = candidates.find((c) => !virtual.test(c.name))
  return (physical ?? candidates[0])?.address ?? "127.0.0.1"
}

async function compose(args, { prod = true, timeout = 900_000 } = {}) {
  const files = prod ? ["-f", "compose.yaml"] : []
  const { stdout } = await run(
    "docker",
    ["compose", "-p", PROJECT, ...files, ...args],
    { cwd: ROOT, env: ENV, timeout, maxBuffer: 64 * 1024 * 1024 }
  )
  return stdout
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** fetch against the stack, always bounded by a timeout. */
function get(path, init = {}) {
  return fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...init,
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

/** The container id of a service in the smoke project. */
async function containerId(service) {
  const id = (await compose(["ps", "-q", service])).trim()
  assert.ok(id, `${service} container exists`)
  return id
}

/** A container's IPv4 on the smoke project network. */
async function containerIp(id) {
  return docker([
    "inspect",
    "-f",
    `{{(index .NetworkSettings.Networks "${NETWORK}").IPAddress}}`,
    id,
  ])
}

function assertNoCors(res, label) {
  const cors = [...res.headers.keys()].filter((k) =>
    k.toLowerCase().startsWith("access-control-")
  )
  assert.deepEqual(cors, [], `${label}: unexpected CORS headers`)
}

async function api(method, path, body) {
  const res = await get(path, {
    method,
    headers: {
      // A cross-origin Origin would provoke CORS headers if any were enabled.
      Origin: "http://example.invalid",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assertNoCors(res, `${method} ${path}`)
  const text = await res.text()
  let json
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      assert.fail(
        `${method} ${path}: status ${res.status} with a non-JSON body: ${text.slice(0, 200)}`
      )
    }
  }
  return { status: res.status, json }
}

async function waitForHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await get("/api/v1/health", {
        signal: AbortSignal.timeout(5_000),
      })
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("stack did not become healthy")
    await sleep(500)
  }
}

async function apiLogLines() {
  const out = await compose(["logs", "--no-log-prefix", "api"])
  return out
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return undefined
      }
    })
    .filter(Boolean)
}

describe(`production-like stack (${BASE})`, { concurrency: 1 }, () => {
  before(
    async () => {
      await compose(["down", "-v"]).catch(() => undefined)
      await compose(["up", "-d", "--build", "--wait"])
      await waitForHealth()
    },
    { timeout: 900_000 }
  )

  after(
    async () => {
      // Only ever the isolated smoke project; never the user's `todos` stack.
      await compose(["down", "-v"])
    },
    { timeout: 120_000 }
  )

  it("prod config: :prod images, a published port on web only, AD-10 topology", async () => {
    const cfg = JSON.parse(await compose(["config", "--format", "json"]))
    assert.deepEqual(Object.keys(cfg.services).sort(), ["api", "db", "web"])
    assert.equal(cfg.services.api.image, "todos-api:prod")
    assert.equal(cfg.services.web.image, "todos-web:prod")
    assert.equal(cfg.services.api.build.target, undefined)
    assert.equal(cfg.services.web.build.target, undefined)
    for (const name of ["db", "api"]) {
      assert.equal(cfg.services[name].ports, undefined, `${name} ports`)
    }
    assert.equal(cfg.services.web.ports.length, 1)
    assert.equal(String(cfg.services.web.ports[0].target), "8080")
    assert.equal(String(cfg.services.web.ports[0].published), WEB_PORT)
    assert.ok(!cfg.services.web.ports[0].host_ip, "web binds all interfaces")
    for (const name of ["db", "api", "web"]) {
      assert.equal(
        cfg.services[name].restart,
        "unless-stopped",
        `${name} restart`
      )
    }
    for (const name of ["api", "web"]) {
      assert.equal(cfg.services[name].init, true, `${name} init`)
    }
    assert.equal(cfg.services.db.init, undefined, "db init")
    const volumes = cfg.services.db.volumes ?? []
    assert.equal(volumes.length, 1, "db has only the data volume")
    assert.equal(volumes[0].type, "volume")
    assert.equal(volumes[0].source, "todos-data")
    assert.equal(volumes[0].target, "/var/lib/postgresql")
    for (const name of ["db", "api", "web"]) {
      assert.equal(
        cfg.services[name].environment?.PGDATA,
        undefined,
        `${name} PGDATA`
      )
    }
  })

  it("prod API image is the prod stage (no watch, production env, non-root)", async () => {
    const [img] = JSON.parse(
      await docker(["image", "inspect", "todos-api:prod"])
    )
    assert.deepEqual(img.Config.Cmd, [
      "node",
      "--import",
      "tsx",
      "src/server.ts",
    ])
    assert.ok(
      img.Config.Env.includes("NODE_ENV=production"),
      "NODE_ENV=production"
    )
    assert.equal(img.Config.User, "node")
  })

  it("dev config: target dev and :dev images", async () => {
    const cfg = JSON.parse(
      await compose(["config", "--format", "json"], { prod: false })
    )
    assert.equal(cfg.services.api.image, "todos-api:dev")
    assert.equal(cfg.services.web.image, "todos-web:dev")
    assert.equal(cfg.services.api.build.target, "dev")
    assert.equal(cfg.services.web.build.target, "dev")
  })

  let indexHtml
  it("GET / serves the built index.html", async () => {
    const res = await get("/")
    assert.equal(res.status, 200)
    assert.match(res.headers.get("content-type") ?? "", /text\/html/)
    assert.equal(res.headers.get("cache-control"), "no-cache")
    assertNoCors(res, "GET /")
    assert.equal(res.headers.get("server"), "nginx", "server_tokens off")
    indexHtml = await res.text()
    assert.match(indexHtml, /<title>Todos<\/title>/)
    assert.doesNotMatch(indexHtml, /@vite\/client/, "not the Vite dev server")
  })

  it("GET /some/route falls back to the same index.html", async () => {
    const res = await get("/some/route")
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("cache-control"), "no-cache")
    assert.equal(await res.text(), indexHtml)
  })

  it("GET /assets/<file> serves a hashed asset with immutable caching", async () => {
    const asset = indexHtml.match(/\/assets\/[^"'\s>]+/)?.[0]
    assert.ok(asset, "index.html references an /assets/ file")
    const res = await get(asset)
    assert.equal(res.status, 200)
    assert.match(res.headers.get("cache-control") ?? "", /immutable/)
    assert.ok((await res.arrayBuffer()).byteLength > 0)
  })

  it("GET /api/v1/health reaches the API with the path unchanged", async () => {
    const since = Date.now()
    const burst = 5
    for (let i = 0; i < burst; i++) {
      const { status, json } = await api("GET", "/api/v1/health")
      assert.equal(status, 200)
      assert.deepEqual(json, { status: "ok" })
    }
    const until = Date.now() + 1000
    // The container healthcheck also hits this route (every 10 s), so require
    // the whole burst to show up in the window, not just one line.
    let lines = []
    for (let attempt = 0; attempt < 10; attempt++) {
      lines = (await apiLogLines()).filter(
        (l) =>
          l.route === "/api/v1/health" &&
          l.statusCode === 200 &&
          l.time >= since - 1000 &&
          l.time <= until
      )
      if (lines.length >= burst) break
      await new Promise((r) => setTimeout(r, 300))
    }
    assert.ok(
      lines.length >= burst,
      `expected ${burst} health log lines with route /api/v1/health, got ${lines.length}`
    )
  })

  it("CRUD round trip through the proxy returns the documented statuses", async () => {
    const id = randomUUID()
    const created = await api("POST", "/api/v1/todos", {
      id,
      description: "smoke: buy milk",
    })
    assert.equal(created.status, 201)
    assert.equal(created.json.id, id)
    assert.equal(created.json.description, "smoke: buy milk")
    assert.equal(created.json.completed, false)

    const replay = await api("POST", "/api/v1/todos", {
      id,
      description: "smoke: buy milk",
    })
    assert.equal(replay.status, 200, "idempotent create replay")
    assert.deepEqual(replay.json, created.json)

    const list = await api("GET", "/api/v1/todos")
    assert.equal(list.status, 200)
    assert.ok(list.json.todos.some((t) => t.id === id))

    const toggled = await api("PATCH", `/api/v1/todos/${id}`, {
      completed: true,
    })
    assert.equal(toggled.status, 200)
    assert.equal(toggled.json.completed, true)

    const edited = await api("PATCH", `/api/v1/todos/${id}`, {
      description: "smoke: buy oat milk",
    })
    assert.equal(edited.status, 200)
    assert.equal(edited.json.description, "smoke: buy oat milk")
    assert.equal(edited.json.createdAt, created.json.createdAt)

    const invalid = await api("POST", "/api/v1/todos", {
      id: randomUUID(),
      description: "   ",
    })
    assert.equal(invalid.status, 400)
    assert.equal(invalid.json.error.code, "VALIDATION_ERROR")

    const removed = await api("DELETE", `/api/v1/todos/${id}`)
    assert.equal(removed.status, 204)
    assert.equal(removed.json, undefined)

    const gone = await api("PATCH", `/api/v1/todos/${id}`, { completed: false })
    assert.equal(gone.status, 404)
    assert.equal(gone.json.error.code, "NOT_FOUND")
  })

  it(
    "Todos survive down then up with unchanged timestamps",
    { timeout: 300_000 },
    async () => {
      const created = []
      for (const description of ["smoke: first", "smoke: second"]) {
        const res = await api("POST", "/api/v1/todos", {
          id: randomUUID(),
          description,
        })
        assert.equal(res.status, 201)
        created.push(res.json)
      }
      // Toggle one so updatedAt differs from createdAt and must survive too.
      const toggled = await api("PATCH", `/api/v1/todos/${created[1].id}`, {
        completed: true,
      })
      assert.equal(toggled.status, 200)
      created[1] = toggled.json

      await compose(["down"])
      await compose(["up", "-d", "--wait"])
      await waitForHealth()

      const afterRestart = await api("GET", "/api/v1/todos")
      assert.equal(afterRestart.status, 200)
      for (const todo of created) {
        const found = afterRestart.json.todos.find((t) => t.id === todo.id)
        assert.ok(found, `todo ${todo.id} survived down/up`)
        assert.deepEqual(found, todo, "fields and timestamps unchanged")
      }
    }
  )

  it(
    "API down: fast gateway error, then a steady nginx 502 HTML page; api shut down gracefully",
    { timeout: 180_000 },
    async () => {
      const stoppedAt = Date.now()
      await compose(["stop", "api"])
      try {
        const started = Date.now()
        const res = await get("/api/v1/todos")
        const body = await res.text()
        const elapsed = Date.now() - started
        // An nginx HTML error page, which the client classifies as INTERNAL.
        // Usually 502 (no route / api not resolvable). Within the resolver's
        // 10 s cache nginx may still try the stopped container's IP, and the
        // connect can then hit proxy_connect_timeout (504) instead. Either
        // way it must fail fast, well inside the client's 10 s timeout.
        assert.ok([502, 504].includes(res.status), `status ${res.status}`)
        assert.ok(elapsed < 8_000, `gateway error took ${elapsed} ms`)
        assertNoCors(res, "gateway error")
        assert.match(res.headers.get("content-type") ?? "", /text\/html/)
        assert.throws(() => JSON.parse(body), "gateway error body is not JSON")

        // Once the resolver cache (valid=10s) has expired, `api` no longer
        // resolves and a stopped api is always an nginx 502 HTML page.
        await sleep(11_000)
        const steady = await get("/api/v1/todos")
        const steadyBody = await steady.text()
        assert.equal(steady.status, 502)
        assert.match(steady.headers.get("content-type") ?? "", /text\/html/)
        assert.throws(() => JSON.parse(steadyBody), "502 body is not JSON")
        assert.doesNotMatch(steadyBody, /nginx\/\d/, "server_tokens off")

        // `stop` sent SIGTERM via init; server.ts closed fastify then the pool.
        // Only a line from this stop counts, not an earlier shutdown.
        const closed = (await apiLogLines()).filter(
          (l) => l.msg === "database pool closed" && l.time >= stoppedAt
        )
        assert.ok(closed.length > 0, "graceful SIGTERM shutdown")
      } finally {
        await compose(["start", "api"])
      }
      await waitForHealth(120_000)
    }
  )

  it(
    "API recreated on a new IP: nginx re-resolves it without restarting web",
    { timeout: 300_000 },
    async () => {
      const webId = await containerId("web")
      const webStartedAt = await docker([
        "inspect",
        "-f",
        "{{.State.StartedAt}}",
        webId,
      ])
      const oldIp = await containerIp(await containerId("api"))
      assert.ok(oldIp, "api has an IP")

      await compose(["stop", "api"])
      await compose(["rm", "-f", "api"])
      // Hold the freed address so the recreated api must get a different one.
      const holder = await docker([
        "run",
        "-d",
        "--rm",
        "--network",
        NETWORK,
        "--entrypoint",
        "sleep",
        "todos-web:prod",
        "300",
      ])
      try {
        await compose(["up", "-d", "--no-deps", "--wait", "api"])
        const newIp = await containerIp(await containerId("api"))
        assert.notEqual(newIp, oldIp, "api came back on a different IP")

        const deadline = Date.now() + 20_000
        let last
        let body
        for (;;) {
          try {
            const res = await get("/api/v1/health", {
              signal: AbortSignal.timeout(5_000),
            })
            last = res.status
            if (res.status === 200) {
              body = await res.text()
              break
            }
          } catch (err) {
            last = err.message
          }
          assert.ok(
            Date.now() < deadline,
            `health via nginx not 200 within 20 s after recreate (last: ${last})`
          )
          await sleep(500)
        }
        assert.deepEqual(JSON.parse(body), { status: "ok" })

        assert.equal(await containerId("web"), webId, "web not recreated")
        assert.equal(
          await docker(["inspect", "-f", "{{.State.StartedAt}}", webId]),
          webStartedAt,
          "web not restarted"
        )
      } finally {
        await docker(["rm", "-f", holder]).catch(() => undefined)
      }
    }
  )
})
