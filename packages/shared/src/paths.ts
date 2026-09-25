/** Every API route lives under this prefix; no proxy ever strips it. */
export const API_PREFIX = "/api/v1"

export const HEALTH_PATH = `${API_PREFIX}/health`

export const TODOS_PATH = `${API_PREFIX}/todos`

/** A single Todo: the `PATCH` and `DELETE` route path (`:id` is a UUID). */
export const TODO_PATH = `${TODOS_PATH}/:id`

/** The concrete path of one Todo (`TODO_PATH` with its `id` filled in). */
export function todoPath(id: string): string {
  return `${TODOS_PATH}/${encodeURIComponent(id)}`
}

/** The generated OpenAPI document (served live; snapshot in docs/api). */
export const OPENAPI_PATH = `${API_PREFIX}/openapi.json`
