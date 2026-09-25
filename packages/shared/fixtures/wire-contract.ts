/**
 * The wire contract for `POST /api/v1/todos`, shared by both sides:
 * `apps/api/test/contract.test.ts` sends each request to the real app and
 * asserts the server still answers with exactly this status and body, and
 * `apps/web/src/api/http.contract.test.ts` feeds the same status and body
 * through the real client parser. A server change that breaks the fixture
 * fails the API test; updating the fixture then re-checks the client.
 *
 * Test-only: not exported from the package root.
 */
import type { ErrorCode, ErrorEnvelope } from "../src/errors"
import { TODOS_PATH } from "../src/paths"
import type { Todo } from "../src/todos"

/** A raw HTTP request, as sent on the wire. */
export interface WireRequest {
  method: "POST"
  path: string
  headers: Record<string, string>
  body: string
}

interface BaseCase {
  /** A request sent (and expected to succeed) before `request`, for replays and conflicts. */
  seed?: WireRequest
  request: WireRequest
}

export interface SuccessCase extends BaseCase {
  status: 200 | 201
  /**
   * An example body. The server's timestamps differ per run, so the API test
   * checks the schema, the key set, and the non-time fields.
   */
  body: Todo
}

export interface ErrorCase extends BaseCase {
  status: 400 | 409 | 413 | 415
  /** The server's exact body, `message` included. */
  body: ErrorEnvelope
  /** The client's `HttpError.kind` for this response. */
  kind: ErrorCode
  /** Whether the client shows the too-long copy. */
  tooLong: boolean
}

export const CONTRACT_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

const JSON_HEADERS = { "content-type": "application/json" }

function postJson(body: unknown): WireRequest {
  return {
    method: "POST",
    path: TODOS_PATH,
    headers: JSON_HEADERS,
    body: typeof body === "string" ? body : JSON.stringify(body),
  }
}

const createBuyMilk = postJson({ id: CONTRACT_ID, description: "Buy milk" })

const storedBuyMilk: Todo = {
  id: CONTRACT_ID,
  description: "Buy milk",
  completed: false,
  createdAt: "2026-09-24T15:30:00.123Z",
  updatedAt: "2026-09-24T15:30:00.123Z",
}

const VALIDATION_MESSAGE = "The request is invalid."

function validation(
  status: 400 | 413 | 415,
  details?: { field: string; reason: "empty" | "too_long" | "unknown_field" }[]
): Pick<ErrorCase, "status" | "body" | "kind" | "tooLong"> {
  return {
    status,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message: VALIDATION_MESSAGE,
        ...(details ? { details } : {}),
      },
    },
    kind: "VALIDATION_ERROR",
    tooLong: !!details?.some((d) => d.reason === "too_long"),
  }
}

const successCases = {
  created: {
    request: postJson({ id: CONTRACT_ID, description: "  Buy\nmilk " }),
    status: 201,
    body: storedBuyMilk,
  },
  replayed: {
    seed: createBuyMilk,
    request: createBuyMilk,
    status: 200,
    body: storedBuyMilk,
  },
} satisfies Record<string, SuccessCase>

/** Success responses (201 created, 200 idempotent replay), by name. */
export const SUCCESS_CASES: Record<keyof typeof successCases, SuccessCase> =
  successCases

const errorCases = {
  conflict: {
    seed: createBuyMilk,
    request: postJson({ id: CONTRACT_ID, description: "Buy bread" }),
    status: 409,
    body: {
      error: {
        code: "CONFLICT",
        message: "The request conflicts with the stored resource.",
      },
    },
    kind: "CONFLICT",
    tooLong: false,
  },
  empty: {
    request: postJson({ id: CONTRACT_ID, description: "   " }),
    ...validation(400, [{ field: "description", reason: "empty" }]),
  },
  tooLong: {
    request: postJson({ id: CONTRACT_ID, description: "x".repeat(501) }),
    ...validation(400, [{ field: "description", reason: "too_long" }]),
  },
  unknownField: {
    request: postJson({
      id: CONTRACT_ID,
      description: "Buy milk",
      createdAt: "2026-09-24T09:14:00.000Z",
    }),
    ...validation(400, [{ field: "createdAt", reason: "unknown_field" }]),
  },
  malformedJson: {
    request: postJson('{"id":'),
    ...validation(400),
  },
  bodyTooLarge: {
    request: postJson({
      id: CONTRACT_ID,
      description: "x".repeat(17 * 1024),
    }),
    ...validation(413),
  },
  unsupportedMediaType: {
    request: {
      method: "POST",
      path: TODOS_PATH,
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ id: CONTRACT_ID, description: "Buy milk" }),
    },
    ...validation(415),
  },
} satisfies Record<string, ErrorCase>

/** Error responses, by name. */
export const ERROR_CASES: Record<keyof typeof errorCases, ErrorCase> =
  errorCases
