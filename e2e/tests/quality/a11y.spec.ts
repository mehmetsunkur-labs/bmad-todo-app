import {
  axeViolations,
  checkbox,
  editButton,
  editField,
  expect,
  holdListLoad,
  nextResponse,
  openApp,
  seedTodo,
  showRetryToast,
  test,
} from "../fixtures"

// WCAG 2.1 AA (NFR-4): axe with the fixed tag set, in light and dark mode,
// over every List State plus an open inline edit and a Retry toast. Zero violations is reached
// only by fixing the app, never by narrowing the scan.

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test("Loading", async ({ page }) => {
      const release = await holdListLoad(page)
      try {
        await page.goto("/")
        await expect(page.getByTestId("todo-skeleton").first()).toBeVisible()
        expect(await axeViolations(page, `loading-${colorScheme}`)).toEqual([])
      } finally {
        await release()
      }
    })

    test("Failure toast with Retry", async ({ page, request, failNext }) => {
      await seedTodo(request, "Buy milk")
      await openApp(page)
      await showRetryToast(page, failNext, "Walk the dog")
      expect(await axeViolations(page, `retry-toast-${colorScheme}`)).toEqual(
        []
      )
    })

    test("Empty", async ({ page }) => {
      await openApp(page)
      await expect(page.getByText("Nothing here yet.")).toBeVisible()
      expect(await axeViolations(page, `empty-${colorScheme}`)).toEqual([])
    })

    test("Populated with Active and Completed Todos", async ({
      page,
      request,
    }) => {
      await seedTodo(request, "Buy milk")
      await seedTodo(request, "Call the plumber")
      await seedTodo(request, "Water the plants")
      await openApp(page)
      const saved = nextResponse(page, "PATCH", /^\/api\/v1\/todos\/[^/]+$/)
      await checkbox(page, "Call the plumber").click()
      expect((await saved).status()).toBe(200)
      await expect(checkbox(page, "Call the plumber")).toBeChecked()
      // Move focus out of the rows so every Created At shows its resting text.
      await page.locator("body").click({ position: { x: 1, y: 1 } })
      expect(await axeViolations(page, `populated-${colorScheme}`)).toEqual([])
    })

    test("Load error", async ({ page, failNext }) => {
      await failNext("GET", "**/api/v1/todos")
      await page.goto("/")
      await expect(
        page.getByRole("button", { name: "Try again" })
      ).toBeVisible()
      expect(await axeViolations(page, `load-error-${colorScheme}`)).toEqual([])
    })

    test("Inline edit", async ({ page, request }) => {
      await seedTodo(request, "Buy milk")
      await seedTodo(request, "Water the plants")
      await openApp(page)
      await editButton(page, "Water the plants").click()
      await expect(editField(page, "Water the plants")).toBeFocused()
      expect(await axeViolations(page, `inline-edit-${colorScheme}`)).toEqual(
        []
      )
    })
  })
}
