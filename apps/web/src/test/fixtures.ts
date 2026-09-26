import { jsonResponse, makeTodo } from "./render"

/** Three Todos, listed newest first as Top, Middle, Bottom. */
export const top = makeTodo({
  id: "00000000-0000-7000-8000-000000000003",
  description: "Top",
  createdAt: "2026-09-24T11:00:00.000Z",
})
export const middle = makeTodo({
  id: "00000000-0000-7000-8000-000000000002",
  description: "Middle",
  createdAt: "2026-09-24T10:00:00.000Z",
})
export const bottom = makeTodo({
  id: "00000000-0000-7000-8000-000000000001",
  description: "Bottom",
  createdAt: "2026-09-24T09:00:00.000Z",
})

export const serverError = () =>
  jsonResponse({ error: { code: "INTERNAL", message: "db exploded" } }, 500)
export const notFound = () =>
  jsonResponse({ error: { code: "NOT_FOUND", message: "Todo not found" } }, 404)
