import { execFile } from "node:child_process"
import { promisify } from "node:util"

import AxeBuilder from "@axe-core/playwright"
import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test"
import { v7 as uuidv7 } from "uuid"

export { expect }

const TODOS = "/api/v1/todos"

/** The Todo DTO as the API returns it. */
export interface Todo {
  id: string
  description: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

type Method = "GET" | "POST" | "PATCH" | "DELETE"

export interface FailNextOptions {
  /** HTTP status of the AD-5 `INTERNAL` envelope (default 500). */
  status?: number
  /** Abort the request (a network failure) instead of fulfilling it. */
  abort?: boolean
  /** The failure is sent only once this settles. */
  hold?: Promise<unknown>
}

export interface InjectedFailure {
  /** Resolves with the intercepted request once it arrives. */
  readonly request: Promise<Request>
  /** The intercepted request's JSON body (after `request` resolves). */
  body(): unknown
}

/** One API request the page sent: method, path and JSON body. */
export interface SentRequest {
  method: string
  path: string
  body: unknown
}

interface Fixtures {
  consoleGuard: void
  resetTodos: void
  failNext: (
    method: Method,
    urlGlob: string,
    options?: FailNextOptions
  ) => Promise<InjectedFailure>
  /** Every `/api/` request the page sent, in order (intercepted or not). */
  sent: SentRequest[]
}

function jsonBody(request: Request): unknown {
  const raw = request.postData()
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** A browser resource-load error line (not app code). */
const RESOURCE_ERROR = /^Failed to load resource|net::ERR_/

/** Per URL: how many resource-load console lines injected failures may still excuse. */
type ExemptUrls = Map<string, number>

export const test = base.extend<Fixtures & { exemptUrls: ExemptUrls }>({
  // Playwright requires a destructuring pattern for the fixtures argument.
  // eslint-disable-next-line no-empty-pattern
  exemptUrls: async ({}, use) => {
    await use(new Map())
  },

  consoleGuard: [
    async ({ page, exemptUrls }, use, testInfo) => {
      const errors: string[] = []
      page.on("console", (msg) => {
        if (msg.type() !== "error") return
        const text = msg.text()
        const url = msg.location().url
        // Each injected failure excuses at most one matching line.
        const match = RESOURCE_ERROR.test(text)
          ? [...exemptUrls].find(
              ([u, left]) => left > 0 && (u === url || text.includes(u))
            )
          : undefined
        if (match) exemptUrls.set(match[0], match[1] - 1)
        const exempt = !!match
        if (!exempt) errors.push(`console.error: ${text} (${url})`)
      })
      page.on("pageerror", (err) => {
        errors.push(`pageerror: ${err.stack ?? err.message}`)
      })
      await use()
      if (errors.length > 0) {
        await testInfo.attach("console-errors", {
          body: errors.join("\n"),
          contentType: "text/plain",
        })
      }
      expect(errors, "the page logged console errors").toEqual([])
    },
    { auto: true },
  ],

  resetTodos: [
    async ({ request }, use) => {
      await deleteAllTodos(request)
      await use()
    },
    { auto: true },
  ],

  sent: async ({ page }, use) => {
    const sent: SentRequest[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (!url.pathname.startsWith("/api/")) return
      sent.push({
        method: request.method(),
        path: url.pathname,
        body: jsonBody(request),
      })
    })
    await use(sent)
  },

  failNext: async ({ page, exemptUrls }, use) => {
    await use(async (method, urlGlob, options = {}) => {
      let captured: Request | undefined
      let resolveRequest!: (request: Request) => void
      const request = new Promise<Request>((r) => (resolveRequest = r))
      let used = false

      const handler = async (
        route: Parameters<Parameters<Page["route"]>[1]>[0]
      ) => {
        const req = route.request()
        if (used || req.method() !== method) {
          await route.fallback()
          return
        }
        used = true
        captured = req
        exemptUrls.set(req.url(), (exemptUrls.get(req.url()) ?? 0) + 1)
        resolveRequest(req)
        if (options.hold) await options.hold
        if (options.abort) {
          await route.abort("failed")
        } else {
          await route.fulfill({
            status: options.status ?? 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "INTERNAL", message: "Injected failure" },
            }),
          })
        }
        // One-shot (`used` already lets later requests through): unrouting
        // only once this route is handled, since an unroute mid-handler
        // would hand it on to the network.
        await page.unroute(urlGlob, handler)
      }

      await page.route(urlGlob, handler)
      return {
        request,
        body: () => (captured ? jsonBody(captured) : undefined),
      }
    })
  },
})

/** API requests sent at once by the bulk helpers. */
const BATCH = 20

/** Runs `work` over `items`, at most `BATCH` at a time, in order of batches. */
async function inBatches<T, R>(
  items: readonly T[],
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += BATCH) {
    out.push(...(await Promise.all(items.slice(i, i + BATCH).map(work))))
  }
  return out
}

/** Deletes every Todo through the API. */
export async function deleteAllTodos(request: APIRequestContext) {
  // Batched: a quality test can leave 1,000 Todos behind.
  await inBatches(await listTodos(request), async (todo) => {
    const res = await request.delete(`${TODOS}/${todo.id}`)
    expect([204, 404]).toContain(res.status())
  })
}

export async function listTodos(request: APIRequestContext): Promise<Todo[]> {
  const res = await request.get(TODOS)
  expect(res.status()).toBe(200)
  return ((await res.json()) as { todos: Todo[] }).todos
}

/** Creates a Todo through the API (a real success, not a mock). */
export async function seedTodo(
  request: APIRequestContext,
  description: string
): Promise<Todo> {
  const res = await request.post(TODOS, {
    // v7: ids sort in creation order, so same-millisecond seeds keep it.
    data: { id: uuidv7(), description },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as Todo
}

/**
 * Creates `n` Todos through the API ("Seeded 0001" … ), a few requests at a
 * time. Returns them in creation-request order.
 */
export async function seedTodos(
  request: APIRequestContext,
  n: number,
  describe: (i: number) => string = (i) =>
    `Seeded ${String(i + 1).padStart(4, "0")}`
): Promise<Todo[]> {
  const inputs = Array.from({ length: n }, (_, i) => ({
    id: uuidv7(),
    description: describe(i),
  }))
  return inBatches(inputs, async (data) => {
    const res = await request.post(TODOS, { data })
    expect(res.status()).toBe(201)
    return (await res.json()) as Todo
  })
}

/** The fixed WCAG 2.1 A/AA tag set every axe scan uses (never narrowed). */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const

/**
 * Runs axe on the whole page with `AXE_TAGS` (no rule disabled, nothing
 * excluded), attaches any violations to the report, and returns them.
 */
export async function axeViolations(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags([...AXE_TAGS])
    .analyze()
  if (results.violations.length > 0) {
    await test.info().attach(`axe-violations-${name}`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    })
  }
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.map((n) => n.target.join(" ")),
  }))
}

/** One API request log line (AD-11). */
export interface ApiLogLine {
  time: number
  method: string
  route: string | null
  statusCode: number
  responseTime: number
}

const execFileP = promisify(execFile)

/**
 * The isolated e2e stack's API log lines (`docker compose logs api`), parsed
 * from its JSON output. Only ever the `todos-e2e` project.
 */
export async function apiLogLines(): Promise<ApiLogLine[]> {
  const project = process.env.E2E_COMPOSE_PROJECT
  const webPort = process.env.E2E_WEB_PORT
  if (!project || !webPort) {
    throw new Error(
      "E2E_COMPOSE_PROJECT and E2E_WEB_PORT must be set: run via pnpm test:e2e"
    )
  }
  if (!project.startsWith("todos-e2e")) {
    throw new Error(`refusing to read Compose project "${project}"`)
  }
  const { stdout } = await execFileP(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "compose.yaml",
      "logs",
      "--no-log-prefix",
      "api",
    ],
    {
      cwd: process.env.E2E_REPO_ROOT ?? "..",
      // Unset, Compose would fall back to `.env`'s WEB_PORT.
      env: { ...process.env, WEB_PORT: webPort },
      timeout: 60_000,
      maxBuffer: 256 * 1024 * 1024,
    }
  )
  const lines: ApiLogLine[] = []
  for (const raw of stdout.split("\n")) {
    if (!raw.startsWith("{")) continue
    try {
      const line = JSON.parse(raw) as Partial<ApiLogLine>
      if (typeof line.responseTime === "number") lines.push(line as ApiLogLine)
    } catch {
      // Not a JSON log line.
    }
  }
  return lines
}

/** Nearest-rank percentile (`p` in 0..100) of `values`. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of no values")
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(rank, 1)) - 1]!
}

export function addInput(page: Page): Locator {
  return page.getByRole("textbox", { name: "New todo" })
}

export function addButton(page: Page): Locator {
  return page.getByRole("button", { name: "Add", exact: true })
}

/** Adds a Todo through the UI and waits for the API to confirm it. */
export async function addTodo(page: Page, text: string): Promise<Todo> {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && new URL(r.url()).pathname === TODOS
  )
  await addInput(page).fill(text)
  await addInput(page).press("Enter")
  const res = await response
  expect(res.status()).toBe(201)
  await expect(row(page, text)).toBeVisible()
  return (await res.json()) as Todo
}

/** The row whose checkbox is named `description`. */
export function row(page: Page, description: string): Locator {
  return page
    .locator("li[data-todo-id]")
    .filter({ has: checkbox(page, description) })
}

export function checkbox(page: Page, description: string): Locator {
  return page.getByRole("checkbox", { name: description, exact: true })
}

export function editButton(page: Page, description: string): Locator {
  return page.getByRole("button", {
    name: `Edit todo: ${description}`,
    exact: true,
  })
}

export function deleteButton(page: Page, description: string): Locator {
  return page.getByRole("button", {
    name: `Delete todo: ${description}`,
    exact: true,
  })
}

export function editField(page: Page, description: string): Locator {
  return page.getByRole("textbox", {
    name: `Edit todo: ${description}`,
    exact: true,
  })
}

/** Every rendered Todo row, in display order. */
export function rows(page: Page): Locator {
  return page.locator("li[data-todo-id]")
}

/** Every toast on the page. */
export function toasts(page: Page): Locator {
  return page.locator("li[data-sonner-toast]")
}

/** Waits for the next response to `method` on a path, and returns it. */
export function nextResponse(page: Page, method: Method, path: RegExp) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === method && path.test(new URL(r.url()).pathname)
  )
}

/** The toast quote: as-is up to 40 code points, else the first 40 and "…". */
export function quote(description: string): string {
  const chars = Array.from(description)
  return chars.length <= 40 ? description : `${chars.slice(0, 40).join("")}…`
}

/**
 * Holds the list GET (the Loading state) until the returned `release` is
 * called; `release` also removes the route. Always release (try/finally).
 */
export async function holdListLoad(page: Page): Promise<() => Promise<void>> {
  let release!: () => void
  const released = new Promise<void>((r) => (release = r))
  const handler = async (
    route: Parameters<Parameters<Page["route"]>[1]>[0]
  ) => {
    if (route.request().method() !== "GET") return route.fallback()
    await released
    await route.fallback()
  }
  await page.route("**/api/v1/todos", handler)
  return async () => {
    release()
    await page.unroute("**/api/v1/todos", handler)
  }
}

/**
 * A failed add while other text is typed: one persistent toast with Retry
 * (the Add row keeps the new text). Waits until the toast has settled.
 */
export async function showRetryToast(
  page: Page,
  failNext: Fixtures["failNext"],
  description: string
) {
  let release!: () => void
  const hold = new Promise<void>((r) => (release = r))
  const failure = await failNext("POST", "**/api/v1/todos", { hold })
  await addInput(page).fill(description)
  await addInput(page).press("Enter")
  await failure.request
  await addInput(page).fill("Something else")
  release()
  await expect(toasts(page)).toHaveCount(1)
  const retry = toasts(page).getByRole("button", { name: "Retry" })
  await expect(retry).toBeVisible()
  // Sonner's entrance transition: settled before anything is measured.
  await toasts(page)
    .first()
    .evaluate((el) =>
      Promise.all(
        el.getAnimations({ subtree: true }).map((a) => a.finished)
      ).then(() => undefined)
    )
  return retry
}

/** Opens the app and waits until the list has loaded. */
export async function openApp(page: Page) {
  await page.goto("/")
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expect(addInput(page)).toBeEnabled()
}
