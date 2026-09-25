import {
  addButton,
  addInput,
  checkbox,
  deleteButton,
  editButton,
  editField,
  expect,
  listTodos,
  nextResponse,
  openApp,
  row,
  rows,
  test,
} from "./fixtures"

const ONE_TODO = /^\/api\/v1\/todos\/[^/]+$/

test("Keyboard only: add, toggle, edit and delete; focus never on <body>", async ({
  page,
  request,
}) => {
  await openApp(page)

  /** Presses `key`, then checks focus did not fall to `<body>`. */
  const press = async (key: string) => {
    await page.keyboard.press(key)
    const onBody = await page.evaluate(
      () => !document.activeElement || document.activeElement === document.body
    )
    expect(onBody, `focus on <body> after ${key}`).toBe(false)
  }

  // Desktop autofocuses the input; touch devices start from the page.
  if (!(await addInput(page).evaluate((el) => el === document.activeElement))) {
    await press("Tab")
  }
  await expect(addInput(page)).toBeFocused()

  // Add.
  let saved = nextResponse(page, "POST", /^\/api\/v1\/todos$/)
  await page.keyboard.type("Keyboard todo")
  await press("Enter")
  expect((await saved).status()).toBe(201)
  await expect(row(page, "Keyboard todo")).toBeVisible()
  await expect(addInput(page)).toBeFocused()
  await expect(addInput(page)).toHaveValue("")

  // Tab order: input, Add, then the row's checkbox, Edit and Delete.
  await press("Tab")
  await expect(addButton(page)).toBeFocused()
  await press("Tab")
  await expect(checkbox(page, "Keyboard todo")).toBeFocused()

  // Toggle with Space.
  saved = nextResponse(page, "PATCH", ONE_TODO)
  await press("Space")
  await expect(checkbox(page, "Keyboard todo")).toBeChecked()
  expect((await saved).status()).toBe(200)
  await expect(checkbox(page, "Keyboard todo")).toBeFocused()

  // Edit with Enter, save with Enter.
  await press("Tab")
  await expect(editButton(page, "Keyboard todo")).toBeFocused()
  await press("Enter")
  await expect(editField(page, "Keyboard todo")).toBeFocused()
  saved = nextResponse(page, "PATCH", ONE_TODO)
  // The field opens with its text selected: typing replaces it.
  await page.keyboard.type("Keyboard todo, edited")
  await press("Enter")
  expect((await saved).status()).toBe(200)
  await expect(row(page, "Keyboard todo, edited")).toBeVisible()
  await expect(editButton(page, "Keyboard todo, edited")).toBeFocused()

  // Edit again, cancel with Escape.
  await press("Enter")
  await expect(editField(page, "Keyboard todo, edited")).toBeFocused()
  await page.keyboard.type("Not saved")
  await press("Escape")
  await expect(editField(page, "Keyboard todo, edited")).toHaveCount(0)
  await expect(editButton(page, "Keyboard todo, edited")).toBeFocused()

  // Delete with Enter: the only row, so focus goes to the input.
  await press("Tab")
  await expect(deleteButton(page, "Keyboard todo, edited")).toBeFocused()
  saved = nextResponse(page, "DELETE", ONE_TODO)
  await press("Enter")
  expect((await saved).status()).toBe(204)
  await expect(rows(page)).toHaveCount(0)
  await expect(addInput(page)).toBeFocused()

  expect(await listTodos(request)).toEqual([])
})
