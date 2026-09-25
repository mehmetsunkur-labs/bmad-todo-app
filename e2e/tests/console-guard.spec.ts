import { openApp, test } from "./fixtures"

// Meta-tests: the auto `consoleGuard` fixture must fail these. `test.fail()`
// expects that failure, so the suite stays green only while the guard works.

test("a console.error on the page fails the test", async ({ page }) => {
  test.fail()
  await openApp(page)
  await page.evaluate(() => console.error("console guard check"))
})

test("an uncaught page error fails the test", async ({ page }) => {
  test.fail()
  await openApp(page)
  await page.evaluate(async () => {
    setTimeout(() => {
      throw new Error("console guard check")
    })
    await new Promise((r) => setTimeout(r, 100))
  })
})

test("a resource-load error not injected by the test fails it", async ({
  page,
  browserName,
}) => {
  // Firefox logs no console line for an HTTP error status.
  test.skip(browserName === "firefox", "no resource-load console line")
  test.fail()
  await openApp(page)
  // A real API 404, not a failNext interception.
  await page.evaluate(async () => {
    await fetch("/api/v1/no-such-route")
    await new Promise((r) => setTimeout(r, 100))
  })
})

test("an injected failure does not excuse a resource-load error on another URL", async ({
  page,
  browserName,
  failNext,
}) => {
  test.skip(browserName === "firefox", "no resource-load console line")
  test.fail()
  // The injected load failure is excused; the real 404 afterwards is not.
  const failure = await failNext("GET", "**/api/v1/todos")
  await page.goto("/")
  await failure.request
  await page.getByRole("button", { name: "Try again" }).waitFor()
  await page.evaluate(async () => {
    await fetch("/api/v1/no-such-route")
    await new Promise((r) => setTimeout(r, 100))
  })
})
