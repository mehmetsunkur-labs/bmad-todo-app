import {
  ErrorEnvelopeSchema,
  REQUEST_TIMEOUT_MS,
  TODOS_PATH,
  todoPath,
  TodoListResponseSchema,
  TodoSchema,
  type CreateTodoRequest,
  type ErrorCode,
  type ErrorDetail,
  type Todo,
  type TodoListResponse,
  type UpdateTodoRequest,
} from "@todos/shared"

/**
 * How a request failed (AD-5): the envelope's `code`, `INTERNAL` for a body
 * that isn't the envelope (or a success body that fails its schema), or the
 * client-only `NETWORK` for a fetch rejection or timeout.
 */
export type HttpErrorKind = ErrorCode | "NETWORK"

export class HttpError extends Error {
  readonly kind: HttpErrorKind
  readonly status?: number
  readonly details?: ErrorDetail[]

  constructor(
    kind: HttpErrorKind,
    options: { status?: number; details?: ErrorDetail[]; cause?: unknown } = {}
  ) {
    // The server's `message` is never kept: the UI must not render it.
    super(`Request failed: ${kind}`, { cause: options.cause })
    this.name = "HttpError"
    this.kind = kind
    this.status = options.status
    this.details = options.details
  }
}

/**
 * Whether `error` is an `HttpError` of kind `NOT_FOUND`. Each caller
 * decides what that means (the PATCH failure mapping, the delete-as-success
 * rule, the edit failure copy); only this check is shared.
 */
export function isNotFound(error: unknown): error is HttpError {
  return error instanceof HttpError && error.kind === "NOT_FOUND"
}

/** The part of a shared Zod schema that `request` needs. */
interface ResponseSchema<T> {
  safeParse(
    input: unknown
  ): { success: true; data: T } | { success: false; error: unknown }
}

interface RequestOptions<S> {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  /**
   * Schema for the success body, or `null` when no body is expected: any
   * 2xx (`204` included) then resolves `null` without parsing. A `204` on a
   * call with a schema is `INTERNAL` (a body was expected).
   */
  schema: S
  /** An extra abort signal (for example TanStack Query's), combined with the timeout. */
  signal?: AbortSignal
}

/** An abort or timeout (DOMException or Error; realms differ in tests). */
function isAbort(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === "AbortError" || name === "TimeoutError"
}

/**
 * The only `fetch` caller in the web app (AD-6). Paths are relative
 * (`/api/v1/...`, same origin), every request times out after
 * `REQUEST_TIMEOUT_MS`, and every response is validated with the shared
 * schemas before it is returned.
 */
export function request<T>(
  path: string,
  options: RequestOptions<ResponseSchema<T>>
): Promise<T>
export function request(
  path: string,
  options: RequestOptions<null>
): Promise<null>
export async function request<T>(
  path: string,
  {
    method = "GET",
    body,
    schema,
    signal,
  }: RequestOptions<ResponseSchema<T> | null>
): Promise<T | null> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const hasBody = body !== undefined

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: combined,
    })
  } catch (cause) {
    // A caller cancellation is not a failure to classify; let it through.
    if (signal?.aborted) throw cause
    throw new HttpError("NETWORK", { cause })
  }

  // A `204` is never parsed: `null` when no body is expected, else INTERNAL.
  if (schema === null && response.ok) return null
  if (response.status === 204) {
    throw new HttpError("INTERNAL", { status: response.status })
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (cause) {
    if (signal?.aborted) throw cause
    // The body stopped arriving (timeout) → NETWORK; it wasn't JSON → INTERNAL.
    throw new HttpError(
      timeout.aborted || isAbort(cause) ? "NETWORK" : "INTERNAL",
      {
        status: response.status,
        cause,
      }
    )
  }

  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(json)
    if (!envelope.success) {
      throw new HttpError("INTERNAL", { status: response.status })
    }
    throw new HttpError(envelope.data.error.code, {
      status: response.status,
      details: envelope.data.error.details,
    })
  }

  // Only an ok response gets here, and an ok call without a schema returned above.
  const parsed = schema!.safeParse(json)
  if (!parsed.success) {
    throw new HttpError("INTERNAL", {
      status: response.status,
      cause: parsed.error,
    })
  }
  return parsed.data
}

/** `GET /api/v1/todos`. */
export function listTodos(signal?: AbortSignal): Promise<TodoListResponse> {
  return request(TODOS_PATH, { schema: TodoListResponseSchema, signal })
}

/**
 * `POST /api/v1/todos`. Both `201` (created) and `200` (idempotent replay of
 * the same `id` and Description) resolve to the stored Todo.
 */
export function createTodo(body: CreateTodoRequest): Promise<Todo> {
  return request(TODOS_PATH, { method: "POST", body, schema: TodoSchema })
}

/**
 * `PATCH /api/v1/todos/:id`: `200` with the updated Todo. Failures reject
 * with an `HttpError` classified as for every request (the AD-5 kinds, or
 * `NETWORK` for a fetch rejection or timeout); an unknown id is `NOT_FOUND`.
 */
export function updateTodo(id: string, body: UpdateTodoRequest): Promise<Todo> {
  return request(todoPath(id), { method: "PATCH", body, schema: TodoSchema })
}

/**
 * `DELETE /api/v1/todos/:id`: `204` with no body, resolved as `null`. No
 * body or `Content-Type` is sent. An unknown id rejects `NOT_FOUND` (the
 * delete hook counts it as success); other failures classify as for every
 * request.
 */
export function deleteTodo(id: string): Promise<null> {
  return request(todoPath(id), { method: "DELETE", schema: null })
}
