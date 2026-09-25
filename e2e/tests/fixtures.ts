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

/** Deletes every Todo through the API. */
export async function deleteAllTodos(request: APIRequestContext) {
  for (const todo of await listTodos(request)) {
    const res = await request.delete(`${TODOS}/${todo.id}`)
    expect([204, 404]).toContain(res.status())
  }
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

/** Opens the app and waits until the list has loaded. */
export async function openApp(page: Page) {
  await page.goto("/")
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expect(addInput(page)).toBeEnabled()
}
