import type { APIRequestContext, Page } from "@playwright/test"
import { v7 as uuidv7 } from "uuid"

import {
  addInput,
  apiLogLines,
  deleteButton,
  editButton,
  editField,
  expect,
  nextResponse,
  openApp,
  percentile,
  rows,
  seedTodos,
  test,
} from "../fixtures"

// NFR-1 / SM-3 / NFR-2, asserted at the PRD numbers. Each measured value is
// also reported as a test annotation. Action latency is measured twice: with
// `reducedMotion: "reduce"` (the suite default) and with "no-preference",
// the default most users get, where a new row expands in and a deleted row
// fades then collapses.

// No Playwright trace here: its recorder snapshots the whole DOM (1,000
// rows) in the page's main thread around every action, which the in-page
// timings would then include (measured at 60–250 ms per action). It is
// harness overhead, not app work.
test.use({ trace: "off" })

const SEEDED = 1_000
const INTERACTIVE_MS = 2_000
const ACTION_P95_MS = 100
const API_P95_MS = 300
const SAMPLES = 20

const TODOS = "/api/v1/todos"
const ONE_TODO = /^\/api\/v1\/todos\/[^/]+$/

function report(type: string, value: number | string) {
  const description = typeof value === "number" ? value.toFixed(1) : value
  test.info().annotations.push({ type, description })
  console.log(`quality: ${type} = ${description}`)
}

/** Office broadband: 20 ms latency, 50 Mbps down, 10 Mbps up (CDP). */
async function throttleOfficeBroadband(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 20,
    downloadThroughput: (50 * 1_000_000) / 8,
    uploadThroughput: (10 * 1_000_000) / 8,
  })
}

test("interactive within 2,000 ms with 1,000 Todos on office broadband", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await seedTodos(request, SEEDED)

  // From the first script on: the first animation frame at which all rows
  // are shown and the Add input is enabled and rendered (`readyAt`), and
  // every long task (PerformanceObserver). Interactive is the later of
  // `readyAt` and the end of the last long task before a 500 ms window with
  // no long task, so a long task right after the ready frame still counts.
  await page.addInitScript((expected: number) => {
    const w = window as unknown as {
      __readyAt?: number
      __longTasks: { start: number; end: number }[]
    }
    w.__longTasks = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        w.__longTasks.push({
          start: e.startTime,
          end: e.startTime + e.duration,
        })
      }
    }).observe({ type: "longtask", buffered: true })
    const check = () => {
      const input = document.querySelector<HTMLInputElement>(
        'form input[type="text"]'
      )
      const ready =
        document.querySelectorAll("li[data-todo-id]").length === expected &&
        !!input &&
        !input.disabled &&
        input.getClientRects().length > 0
      if (ready) w.__readyAt = performance.now()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }, SEEDED)
  await throttleOfficeBroadband(page)

  await page.goto("/")
  const { interactiveAt, readyAt, longTasks } = await page
    .waitForFunction(
      (quietMs: number) => {
        const w = window as unknown as {
          __readyAt?: number
          __longTasks: { start: number; end: number }[]
        }
        if (w.__readyAt === undefined) return false
        let at = w.__readyAt
        for (const t of [...w.__longTasks].sort((a, b) => a.start - b.start)) {
          if (t.start >= at + quietMs) break
          at = Math.max(at, t.end)
        }
        if (performance.now() < at + quietMs) return false
        return {
          interactiveAt: at,
          readyAt: w.__readyAt,
          longTasks: w.__longTasks.length,
        }
      },
      500,
      { timeout: 30_000 }
    )
    .then(
      (handle) =>
        handle.jsonValue() as Promise<{
          interactiveAt: number
          readyAt: number
          longTasks: number
        }>
    )
  report("browser", `Chromium ${page.context().browser()?.version() ?? "?"}`)
  report("interactive ready frame ms", readyAt)
  report("interactive long tasks seen", String(longTasks))

  await expect(rows(page)).toHaveCount(SEEDED)
  await addInput(page).focus()
  await expect(addInput(page)).toBeFocused()

  report("interactive-ms (1,000 Todos, office broadband)", interactiveAt)
  expect(interactiveAt).toBeLessThanOrEqual(INTERACTIVE_MS)
})

type Kind = "add" | "toggle" | "edit-save" | "delete"

/**
 * Arms one in-page measurement: from the next triggering input event
 * (`keydown` Enter, or `pointerdown`) to the first animation frame after
 * the DOM reflects the change. Read it with `latency(page)`.
 */
async function arm(
  page: Page,
  kind: Kind,
  trigger: "keydown" | "pointerdown",
  arg: { id?: string; text?: string; checked?: boolean }
) {
  await page.evaluate(
    ({ kind, trigger, arg }) => {
      const reflected = (): boolean => {
        const li = arg.id
          ? document.querySelector(`li[data-todo-id="${arg.id}"]`)
          : null
        switch (kind) {
          case "add":
            return (
              document.querySelector("li[data-todo-id] p")?.textContent ===
              arg.text
            )
          case "toggle":
            return (
              li
                ?.querySelector('[role="checkbox"]')
                ?.getAttribute("aria-checked") === String(arg.checked)
            )
          case "edit-save":
            return li?.querySelector("p")?.textContent === arg.text
          case "delete":
            // Reduced motion: the row is gone. Default motion: it is marked
            // exiting (`inert`) and its exit motion starts.
            return !li || li.hasAttribute("inert")
        }
      }
      const w = window as unknown as { __latency?: Promise<number> }
      w.__latency = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${kind}: not reflected within 10 s`)),
          10_000
        )
        const onInput = (event: Event) => {
          if (trigger === "keydown" && (event as KeyboardEvent).key !== "Enter")
            return
          document.removeEventListener(trigger, onInput, true)
          const t0 = event.timeStamp
          const done = () => {
            clearTimeout(timer)
            requestAnimationFrame(() => resolve(performance.now() - t0))
          }
          const observer = new MutationObserver(() => {
            if (!reflected()) return
            observer.disconnect()
            done()
          })
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          })
        }
        // Capture on document: runs before React's root listener.
        document.addEventListener(trigger, onInput, true)
      })
    },
    { kind, trigger, arg }
  )
}

async function latency(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __latency: Promise<number> }).__latency
  )
}

async function rowIds(page: Page, count: number): Promise<string[]> {
  const ids = await rows(page).evaluateAll(
    (lis, n) =>
      lis.slice(0, n).map((li) => li.getAttribute("data-todo-id") ?? ""),
    count
  )
  expect(ids).toHaveLength(count)
  return ids
}

for (const motion of ["reduce", "no-preference"] as const) {
  test.describe(`reducedMotion: ${motion}`, () => {
    test.use({ reducedMotion: motion })

    test("each action is reflected within 100 ms (p95) with 1,000 Todos", async ({
      page,
      request,
    }) => {
      test.setTimeout(300_000)
      const seeded = await seedTodos(request, SEEDED)
      await openApp(page)
      await expect(rows(page)).toHaveCount(SEEDED)
      const byId = new Map(seeded.map((t) => [t.id, t.description]))
      const samples: Record<Kind, number[]> = {
        add: [],
        toggle: [],
        "edit-save": [],
        delete: [],
      }

      for (let i = 0; i < SAMPLES; i++) {
        const text = `Latency add ${i + 1}`
        await addInput(page).fill(text)
        await arm(page, "add", "keydown", { text })
        const created = nextResponse(page, "POST", /^\/api\/v1\/todos$/)
        await addInput(page).press("Enter")
        samples.add.push(await latency(page))
        expect((await created).status()).toBe(201)
      }

      // Toggle, edit and delete Todos below the added ones.
      const ids = await rowIds(page, SAMPLES * 4)
      const seededIds = ids.filter((id) => byId.has(id))

      for (const id of seededIds.slice(0, SAMPLES)) {
        const box = page.locator(`li[data-todo-id="${id}"] [role="checkbox"]`)
        await arm(page, "toggle", "pointerdown", { id, checked: true })
        const saved = nextResponse(page, "PATCH", ONE_TODO)
        await box.click()
        samples.toggle.push(await latency(page))
        expect((await saved).status()).toBe(200)
      }

      for (const id of seededIds.slice(SAMPLES, SAMPLES * 2)) {
        const description = byId.get(id)!
        const text = `${description} (edited)`
        await editButton(page, description).click()
        const field = editField(page, description)
        await field.fill(text)
        await arm(page, "edit-save", "keydown", { id, text })
        const saved = nextResponse(page, "PATCH", ONE_TODO)
        await field.press("Enter")
        samples["edit-save"].push(await latency(page))
        expect((await saved).status()).toBe(200)
      }

      for (const id of seededIds.slice(SAMPLES * 2, SAMPLES * 3)) {
        await arm(page, "delete", "pointerdown", { id })
        const deleted = nextResponse(page, "DELETE", ONE_TODO)
        await deleteButton(page, byId.get(id)!).click()
        samples.delete.push(await latency(page))
        expect((await deleted).status()).toBe(204)
      }

      const failures: string[] = []
      for (const kind of Object.keys(samples) as Kind[]) {
        expect(samples[kind]).toHaveLength(SAMPLES)
        const p95 = percentile(samples[kind], 95)
        report(`action-p95-ms ${kind} (${motion})`, p95)
        report(
          `action-samples-ms ${kind} (${motion})`,
          samples[kind].map((v) => v.toFixed(1)).join(", ")
        )
        if (p95 > ACTION_P95_MS)
          failures.push(`${kind} p95 ${p95.toFixed(1)} ms`)
      }
      expect(
        failures,
        `action p95 over ${ACTION_P95_MS} ms (${motion})`
      ).toEqual([])
    })
  })
}

/** The 200 scripted requests: 50 rounds of create, list, patch, delete. */
async function scriptedRequests(request: APIRequestContext) {
  const sent = { GET: 0, POST: 0, PATCH: 0, DELETE: 0 }
  for (let i = 0; i < 50; i++) {
    const id = uuidv7()
    const created = await request.post(TODOS, {
      data: { id, description: `API p95 ${i + 1}` },
    })
    expect(created.status()).toBe(201)
    sent.POST++
    const listed = await request.get(TODOS)
    expect(listed.status()).toBe(200)
    sent.GET++
    const patched = await request.patch(`${TODOS}/${id}`, {
      data: { completed: true },
    })
    expect(patched.status()).toBe(200)
    sent.PATCH++
    const deleted = await request.delete(`${TODOS}/${id}`)
    expect(deleted.status()).toBe(204)
    sent.DELETE++
  }
  return sent
}

test("API p95 at the server is 300 ms or less (200 requests through nginx)", async ({
  request,
}) => {
  test.setTimeout(180_000)
  // The list GETs return 1,000 Todos: the realistic large list.
  await seedTodos(request, SEEDED)
  // Seeding lines are logged just after their responses: let them land
  // before the window opens.
  await new Promise((r) => setTimeout(r, 500))

  const since = Date.now()
  const sent = await scriptedRequests(request)
  const until = Date.now()

  const isTodoRoute = (route: string | null) =>
    route === TODOS || route === `${TODOS}/:id`
  let lines: Awaited<ReturnType<typeof apiLogLines>> = []
  const deadline = Date.now() + 30_000
  for (;;) {
    lines = (await apiLogLines()).filter(
      (l) => isTodoRoute(l.route) && l.time >= since && l.time <= until + 1_000
    )
    if (lines.length >= 200 || Date.now() > deadline) break
    await new Promise((r) => setTimeout(r, 500))
  }

  // Exactly the scripted requests, by method.
  expect(lines).toHaveLength(200)
  const byMethod = { GET: 0, POST: 0, PATCH: 0, DELETE: 0 }
  for (const l of lines) byMethod[l.method as keyof typeof byMethod]++
  expect(byMethod).toEqual(sent)

  const times = lines.map((l) => l.responseTime)
  const p95 = percentile(times, 95)
  report("api-p95-ms (server responseTime, 200 requests)", p95)
  report(
    "api-p95-ms by method",
    (["GET", "POST", "PATCH", "DELETE"] as const)
      .map(
        (m) =>
          `${m} ${percentile(
            lines.filter((l) => l.method === m).map((l) => l.responseTime),
            95
          ).toFixed(1)}`
      )
      .join(", ")
  )
  expect(p95).toBeLessThanOrEqual(API_P95_MS)
})
