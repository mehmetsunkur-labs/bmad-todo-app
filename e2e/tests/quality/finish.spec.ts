import type { Locator, Page } from "@playwright/test"

import {
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
  seedTodo,
  test,
  toasts,
} from "../fixtures"

// NFR-12: no layout jumps, and a finished product (tab title, favicon,
// header, no placeholder text) in every List State.

const ONE_TODO = /^\/api\/v1\/todos\/[^/]+$/

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox()
  expect(b, "element has a box").not.toBeNull()
  return b!
}

function header(page: Page) {
  return page.getByRole("heading", { level: 1, name: "Todos" })
}

function addRow(page: Page) {
  return page.locator("form").filter({ has: addInput(page) })
}

for (const width of [1280, 360, 320]) {
  test.describe(`no layout jump at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test("add, complete and remove (down to Empty) keep the layout still", async ({
      page,
    }) => {
      await openApp(page)
      await expect(page.getByText("Nothing here yet.")).toBeVisible()
      const headerAt = await box(header(page))
      const addRowAt = await box(addRow(page))
      const expectStill = async (step: string) => {
        expect(await box(header(page)), `${step}: header`).toEqual(headerAt)
        expect(await box(addRow(page)), `${step}: Add row`).toEqual(addRowAt)
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(scrollWidth, `${step}: horizontal scroll`).toBeLessThanOrEqual(
          clientWidth
        )
      }

      await addTodo(page, "Buy milk")
      await expectStill("first add (Empty → Populated)")
      await addTodo(page, "Water the plants")
      await expectStill("second add")

      // Toggling keeps the row's size and place.
      const toggled = row(page, "Buy milk")
      const before = await box(toggled)
      const saved = nextResponse(page, "PATCH", ONE_TODO)
      await checkbox(page, "Buy milk").click()
      expect((await saved).status()).toBe(200)
      await expect(checkbox(page, "Buy milk")).toBeChecked()
      expect(await box(toggled), "toggled row").toEqual(before)
      await expectStill("toggle")

      for (const description of ["Water the plants", "Buy milk"]) {
        const deleted = nextResponse(page, "DELETE", ONE_TODO)
        await deleteButton(page, description).click()
        expect((await deleted).status()).toBe(204)
        await expect(row(page, description)).toHaveCount(0)
      }
      await expect(page.getByText("Nothing here yet.")).toBeVisible()
      await expectStill("last remove (→ Empty)")
    })
  })
}

/**
 * Lorem ipsum, TODO/FIXME/TBD markers, stub copy, or a rendering leak
 * (`undefined`, `null`, `NaN`, `Invalid Date`, `[object Object]`).
 */
const PLACEHOLDER_TEXT = [
  /lorem/i,
  /ipsum/i,
  /\b(TODO|FIXME|TBD|XXX)\b/,
  /\bstub\b/i,
  /\bundefined\b/,
  /\bnull\b/,
  /\bNaN\b/,
  /\bInvalid Date\b/,
  /\[object Object\]/,
]
/** The one designed input placeholder (not "placeholder text"). */
const DESIGNED_PLACEHOLDER = "Add a todo…"

async function expectFinished(page: Page, state: string) {
  await expect(page, `${state}: tab title`).toHaveTitle("Todos")
  await expect(header(page), `${state}: header`).toBeVisible()

  const icon = page.locator('link[rel="icon"]')
  await expect(icon).toHaveCount(1)
  const href = await icon.evaluate((el) => (el as HTMLLinkElement).href)
  const res = await page.request.get(href)
  expect(res.status(), `${state}: favicon status`).toBe(200)
  expect(res.headers()["content-type"], `${state}: favicon type`).toContain(
    "image/svg+xml"
  )
  expect(await res.text()).toContain("<svg")

  const text = await page.locator("body").innerText()
  for (const pattern of PLACEHOLDER_TEXT) {
    expect(text, `${state}: no placeholder text (${pattern})`).not.toMatch(
      pattern
    )
  }
  const placeholders = await page
    .locator("[placeholder]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("placeholder")))
  expect(placeholders, `${state}: only the designed placeholder`).toEqual([
    DESIGNED_PLACEHOLDER,
  ])
}

test("every List State is finished: title, favicon, header, no placeholder text", async ({
  page,
  request,
  failNext,
}) => {
  // Loading.
  const release = await holdListLoad(page)
  try {
    await page.goto("/")
    await expect(page.getByTestId("todo-skeleton").first()).toBeVisible()
    await expectFinished(page, "Loading")
  } finally {
    await release()
  }

  // Empty.
  await expect(page.getByText("Nothing here yet.")).toBeVisible()
  await expectFinished(page, "Empty")

  // Populated, with a Completed Todo.
  await seedTodo(request, "Buy milk")
  await seedTodo(request, "Water the plants")
  await openApp(page)
  const saved = nextResponse(page, "PATCH", ONE_TODO)
  await checkbox(page, "Buy milk").click()
  expect((await saved).status()).toBe(200)
  await expectFinished(page, "Populated")

  // Inline edit.
  await editButton(page, "Water the plants").click()
  await expect(editField(page, "Water the plants")).toBeFocused()
  await expectFinished(page, "Inline edit")
  await editField(page, "Water the plants").press("Escape")

  // A failure toast.
  await failNext("POST", "**/api/v1/todos")
  await addInput(page).fill("Walk the dog")
  await addInput(page).press("Enter")
  await expect(toasts(page)).toHaveCount(1)
  await expectFinished(page, "Toast")

  // Load error.
  await failNext("GET", "**/api/v1/todos")
  await page.reload()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  await expectFinished(page, "Load error")
})
