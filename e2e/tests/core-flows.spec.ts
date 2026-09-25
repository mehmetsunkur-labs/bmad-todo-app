import {
  addButton,
  addInput,
  addTodo,
  checkbox,
  deleteButton,
  editButton,
  editField,
  expect,
  nextResponse,
  openApp,
  row,
  rows,
  seedTodo,
  test,
} from "./fixtures"

const ONE_TODO = /^\/api\/v1\/todos\/[^/]+$/

test.describe("core flows", () => {
  test("Add with Enter and with the Add button; rows survive a reload", async ({
    page,
    isMobile,
  }) => {
    await openApp(page)

    await addTodo(page, "Buy milk")
    await expect(addInput(page)).toHaveValue("")
    if (!isMobile) await expect(addInput(page)).toBeFocused()

    const response = nextResponse(page, "POST", /^\/api\/v1\/todos$/)
    await addInput(page).fill("Call the plumber")
    await addButton(page).click()
    expect((await response).status()).toBe(201)
    await expect(row(page, "Call the plumber")).toBeVisible()
    await expect(addInput(page)).toHaveValue("")
    if (!isMobile) await expect(addInput(page)).toBeFocused()

    await page.reload()
    await expect(row(page, "Buy milk")).toBeVisible()
    await expect(row(page, "Call the plumber")).toBeVisible()
    // Newest first.
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(0)).toContainText("Call the plumber")
  })

  test("Edit: Enter saves and returns focus to Edit", async ({
    page,
    request,
  }) => {
    await seedTodo(request, "Water the plants")
    await openApp(page)

    await editButton(page, "Water the plants").click()
    const field = editField(page, "Water the plants")
    await expect(field).toBeFocused()
    await expect(field).toHaveValue("Water the plants")

    const saved = nextResponse(page, "PATCH", ONE_TODO)
    await field.fill("Water the ferns")
    await field.press("Enter")
    expect((await saved).status()).toBe(200)

    await expect(row(page, "Water the ferns")).toBeVisible()
    await expect(editButton(page, "Water the ferns")).toBeFocused()

    await page.reload()
    await expect(row(page, "Water the ferns")).toBeVisible()
    await expect(row(page, "Water the plants")).toHaveCount(0)
  })

  test("Edit: Escape saves nothing and returns focus to Edit", async ({
    page,
    request,
    sent,
  }) => {
    await seedTodo(request, "Book flights")
    await openApp(page)

    await editButton(page, "Book flights").click()
    const field = editField(page, "Book flights")
    await field.fill("Book trains")
    await field.press("Escape")

    await expect(field).toHaveCount(0)
    await expect(row(page, "Book flights")).toBeVisible()
    await expect(editButton(page, "Book flights")).toBeFocused()
    expect(sent.filter((r) => r.method === "PATCH")).toEqual([])

    await page.reload()
    await expect(row(page, "Book flights")).toBeVisible()
  })

  test("Edit: blur saves", async ({ page, request }) => {
    await seedTodo(request, "Renew passport")
    await openApp(page)

    await editButton(page, "Renew passport").click()
    const field = editField(page, "Renew passport")
    await field.fill("Renew passport and ID")

    const saved = nextResponse(page, "PATCH", ONE_TODO)
    await page.getByRole("heading", { name: "Todos" }).click()
    expect((await saved).status()).toBe(200)
    await expect(row(page, "Renew passport and ID")).toBeVisible()

    await page.reload()
    await expect(row(page, "Renew passport and ID")).toBeVisible()
  })

  test("Toggle both ways; each state survives a reload", async ({
    page,
    request,
  }) => {
    await seedTodo(request, "Pay rent")
    await openApp(page)
    const box = checkbox(page, "Pay rent")
    const text = row(page, "Pay rent").locator("p").first()

    await expect(box).not.toBeChecked()
    let saved = nextResponse(page, "PATCH", ONE_TODO)
    await box.click()
    await expect(box).toBeChecked()
    await expect(text).toHaveCSS("text-decoration-line", "line-through")
    expect((await saved).status()).toBe(200)

    await page.reload()
    await expect(box).toBeChecked()
    await expect(text).toHaveCSS("text-decoration-line", "line-through")

    saved = nextResponse(page, "PATCH", ONE_TODO)
    await box.click()
    await expect(box).not.toBeChecked()
    await expect(text).toHaveCSS("text-decoration-line", "none")
    expect((await saved).status()).toBe(200)

    await page.reload()
    await expect(box).not.toBeChecked()
    await expect(text).toHaveCSS("text-decoration-line", "none")
  })

  test("Delete moves focus to the next row, then the previous, then the input", async ({
    page,
    request,
  }) => {
    // Seeded oldest first; the list shows newest first: C, B, A.
    await seedTodo(request, "Todo A")
    await seedTodo(request, "Todo B")
    await seedTodo(request, "Todo C")
    await openApp(page)
    await expect(rows(page)).toHaveCount(3)
    const bodyFocused = () =>
      page.evaluate(() => document.activeElement === document.body)

    // The middle row: focus goes to the next row (A).
    let deleted = nextResponse(page, "DELETE", ONE_TODO)
    await deleteButton(page, "Todo B").click()
    await expect(checkbox(page, "Todo A")).toBeFocused()
    expect(await bodyFocused()).toBe(false)
    expect((await deleted).status()).toBe(204)
    await expect(rows(page)).toHaveCount(2)

    // The last row: focus goes to the previous row (C).
    deleted = nextResponse(page, "DELETE", ONE_TODO)
    await deleteButton(page, "Todo A").click()
    await expect(checkbox(page, "Todo C")).toBeFocused()
    expect(await bodyFocused()).toBe(false)
    expect((await deleted).status()).toBe(204)
    await expect(rows(page)).toHaveCount(1)

    // The only row: focus goes to the Add input.
    deleted = nextResponse(page, "DELETE", ONE_TODO)
    await deleteButton(page, "Todo C").click()
    await expect(addInput(page)).toBeFocused()
    expect(await bodyFocused()).toBe(false)
    expect((await deleted).status()).toBe(204)
    await expect(rows(page)).toHaveCount(0)

    await page.reload()
    await expect(page.getByText("Nothing here yet.")).toBeVisible()
  })

  test("Empty state", async ({ page }) => {
    await openApp(page)
    await expect(
      page.getByText("Nothing here yet.", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("Add your first todo above.", { exact: true })
    ).toBeVisible()
    await expect(rows(page)).toHaveCount(0)
  })

  test("Load error, then Try again loads the list", async ({
    page,
    request,
    failNext,
  }) => {
    await seedTodo(request, "Survives a load error")
    const failure = await failNext("GET", "**/api/v1/todos")
    await page.goto("/")
    await failure.request

    const alert = page.getByRole("alert")
    await expect(alert).toContainText("Couldn't load your todos.")
    const tryAgain = page.getByRole("button", { name: "Try again" })
    await expect(tryAgain).toBeVisible()
    await expect(page.getByText("Nothing here yet.")).toHaveCount(0)

    const loaded = nextResponse(page, "GET", /^\/api\/v1\/todos$/)
    await tryAgain.click()
    expect((await loaded).status()).toBe(200)
    await expect(row(page, "Survives a load error")).toBeVisible()
    await expect(alert).toHaveCount(0)
  })
})
