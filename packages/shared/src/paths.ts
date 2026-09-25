/** Every API route lives under this prefix; no proxy ever strips it. */
export const API_PREFIX = "/api/v1"

export const HEALTH_PATH = `${API_PREFIX}/health`

export const TODOS_PATH = `${API_PREFIX}/todos`

/** A single Todo: the `PATCH` and `DELETE` route path (`:id` is a UUID). */
export const TODO_PATH = `${TODOS_PATH}/:id`
