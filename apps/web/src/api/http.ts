import {
  ErrorEnvelopeSchema,
  REQUEST_TIMEOUT_MS,
  TODOS_PATH,
  TodoListResponseSchema,
  type ErrorCode,
  type ErrorDetail,
  type TodoListResponse,
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

/** The part of a shared Zod schema that `request` needs. */
interface ResponseSchema<T> {
  safeParse(
    input: unknown
  ): { success: true; data: T } | { success: false; error: unknown }
}

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  /** Schema for the success body; ignored for `204`, which is never parsed. */
  schema: ResponseSchema<T>
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
export async function request<T>(
  path: string,
  { method = "GET", body, schema, signal }: RequestOptions<T>
): Promise<T> {
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

  if (response.status === 204) return undefined as T

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

  const parsed = schema.safeParse(json)
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
