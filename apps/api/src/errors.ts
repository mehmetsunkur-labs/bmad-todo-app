import type { ErrorCode, ErrorDetail, ErrorEnvelope } from "@todos/shared"
import type { FastifyError, FastifyInstance, FastifyReply } from "fastify"

/** Maximum request body size (AD-5): larger bodies get 413 VALIDATION_ERROR. */
export const BODY_LIMIT_BYTES = 16 * 1024

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAVAILABLE: 503,
  INTERNAL: 500,
}

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "The request is invalid.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "The request conflicts with the stored resource.",
  UNAVAILABLE: "The service is temporarily unavailable.",
  INTERNAL: "An unexpected error occurred.",
}

/**
 * The only error type routes and services throw. The error handler below turns
 * it into the AD-5 envelope; nothing else writes error bodies.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details?: ErrorDetail[]

  constructor(
    code: ErrorCode,
    options: {
      message?: string
      details?: ErrorDetail[]
      statusCode?: number
      cause?: unknown
    } = {}
  ) {
    super(options.message ?? DEFAULT_MESSAGE[code], { cause: options.cause })
    this.name = "AppError"
    this.code = code
    this.statusCode = options.statusCode ?? DEFAULT_STATUS[code]
    this.details = options.details
  }
}

function envelope(
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[]
): ErrorEnvelope {
  return {
    error: details?.length ? { code, message, details } : { code, message },
  }
}

function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply
    .code(error.statusCode)
    .type("application/json; charset=utf-8")
    .send(envelope(error.code, error.message, error.details))
}

type ValidationIssue = NonNullable<FastifyError["validation"]>[number]

function toDetails(issues: ValidationIssue[]): ErrorDetail[] {
  return issues.flatMap((issue): ErrorDetail[] => {
    const field = issue.instancePath.replace(/^\//, "").replace(/\//g, ".")
    const params = issue.params as Record<string, unknown>
    switch (issue.keyword) {
      case "unrecognized_keys":
        return (Array.isArray(params.keys) ? params.keys : []).map((key) => ({
          field: field ? `${field}.${String(key)}` : String(key),
          reason: "unknown_field",
        }))
      case "too_big":
        return [{ field, reason: "too_long" }]
      case "too_small":
        return [{ field, reason: "empty" }]
      default:
        return [{ field, reason: "invalid" }]
    }
  })
}

/** Maps anything thrown during a request to an AppError. */
function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) return error
  const fastifyError = error as Partial<FastifyError> | null
  if (fastifyError?.validation?.length) {
    return new AppError("VALIDATION_ERROR", {
      details: toDetails(fastifyError.validation),
      cause: error,
    })
  }
  // Fastify's own client errors: malformed JSON, empty JSON body (400),
  // body over bodyLimit (413), unsupported media type (415). Any other status
  // falls through to the unhandled/INTERNAL path.
  const status = fastifyError?.statusCode
  if (status === 404) {
    return new AppError("NOT_FOUND", { cause: error })
  }
  if (status === 400 || status === 413 || status === 415) {
    return new AppError("VALIDATION_ERROR", {
      statusCode: status,
      cause: error,
    })
  }
  return undefined
}

/**
 * Fastify `frameworkErrors` hook: errors raised before routing (for example a
 * malformed percent-encoded URL, FST_ERR_BAD_URL) get the same envelope as
 * every other client error (400 VALIDATION_ERROR).
 */
export function handleFrameworkError(
  error: FastifyError,
  _request: unknown,
  reply: FastifyReply
): void {
  void sendError(reply, new AppError("VALIDATION_ERROR", { cause: error }))
}

/**
 * Registers the single error handler and the single not-found handler. Every
 * non-2xx response the API sends comes from one of these two (AD-5).
 */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error)
    if (appError) {
      if (appError.statusCode >= 500) {
        request.log.warn(
          { err: appError.cause ?? appError, code: appError.code },
          "request failed"
        )
      }
      return sendError(reply, appError)
    }
    request.log.error({ err: error }, "unhandled error")
    return sendError(reply, new AppError("INTERNAL"))
  })

  app.setNotFoundHandler((_request, reply) => {
    return sendError(reply, new AppError("NOT_FOUND"))
  })
}
