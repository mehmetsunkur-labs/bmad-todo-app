import { execFile } from "node:child_process"
import { promisify } from "node:util"

import {
  addTodo,
  checkbox,
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

const run = promisify(execFile)

const PROJECT = process.env.E2E_COMPOSE_PROJECT
const WEB_PORT = process.env.E2E_WEB_PORT
const ONE_TODO = /^\/api\/v1\/todos\/[^/]+$/

/** `docker compose` for the isolated e2e project only. */
async function compose(args: string[]) {
  // Unset, Compose would fall back to `.env`'s WEB_PORT (the user's stack).
  if (!PROJECT || !WEB_PORT) {
    throw new Error(
      "E2E_COMPOSE_PROJECT and E2E_WEB_PORT must be set: run via pnpm test:e2e"
    )
  }
  if (!PROJECT.startsWith("todos-e2e")) {
    throw new Error(`refusing to restart Compose project "${PROJECT}"`)
  }
  await run(
    "docker",
    ["compose", "-p", PROJECT, "-f", "compose.yaml", ...args],
    {
      cwd: process.env.E2E_REPO_ROOT ?? "..",
      env: { ...process.env, WEB_PORT },
      timeout: 300_000,
      maxBuffer: 64 * 1024 * 1024,
    }
  )
}

test("Todos survive docker compose down then up, with unchanged timestamps", async ({
  page,
  request,
}) => {
  // Above down (300 s) + up (300 s) + the health poll (120 s), plus the UI steps.
  test.setTimeout(900_000)
  await openApp(page)

  await addTodo(page, "Durable: first")
  await addTodo(page, "Durable: second")
  await addTodo(page, "Durable: third")

  // Toggle one and edit another, so updatedAt differs from createdAt.
  let saved = nextResponse(page, "PATCH", ONE_TODO)
  await checkbox(page, "Durable: second").click()
  expect((await saved).status()).toBe(200)
  await editButton(page, "Durable: third").click()
  saved = nextResponse(page, "PATCH", ONE_TODO)
  await editField(page, "Durable: third").fill("Durable: third, edited")
  await editField(page, "Durable: third").press("Enter")
  expect((await saved).status()).toBe(200)

  const before = await listTodos(request)
  expect(before).toHaveLength(3)
  for (const description of ["Durable: second", "Durable: third, edited"]) {
    const todo = before.find((t) => t.description === description)
    expect(todo, description).toBeDefined()
    expect(todo?.updatedAt, `${description}: updatedAt moved`).not.toBe(
      todo?.createdAt
    )
  }

  // Never `-v`: the data volume must survive.
  await compose(["down"])
  await compose(["up", "-d", "--wait"])
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get("/api/v1/health", { timeout: 5_000 })
          ).status()
        } catch {
          return 0
        }
      },
      { timeout: 120_000, intervals: [500] }
    )
    .toBe(200)

  await page.reload()
  await expect(rows(page)).toHaveCount(3)
  await expect(row(page, "Durable: first")).toBeVisible()
  await expect(checkbox(page, "Durable: second")).toBeChecked()
  await expect(row(page, "Durable: third, edited")).toBeVisible()

  const after = await listTodos(request)
  expect(after).toEqual(before)
})
