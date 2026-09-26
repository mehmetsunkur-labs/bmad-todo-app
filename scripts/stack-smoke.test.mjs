// HTTP-level smoke test of the production-like stack (Story 3.1), plus a
// boot check of the dev stack (Epic 3 retro).
//
// Runs `compose.yaml` on its own in an isolated Compose project
// (`todos-smoke`), so the developer's `todos` stack and its data are never
// touched, and drives it through nginx on the host's LAN address, as a phone
// on the same network would. Then boots the dev stack (`compose.yaml` +
// `compose.override.yaml` + `scripts/compose.smoke-dev.yaml`) in its own
// project (`todos-smoke-dev`), on loopback as the dev default, checks the API
// through Vite's proxy and Vite's DEV_ALLOWED_HOSTS host check, and checks
// that the README's dev refresh replaces stale node_modules. Needs
// Docker, so it is not part of `pnpm test`.
//
//   pnpm test:stack
//
// The web port is SMOKE_WEB_PORT from the shell environment if set (WEB_PORT
// is ignored, from the shell and from `.env`, since the dev stack usually
// holds it); otherwise 18080, or the next free port above it when 18080 is
// taken. The dev check always picks a free port from 18180.
//
// Images are built under their own tags (`todos-*:smoke`, `todos-*:smoke-dev`
// via TODOS_IMAGE_TAG), so the owner's `todos-*:prod` and `todos-*:dev` images
// are never rebuilt; the last test checks their image IDs are unchanged.
//
// Credentials come from the environment or `.env` (Compose reads it); the
// suite exits at once if neither provides them. Teardown always runs
// `down -v`, and only for the `todos-smoke` and `todos-smoke-dev` projects.

import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { request as httpRequest } from "node:http"
import { createServer } from "node:net"
import { networkInterfaces } from "node:os"
import { dirname, resolve } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { envPreflight } from "./lib/env-preflight.mjs"
import { pickSmokePort } from "./lib/smoke-port.mjs"

const run = promisify(execFile)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// Preflight: exit at once, before Compose fails on POSTGRES_*.
try {
  envPreflight(ROOT, process.env)
} catch (err) {
  console.error(
    `stack-smoke: ${err instanceof Error ? err.message : String(err)}`
  )
  process.exit(1)
}

const PROJECT = "todos-smoke"
const IMAGE_TAG = "smoke"
// SMOKE_WEB_PORT or a free port; never WEB_PORT (unit-tested in
// scripts/smoke-port.test.mjs).
const WEB_PORT = pickSmokePort(process.env, await firstFreePort(18080))
// WEB_PORT and TODOS_IMAGE_TAG from here win over the shell's and `.env`'s.
const ENV = { ...process.env, WEB_PORT, TODOS_IMAGE_TAG: IMAGE_TAG }

const DEV_PROJECT = "todos-smoke-dev"
const DEV_IMAGE_TAG = "smoke-dev"
/** The extra Vite host name the dev check allows (DEV_ALLOWED_HOSTS). */
const DEV_ALLOWED_HOST = "smoke.example"
const DEV_FILES = [
  "-f",
  "compose.yaml",
  "-f",
  "compose.override.yaml",
  "-f",
  "scripts/compose.smoke-dev.yaml",
]

/** The owner's image tags, which no harness may rebuild. */
const OWNER_IMAGES = [
  "todos-api:prod",
  "todos-web:prod",
  "todos-api:dev",
  "todos-web:dev",
]

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

/**
 * The first port from `start` that can be bound on all interfaces.
 * @param {number} start
 * @param {string[]} [skip] ports to pass over even if free
 * @returns {Promise<number>}
 */
async function firstFreePort(start, skip = []) {
  for (let port = start; port < start + 100; port++) {
    if (skip.includes(String(port))) continue
    const free = await new Promise((done) => {
      const server = createServer()
      server.once("error", () => done(false))
      server.listen(port, "0.0.0.0", () => server.close(() => done(true)))
    })
    if (free) return port
  }
  throw new Error(`no free port in ${start}-${start + 99}`)
}

/**
 * First non-loopback IPv4, preferring real NICs over container bridges.
 * @returns {string}
 */
function pickHostAddress() {
  /** @type {{ name: string, address: string }[]} */
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

/**
 * `docker compose` for one of the harness projects only.
 * @param {string[]} args
 * @param {{
 *   files?: string[],
 *   project?: string,
 *   env?: NodeJS.ProcessEnv,
 *   timeout?: number,
 * }} [options] `files` defaults to `compose.yaml` alone (the prod stack)
 * @returns {Promise<string>}
 */
async function compose(
  args,
  {
    files = ["-f", "compose.yaml"],
    project = PROJECT,
    env = ENV,
    timeout = 900_000,
  } = {}
) {
  if (!project.startsWith("todos-smoke")) {
    throw new Error(`refusing to touch Compose project "${project}"`)
  }
  const { stdout } = await run(
    "docker",
    ["compose", "-p", project, ...files, ...args],
    { cwd: ROOT, env, timeout, maxBuffer: 64 * 1024 * 1024 }
  )
  return stdout
}

/**
 * The environment with TODOS_IMAGE_TAG unset, for checking the defaults.
 * @returns {NodeJS.ProcessEnv}
 */
function envWithoutTag() {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...ENV }
  delete env.TODOS_IMAGE_TAG
  return env
}

/**
 * The image ID for each owner tag, or "(absent)".
 * @returns {Promise<Record<string, string>>}
 */
async function ownerImageIds() {
  /** @type {Record<string, string>} */
  const ids = {}
  for (const tag of OWNER_IMAGES) {
    ids[tag] = await docker(["image", "inspect", "-f", "{{.Id}}", tag]).catch(
      () => "(absent)"
    )
  }
  return ids
}

/**
 * Containers and volumes still labelled with `project`.
 * @param {string} project
 * @returns {Promise<string[]>}
 */
async function leftovers(project) {
  const label = `label=com.docker.compose.project=${project}`
  const outs = await Promise.all([
    docker(["ps", "-a", "--filter", label, "--format", "container {{.Names}}"]),
    docker(["volume", "ls", "--filter", label, "--format", "volume {{.Name}}"]),
    docker([
      "network",
      "ls",
      "--filter",
      label,
      "--format",
      "network {{.Name}}",
    ]),
  ])
  return outs.join("\n").split("\n").filter(Boolean)
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * fetch against the stack, always bounded by a timeout.
 * @param {string} path
 * @param {RequestInit} [init]
 */
function get(path, init = {}) {
  return fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...init,
  })
}

/**
 * @param {string[]} args
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<string>}
 */
async function docker(args, { timeout = 120_000 } = {}) {
  const { stdout } = await run("docker", args, {
    cwd: ROOT,
    env: ENV,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout.trim()
}

/**
 * The container id of a service in the smoke project.
 * @param {string} service
 */
async function containerId(service) {
  const id = (await compose(["ps", "-q", service])).trim()
  assert.ok(id, `${service} container exists`)
  return id
}

/**
 * A container's IPv4 on the smoke project network.
 * @param {string} id
 */
async function containerIp(id) {
  return docker([
    "inspect",
    "-f",
    `{{(index .NetworkSettings.Networks "${NETWORK}").IPAddress}}`,
    id,
  ])
}

/**
 * @param {Response} res
 * @param {string} label
 */
function assertNoCors(res, label) {
  const cors = [...res.headers.keys()].filter((k) =>
    k.toLowerCase().startsWith("access-control-")
  )
  assert.deepEqual(cors, [], `${label}: unexpected CORS headers`)
}

/**
 * A JSON API call through the proxy; fails on a non-JSON body.
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<{ status: number, json: any }>}
 */
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

/** @param {number} [timeoutMs] */
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

/**
 * The smoke API's JSON log lines.
 * @returns {Promise<Record<string, any>[]>}
 */
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

// Taken before anything is built, so the last test can compare.
const OWNER_IMAGE_IDS = await ownerImageIds()

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

  it("prod config: :smoke images, a published port on web only, AD-10 topology", async () => {
    const cfg = JSON.parse(await compose(["config", "--format", "json"]))
    assert.deepEqual(Object.keys(cfg.services).sort(), ["api", "db", "web"])
    assert.equal(cfg.services.api.image, `todos-api:${IMAGE_TAG}`)
    assert.equal(cfg.services.web.image, `todos-web:${IMAGE_TAG}`)
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
      await docker(["image", "inspect", `todos-api:${IMAGE_TAG}`])
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

  it("default config (TODOS_IMAGE_TAG unset): :prod, and :dev with target dev", async () => {
    const env = envWithoutTag()
    const prod = JSON.parse(
      await compose(["config", "--format", "json"], { env })
    )
    assert.equal(prod.services.api.image, "todos-api:prod")
    assert.equal(prod.services.web.image, "todos-web:prod")
    const dev = JSON.parse(
      await compose(["config", "--format", "json"], { files: [], env })
    )
    assert.equal(dev.services.api.image, "todos-api:dev")
    assert.equal(dev.services.web.image, "todos-web:dev")
    assert.equal(dev.services.api.build.target, "dev")
    assert.equal(dev.services.web.build.target, "dev")
    // Anonymous node_modules mounts, so `up --build -V` renews them.
    for (const name of ["api", "web"]) {
      const mounts = dev.services[name].volumes.filter(
        (/** @type {{ target: string }} */ v) =>
          v.target.endsWith("/node_modules")
      )
      assert.equal(mounts.length, 3, `${name} node_modules mounts`)
      for (const m of mounts) {
        assert.equal(m.type, "volume", `${name} ${m.target} type`)
        assert.equal(m.source, undefined, `${name} ${m.target} is anonymous`)
      }
    }
    assert.deepEqual(Object.keys(dev.volumes ?? {}), ["todos-data"])
  })

  it("dev web binds loopback unless DEV_WEB_HOST opts in; prod binds all interfaces", async () => {
    // Explicit empties win over the owner's `.env` (`:-` treats "" as unset).
    const base = { ...ENV, DEV_WEB_HOST: "", DEV_ALLOWED_HOSTS: "" }
    /**
     * The resolved `web` service (dev files by default).
     * @param {NodeJS.ProcessEnv} env
     * @param {string[]} [files]
     * @returns {Promise<any>}
     */
    const webOf = async (env, files = []) =>
      JSON.parse(await compose(["config", "--format", "json"], { files, env }))
        .services.web
    /**
     * Asserts `web` publishes only WEB_PORT -> 8080 and returns that port.
     * @param {any} web
     * @returns {{ host_ip?: string }}
     */
    const onlyPort = (web) => {
      assert.equal(web.ports.length, 1, "web publishes one port")
      assert.equal(String(web.ports[0].target), "8080")
      assert.equal(String(web.ports[0].published), WEB_PORT)
      return web.ports[0]
    }

    const devDefault = await webOf(base)
    assert.equal(onlyPort(devDefault).host_ip, "127.0.0.1", "dev default")
    assert.equal(devDefault.environment.DEV_ALLOWED_HOSTS, "")

    const devLan = await webOf({ ...base, DEV_WEB_HOST: "0.0.0.0" })
    const lanIp = onlyPort(devLan).host_ip
    assert.ok(!lanIp || lanIp === "0.0.0.0", `dev opt-in host_ip ${lanIp}`)

    const hosts = await webOf({
      ...base,
      DEV_ALLOWED_HOSTS: "a.example,b.example",
    })
    assert.equal(hosts.environment.DEV_ALLOWED_HOSTS, "a.example,b.example")

    // The opt-in never reaches the production-like stack.
    for (const env of [base, { ...base, DEV_WEB_HOST: "127.0.0.1" }]) {
      const prod = await webOf(env, ["-f", "compose.yaml"])
      assert.ok(!onlyPort(prod).host_ip, "prod web binds all interfaces")
      assert.equal(prod.environment?.DEV_ALLOWED_HOSTS, undefined)
    }
  })

  /** @type {string} */
  let indexHtml = ""
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
    assert.ok(
      list.json.todos.some((/** @type {{ id: string }} */ t) => t.id === id)
    )

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

  // nginx's client_max_body_size (apps/web/nginx.conf) and a margin around it.
  const NGINX_LIMIT = 32 * 1024
  const MARGIN = 64

  /**
   * POSTs a create body of exactly `bytes` bytes through the proxy.
   * @param {number} bytes
   */
  async function postBytes(bytes) {
    const id = randomUUID()
    const overhead = JSON.stringify({ id, description: "" }).length
    const body = JSON.stringify({
      id,
      description: "x".repeat(bytes - overhead),
    })
    assert.equal(Buffer.byteLength(body), bytes)
    const res = await get("/api/v1/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    return { res, text: await res.text() }
  }

  it("body just under nginx's 32 KiB limit: the API's JSON 413 VALIDATION_ERROR", async () => {
    // Over BODY_LIMIT_BYTES (16 KiB), so the API itself refuses it.
    const { res, text } = await postBytes(NGINX_LIMIT - MARGIN)
    assert.equal(res.status, 413)
    assert.match(res.headers.get("content-type") ?? "", /application\/json/)
    assert.equal(JSON.parse(text).error.code, "VALIDATION_ERROR")
  })

  it("body just over nginx's 32 KiB limit: nginx's own HTML 413", async () => {
    const { res, text } = await postBytes(NGINX_LIMIT + MARGIN)
    assert.equal(res.status, 413)
    assert.match(res.headers.get("content-type") ?? "", /text\/html/)
    assert.throws(() => JSON.parse(text), "gateway 413 body is not JSON")
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
        const found = afterRestart.json.todos.find(
          (/** @type {{ id: string }} */ t) => t.id === todo.id
        )
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
        `todos-web:${IMAGE_TAG}`,
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
            last = err instanceof Error ? err.message : String(err)
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

describe(
  "dev stack boots and serves the API through Vite",
  { concurrency: 1 },
  () => {
    /** @type {string} */
    let devPort
    /** @type {NodeJS.ProcessEnv} */
    let devEnv
    /**
     * @param {string[]} args
     * @param {number} [timeout]
     */
    const devCompose = (args, timeout) =>
      compose(args, {
        files: DEV_FILES,
        project: DEV_PROJECT,
        env: devEnv,
        timeout,
      })

    before(
      async () => {
        devPort = String(await firstFreePort(18180, [WEB_PORT]))
        devEnv = {
          ...ENV,
          WEB_PORT: devPort,
          TODOS_IMAGE_TAG: DEV_IMAGE_TAG,
          // Loopback (the dev default) and one extra Vite host, whatever the
          // owner's `.env` says.
          DEV_WEB_HOST: "",
          DEV_ALLOWED_HOSTS: DEV_ALLOWED_HOST,
        }
        // 120 s + 720 s, inside the hook's 900 s.
        await devCompose(["down", "-v"], 120_000).catch(() => undefined)
        await devCompose(["up", "-d", "--build", "--wait"], 720_000)
      },
      { timeout: 900_000 }
    )

    after(
      async () => {
        // Only ever the isolated dev-check project.
        await devCompose(["down", "-v"], 180_000)
      },
      { timeout: 200_000 }
    )

    /**
     * GETs `path` through Vite's proxy until it returns 200; returns the JSON.
     * @param {string} path
     * @returns {Promise<any>}
     */
    async function devGet200(path) {
      const url = `http://127.0.0.1:${devPort}${path}`
      const deadline = Date.now() + 180_000
      /** @type {string | undefined} */
      let last
      for (;;) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
          if (res.status === 200) return await res.json()
          last = `status ${res.status}`
        } catch (err) {
          last = err instanceof Error ? err.message : String(err)
        }
        assert.ok(
          Date.now() < deadline,
          `${url} not 200 within 180 s (last: ${last})`
        )
        await sleep(1_000)
      }
    }

    /**
     * The status of `GET /` from the dev web port with a given Host header
     * (fetch can't set Host, so plain node:http).
     * @param {string} host
     * @returns {Promise<number | undefined>}
     */
    function devStatusFor(host) {
      return new Promise((done, fail) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port: Number(devPort),
            path: "/",
            headers: { Host: `${host}:${devPort}` },
            timeout: 15_000,
          },
          (res) => {
            res.resume()
            done(res.statusCode)
          }
        )
        req.on("timeout", () => req.destroy(new Error("timed out")))
        req.on("error", fail)
        req.end()
      })
    }

    it("config: :smoke-dev images, only web publishes a port", async () => {
      const cfg = JSON.parse(await devCompose(["config", "--format", "json"]))
      assert.equal(cfg.services.api.image, `todos-api:${DEV_IMAGE_TAG}`)
      assert.equal(cfg.services.web.image, `todos-web:${DEV_IMAGE_TAG}`)
      assert.equal(cfg.services.api.build.target, "dev")
      for (const name of ["db", "api"]) {
        assert.equal(cfg.services[name].ports, undefined, `${name} ports`)
      }
      assert.equal(cfg.services.web.ports.length, 1)
      assert.equal(String(cfg.services.web.ports[0].published), devPort)
      assert.equal(cfg.services.web.ports[0].host_ip, "127.0.0.1")
      assert.equal(
        cfg.services.web.environment.DEV_ALLOWED_HOSTS,
        DEV_ALLOWED_HOST
      )
    })

    it(
      "Vite accepts the DEV_ALLOWED_HOSTS name and IPs, and rejects other host names",
      { timeout: 240_000 },
      async () => {
        await devGet200("/api/v1/health") // Vite is up.
        assert.equal(await devStatusFor(DEV_ALLOWED_HOST), 200, "allowed")
        // Opening the dev server by LAN IP (the README's phone path).
        assert.equal(await devStatusFor("192.0.2.10"), 200, "IPv4 literal")
        assert.equal(await devStatusFor("other.example"), 403, "other host")
      }
    )

    it(
      "GET /api/v1/health returns 200 through Vite's proxy",
      { timeout: 240_000 },
      async () => {
        assert.deepEqual(await devGet200("/api/v1/health"), { status: "ok" })
      }
    )

    it(
      "GET /api/v1/openapi.json returns 200 through Vite's proxy",
      { timeout: 240_000 },
      async () => {
        const doc = await devGet200("/api/v1/openapi.json")
        assert.match(String(doc.openapi), /^3\./)
      }
    )

    it(
      "the README refresh (rm -fsv api web, up --build -V) replaces stale node_modules",
      // The per-call timeouts below add up to about 1,055 s.
      { timeout: 1_200_000 },
      async () => {
        const marker = "/app/apps/api/node_modules/.stale-marker"
        const markerState = async () =>
          (
            await devCompose(
              [
                "exec",
                "-T",
                "api",
                "sh",
                "-c",
                `if test -e ${marker}; then echo stale; else echo fresh; fi`,
              ],
              30_000
            )
          ).trim()
        /** @param {string} service */
        const serviceId = async (service) =>
          (await devCompose(["ps", "-q", service], 30_000)).trim()

        await devCompose(
          ["exec", "-T", "api", "sh", "-c", `touch ${marker}`],
          30_000
        )
        assert.equal(await markerState(), "stale", "marker written")

        // The old api and web containers' anonymous node_modules volumes.
        const oldApiId = await serviceId("api")
        /** @type {string[]} */
        const oldVolumes = []
        for (const [service, id] of [
          ["api", oldApiId],
          ["web", await serviceId("web")],
        ]) {
          assert.ok(id, `${service} container exists`)
          const mounts = await docker(
            [
              "inspect",
              "-f",
              '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{.Destination}}{{"\\n"}}{{end}}{{end}}',
              String(id),
            ],
            { timeout: 30_000 }
          )
          const anonymous = mounts
            .split("\n")
            .map((line) => line.split(" "))
            .filter(
              ([name, dest]) =>
                /^[0-9a-f]{64}$/.test(name ?? "") &&
                (dest ?? "").endsWith("/node_modules")
            )
            .map(([name]) => String(name))
          assert.equal(anonymous.length, 3, `${service} anonymous node_modules`)
          oldVolumes.push(...anonymous)
        }

        // The README's refresh, exactly.
        await devCompose(["rm", "-fsv", "api", "web"], 120_000)
        await devCompose(["up", "-d", "--build", "-V", "--wait"], 480_000)

        const newApiId = await serviceId("api")
        assert.ok(newApiId, "api container exists")
        assert.notEqual(newApiId, oldApiId, "api container was recreated")
        assert.equal(await markerState(), "fresh", "node_modules renewed")
        assert.deepEqual(await devGet200("/api/v1/health"), { status: "ok" })

        const volumes = (
          await docker(["volume", "ls", "-q"], { timeout: 30_000 })
        ).split("\n")
        assert.deepEqual(
          oldVolumes.filter((v) => volumes.includes(v)),
          [],
          "the old containers' node_modules volumes are gone"
        )
      }
    )
  }
)

describe("harness isolation", () => {
  it("teardown left no todos-smoke or todos-smoke-dev resources behind", async () => {
    assert.deepEqual(
      [...(await leftovers(PROJECT)), ...(await leftovers(DEV_PROJECT))],
      []
    )
  })

  it("the owner's todos-*:prod and todos-*:dev image IDs are unchanged", async () => {
    assert.deepEqual(await ownerImageIds(), OWNER_IMAGE_IDS)
  })
})
