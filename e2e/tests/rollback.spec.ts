import {
  addInput,
  checkbox,
  deleteButton,
  editButton,
  editField,
  expect,
  listTodos,
  nextResponse,
  openApp,
  quote,
  row,
  rows,
  seedTodo,
  test,
  toasts,
} from "./fixtures"

const TODOS_GLOB = "**/api/v1/todos"
const ONE_TODO_GLOB = "**/api/v1/todos/*"

interface CreateBody {
  id: string
  description: string
}

/** Exactly one toast, with exactly this copy. */
async function expectOneToast(
  page: Parameters<typeof toasts>[0],
  copy: string
) {
  await expect(toasts(page)).toHaveCount(1)
  await expect(toasts(page).getByRole("status")).toHaveText(copy, {
    useInnerText: true,
  })
}

/** The rows show exactly these Descriptions, in this order. */
async function expectOrder(page: Parameters<typeof rows>[0], order: string[]) {
  await expect(rows(page)).toHaveCount(order.length)
  for (const [i, description] of order.entries()) {
    await expect(
      rows(page)
        .nth(i)
        .getByRole("checkbox", { name: description, exact: true })
    ).toBeVisible()
  }
}

test.describe("failure rollback", () => {
  test("Add fails: the row goes, the text is back, and resubmitting reuses the id", async ({
    page,
    request,
    failNext,
    sent,
  }) => {
    await openApp(page)
    const failure = await failNext("POST", TODOS_GLOB)

    await addInput(page).fill("Buy bread")
    await addInput(page).press("Enter")
    await failure.request

    await expect(rows(page)).toHaveCount(0)
    await expect(addInput(page)).toHaveValue("Buy bread")
    await expectOneToast(
      page,
      "Couldn't add that todo. Your text is back in the box."
    )
    const failed = failure.body() as CreateBody
    expect(failed.description).toBe("Buy bread")

    // Resubmitting the unchanged text sends the same id, to the real API.
    const created = nextResponse(page, "POST", /^\/api\/v1\/todos$/)
    await addInput(page).press("Enter")
    expect((await created).status()).toBe(201)
    await expect(row(page, "Buy bread")).toBeVisible()
    const posts = sent.filter((r) => r.method === "POST")
    expect(posts).toHaveLength(2)
    expect(posts[1]?.body).toEqual(failed)

    const stored = await listTodos(request)
    expect(stored.map((t) => t.id)).toEqual([failed.id])
  })

  test("Add fails while other text is typed: one Retry toast resends the same id and text", async ({
    page,
    request,
    failNext,
    sent,
  }) => {
    await openApp(page)
    // Long, with astral characters: the quote counts code points.
    const description =
      "🦷🦷 Book the dentist for a check-up on Tuesday morning"
    let release!: () => void
    const hold = new Promise<void>((r) => (release = r))
    const failure = await failNext("POST", TODOS_GLOB, { hold })

    await addInput(page).fill(description)
    await addInput(page).press("Enter")
    await failure.request
    await expect(row(page, description)).toBeVisible()

    await addInput(page).fill("Something else")
    release()

    const copy = `Couldn't add “${quote(description)}”.`
    expect(copy).toBe(
      "Couldn't add “🦷🦷 Book the dentist for a check-up on Tu…”."
    )
    await expectOneToast(page, copy)
    await expect(rows(page)).toHaveCount(0)
    await expect(addInput(page)).toHaveValue("Something else")

    const failed = failure.body() as CreateBody
    expect(failed.description).toBe(description)

    const created = nextResponse(page, "POST", /^\/api\/v1\/todos$/)
    await toasts(page).getByRole("button", { name: "Retry" }).click()
    expect((await created).status()).toBe(201)
    await expect(row(page, description)).toBeVisible()
    await expect(addInput(page)).toHaveValue("Something else")

    const posts = sent.filter((r) => r.method === "POST")
    expect(posts).toHaveLength(2)
    expect(posts[1]?.body).toEqual(failed)
    const stored = await listTodos(request)
    expect(stored.map((t) => [t.id, t.description])).toEqual([
      [failed.id, description],
    ])
  })

  for (const mode of ["500", "abort"] as const) {
    test(`Toggle fails (${mode}): the checkbox reverts`, async ({
      page,
      request,
      failNext,
    }) => {
      await seedTodo(request, "Pay rent")
      await openApp(page)
      const failure = await failNext("PATCH", ONE_TODO_GLOB, {
        abort: mode === "abort",
      })

      await checkbox(page, "Pay rent").click()
      await failure.request
      expect(failure.body()).toEqual({ completed: true })

      await expect(checkbox(page, "Pay rent")).not.toBeChecked()
      await expectOneToast(page, "Couldn't update that todo. Please try again.")
      const [stored] = await listTodos(request)
      expect(stored?.completed).toBe(false)
    })
  }

  test("Edit fails: the confirmed Description stays and the field reopens with the attempt", async ({
    page,
    request,
    failNext,
  }) => {
    await seedTodo(request, "Water the plants")
    await openApp(page)
    const failure = await failNext("PATCH", ONE_TODO_GLOB)

    await editButton(page, "Water the plants").click()
    await editField(page, "Water the plants").fill("Water the ferns")
    await editField(page, "Water the plants").press("Enter")
    await failure.request
    expect(failure.body()).toEqual({ description: "Water the ferns" })

    await expectOneToast(page, "Couldn't save your edit. Please try again.")
    // The row is back on its confirmed Description, with the field reopened.
    await expect(row(page, "Water the plants")).toHaveCount(1)
    await expect(row(page, "Water the ferns")).toHaveCount(0)
    await expect(editField(page, "Water the plants")).toHaveValue(
      "Water the ferns"
    )
    const [stored] = await listTodos(request)
    expect(stored?.description).toBe("Water the plants")

    // Escape closes the reopened field on the confirmed Description.
    await editField(page, "Water the plants").press("Escape")
    await expect(
      row(page, "Water the plants").getByText("Water the plants", {
        exact: true,
      })
    ).toBeVisible()
  })

  test("Delete fails: the row reappears in place", async ({
    page,
    request,
    failNext,
  }) => {
    await seedTodo(request, "Todo A")
    await seedTodo(request, "Todo B")
    await seedTodo(request, "Todo C")
    await openApp(page)
    const order = ["Todo C", "Todo B", "Todo A"]
    await expectOrder(page, order)

    const failure = await failNext("DELETE", ONE_TODO_GLOB)
    await deleteButton(page, "Todo B").click()
    await failure.request

    await expectOneToast(page, "Couldn't delete that todo. Please try again.")
    await expectOrder(page, order)
    expect(await listTodos(request)).toHaveLength(3)
  })
})
