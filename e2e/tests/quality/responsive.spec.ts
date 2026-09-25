import type { APIRequestContext, Locator, Page } from "@playwright/test"

import {
  addButton,
  addInput,
  addTodo,
  checkbox,
  deleteButton,
  editButton,
  editField,
  expect,
  holdListLoad,
  nextResponse,
  openApp,
  row,
  rows,
  seedTodo,
  showRetryToast,
  test,
  toasts,
  type SentRequest,
} from "../fixtures"

// FR-12: usable at 320 px width and at 200% zoom with no horizontal scroll,
// and every control has an effective 44×44 touch target.

const ONE_TODO = /^\/api\/v1\/todos\/[^/]+$/
/** 500 characters and no spaces: must wrap, never scroll. */
const LONG = "x".repeat(500)

async function expectNoHorizontalScroll(page: Page, state: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(
    scrollWidth,
    `${state}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`
  ).toBeLessThanOrEqual(clientWidth)
}

/**
 * Every action (add, edit-save, toggle, delete, Retry, Try again), checking
 * for horizontal scroll after each one.
 */
async function everyAction(
  page: Page,
  request: APIRequestContext,
  failNext: Parameters<typeof showRetryToast>[1]
) {
  await seedTodo(request, LONG)
  await openApp(page)
  await expectNoHorizontalScroll(page, "Populated")

  await addTodo(page, "Buy milk")
  await expectNoHorizontalScroll(page, "after add")

  await editButton(page, "Buy milk").click()
  await editField(page, "Buy milk").fill("Buy oat milk")
  await expectNoHorizontalScroll(page, "Inline edit")
  let saved = nextResponse(page, "PATCH", ONE_TODO)
  await editField(page, "Buy milk").press("Enter")
  expect((await saved).status()).toBe(200)
  await expect(row(page, "Buy oat milk")).toBeVisible()

  saved = nextResponse(page, "PATCH", ONE_TODO)
  await checkbox(page, "Buy oat milk").click()
  expect((await saved).status()).toBe(200)
  await expect(checkbox(page, "Buy oat milk")).toBeChecked()
  await expectNoHorizontalScroll(page, "after toggle")

  const deleted = nextResponse(page, "DELETE", ONE_TODO)
  await deleteButton(page, "Buy oat milk").click()
  expect((await deleted).status()).toBe(204)
  await expect(row(page, "Buy oat milk")).toHaveCount(0)
  await expectNoHorizontalScroll(page, "after delete")

  // A failed add while other text is typed: the toast and its Retry.
  const retry = await showRetryToast(page, failNext, "Walk the dog")
  await expectNoHorizontalScroll(page, "Toast")
  const created = nextResponse(page, "POST", /^\/api\/v1\/todos$/)
  await retry.click()
  expect((await created).status()).toBe(201)
  await expect(row(page, "Walk the dog")).toBeVisible()

  // Load error, then Try again.
  await failNext("GET", "**/api/v1/todos")
  await page.reload()
  await expectNoHorizontalScroll(page, "Load error")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(row(page, "Walk the dog")).toBeVisible()
  await expectNoHorizontalScroll(page, "after Try again")
}

test.describe("320 px width", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("no horizontal scroll in any List State; a long Description wraps", async ({
    page,
    request,
    failNext,
  }) => {
    // Loading (with its skeleton rows).
    const release = await holdListLoad(page)
    try {
      await page.goto("/")
      await expect(page.getByTestId("todo-skeleton").first()).toBeVisible()
      await expectNoHorizontalScroll(page, "Loading")
    } finally {
      await release()
    }

    // Empty.
    await expect(page.getByText("Nothing here yet.")).toBeVisible()
    await expectNoHorizontalScroll(page, "Empty")

    // Populated, with a Completed Todo and a 500-character unbroken one.
    await seedTodo(request, "Buy milk")
    await seedTodo(request, LONG)
    await openApp(page)
    const saved = nextResponse(page, "PATCH", ONE_TODO)
    await checkbox(page, "Buy milk").click()
    expect((await saved).status()).toBe(200)
    await expectNoHorizontalScroll(page, "Populated")

    const description = row(page, LONG).locator("p").first()
    const wrap = await description.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      lines: Math.round(
        el.getBoundingClientRect().height /
          parseFloat(getComputedStyle(el).lineHeight)
      ),
    }))
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth)
    expect(wrap.lines, "the long Description wraps").toBeGreaterThan(1)

    // Inline edit of the long Description.
    await editButton(page, LONG).click()
    await expect(editField(page, LONG)).toBeFocused()
    await expectNoHorizontalScroll(page, "Inline edit")
    await editField(page, LONG).press("Escape")

    // A failure toast.
    await failNext("POST", "**/api/v1/todos")
    await addInput(page).fill("Walk the dog")
    await addInput(page).press("Enter")
    await expect(toasts(page)).toHaveCount(1)
    await expectNoHorizontalScroll(page, "Toast")

    // Load error.
    await failNext("GET", "**/api/v1/todos")
    await page.reload()
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
    await expectNoHorizontalScroll(page, "Load error")
  })

  test("every action works with no horizontal scroll", async ({
    page,
    request,
    failNext,
  }) => {
    await everyAction(page, request, failNext)
  })
})

test.describe("200% zoom", () => {
  // 1280 px at 200%: 640 CSS px wide, rendered at twice the pixel density.
  test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 })

  test("every action works with no horizontal scroll", async ({
    page,
    request,
    failNext,
  }) => {
    await everyAction(page, request, failNext)
  })
})

/**
 * The points of a 44×44 square centred on `control` that do not hit it (or
 * a descendant) under `document.elementFromPoint`: a 7×7 grid from edge to
 * edge, 1 px inside.
 */
async function hitAreaMisses(control: Locator): Promise<string[]> {
  await control.scrollIntoViewIfNeeded()
  return control.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    // 1 px inside the square's edges: Chromium rounds hit-test points to
    // whole pixels, so x.5 on an edge would test the neighbouring pixel.
    const half = 22 - 1
    const misses: string[] = []
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 6; j++) {
        const x = cx - half + (i * 2 * half) / 6
        const y = cy - half + (j * 2 * half) / 6
        const hit = document.elementFromPoint(x, y)
        if (!hit || !el.contains(hit)) {
          const what = hit
            ? `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(" ")[0]}` : ""}`
            : "nothing"
          const r = hit?.getBoundingClientRect()
          misses.push(
            `(${x.toFixed(1)}, ${y.toFixed(1)}) hit ${what}` +
              (r ? ` [${r.top.toFixed(1)}..${r.bottom.toFixed(1)}]` : "") +
              ` control [${box.top.toFixed(1)}..${box.bottom.toFixed(1)}]`
          )
        }
      }
    }
    return misses
  })
}

async function expectTouchTarget(control: Locator, name: string) {
  await expect(control).toBeVisible()
  // The toast slides in: sample once it has settled.
  await expect
    .poll(() => hitAreaMisses(control), {
      message: `${name}: every point of its 44×44 square hits it`,
      timeout: 5_000,
    })
    .toEqual([])
}

function patches(sent: SentRequest[]) {
  return sent.filter((r) => r.method === "PATCH")
}

/** Taps the middle of the edit field's left padding, mid-height. */
async function tapLeftPadding(page: Page, field: Locator) {
  const box = await field.boundingBox()
  expect(box).not.toBeNull()
  const { borderLeft, paddingLeft } = await field.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      borderLeft: parseFloat(style.borderLeftWidth),
      paddingLeft: parseFloat(style.paddingLeft),
    }
  })
  const x = box!.x + borderLeft + paddingLeft / 2
  const y = box!.y + box!.height / 2
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? "nothing",
    { x, y }
  )
  expect(hit, "the field's left padding hits the field").toBe("TEXTAREA")
  await page.touchscreen.tap(x, y)
}

test.describe("touch targets at 320 px", () => {
  // A phone: touch, no hover, so the Row actions use their always-visible
  // touch layout.
  test.use({
    viewport: { width: 320, height: 640 },
    hasTouch: true,
    isMobile: true,
  })

  test("input, Add, checkbox, Edit, Delete, Retry and Try again are 44×44", async ({
    page,
    request,
    failNext,
    sent,
  }) => {
    await seedTodo(request, "Buy milk")
    await seedTodo(request, "Water the plants")
    await openApp(page)
    for (const actions of await page.getByTestId("row-actions").all()) {
      await expect(actions).toHaveCSS("opacity", "1")
    }

    await expectTouchTarget(addInput(page), "input")
    await expectTouchTarget(addButton(page), "Add")
    for (const description of ["Water the plants", "Buy milk"]) {
      await expectTouchTarget(checkbox(page, description), "checkbox")
      await expectTouchTarget(editButton(page, description), "Edit")
      await expectTouchTarget(deleteButton(page, description), "Delete")
    }

    // With a row's edit open, its checkbox keeps the full 44×44, and a tap
    // on the field's left padding edits (no toggle).
    await editButton(page, "Buy milk").tap()
    const field = editField(page, "Buy milk")
    await expect(field).toBeFocused()
    await expectTouchTarget(checkbox(page, "Buy milk"), "checkbox (editing)")
    await tapLeftPadding(page, field)
    await expect(field).toBeVisible()
    await expect(field).toBeFocused()
    expect(patches(sent), "a tap on the field's padding toggled").toEqual([])
    await field.press("Escape")

    const retry = await showRetryToast(page, failNext, "Walk the dog")
    await expectTouchTarget(retry, "Retry")

    await failNext("GET", "**/api/v1/todos")
    await page.reload()
    await expectTouchTarget(
      page.getByRole("button", { name: "Try again" }),
      "Try again"
    )
    await expect(rows(page)).toHaveCount(0)
  })
})
