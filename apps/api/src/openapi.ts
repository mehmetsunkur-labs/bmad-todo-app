import fastifySwagger from "@fastify/swagger"
import { jsonSchemaTransform } from "@fastify/type-provider-zod"
import {
  DESCRIPTION_MAX,
  ErrorEnvelopeSchema,
  OPENAPI_PATH,
} from "@todos/shared"
import type { FastifyInstance } from "fastify"

import { buildApp } from "./app"
import { createPool } from "./db/client"
import { BODY_LIMIT_BYTES } from "./errors"
import { createLogger } from "./logger"

const DESCRIPTION = [
  "The Todos API. Every route lives under `/api/v1`.",
  "Request bodies are strict: unknown keys are rejected.",
  "Every non-2xx response is the error envelope",
  "`{ error: { code, message, details? } }`; clients branch on `code`, never",
  "on `message`.",
].join(" ")

/** The parts of the generated document that the drift test inspects. */
export interface OpenApiDocument {
  openapi: string
  paths: Record<string, Record<string, OpenApiOperation>>
  [key: string]: unknown
}

export interface OpenApiOperation {
  requestBody?: { content: Record<string, { schema: Record<string, unknown> }> }
  responses: Record<string, { description: string; content?: unknown }>
  [key: string]: unknown
}

/** The error statuses a route can document, with their AD-5 code and cause. */
const ERROR_DESCRIPTIONS = {
  400: `VALIDATION_ERROR — depending on the route: a malformed URL, malformed or empty JSON, an invalid id, or a body that fails its schema or the Description rules (1–${DESCRIPTION_MAX} characters after normalization); \`details\`, when present, names each field`,
  404: "NOT_FOUND — no Todo has this id",
  409: "CONFLICT — a Todo with this id already exists with a different Description",
  413: `VALIDATION_ERROR — the request body is larger than ${BODY_LIMIT_BYTES / 1024} KiB`,
  415: "VALIDATION_ERROR — the request has a body that is not application/json",
  500: "INTERNAL — an unexpected server error",
  503: "UNAVAILABLE — the database is unreachable",
} as const

export type ErrorStatus = keyof typeof ERROR_DESCRIPTIONS

/**
 * Response-schema entries for the given error statuses, all using the shared
 * error envelope. Spread into a route's `response` map; the same schema also
 * serializes the error replies, which every envelope already satisfies.
 */
export function errorResponses<const S extends ErrorStatus>(
  ...statuses: S[]
): Record<S, typeof ErrorEnvelopeSchema> {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      ErrorEnvelopeSchema.describe(ERROR_DESCRIPTIONS[status]),
    ])
  ) as Record<S, typeof ErrorEnvelopeSchema>
}

type TransformInput = Parameters<typeof jsonSchemaTransform>[0]

/**
 * `jsonSchemaTransform`, then every `204` response documented as body-less:
 * `z.null()` would otherwise render as an `application/json` body the API
 * never sends. `type: "null"` makes @fastify/swagger omit `content`. Only
 * the document changes; the route's runtime schema is untouched.
 */
function documentTransform(input: TransformInput) {
  const out = jsonSchemaTransform(input)
  const response = (out.schema as { response?: Record<string, unknown> })
    ?.response
  if (response && "204" in response) {
    return {
      ...out,
      schema: {
        ...out.schema,
        response: {
          ...response,
          204: { type: "null", description: "No content" },
        },
      },
    }
  }
  return out
}

/**
 * Registers `@fastify/swagger` and the hidden `GET /api/v1/openapi.json`
 * route. Must run before the routes are registered, since swagger collects
 * them through `onRoute`.
 */
export function registerOpenApi(app: FastifyInstance): void {
  app.register(fastifySwagger, {
    openapi: {
      info: { title: "Todos API", version: "1.0.0", description: DESCRIPTION },
    },
    transform: documentTransform,
  })

  app.get(OPENAPI_PATH, { schema: { hide: true } }, async () => app.swagger())
}

/**
 * Builds the app without touching the database (the pool never connects) and
 * returns its OpenAPI document. Used by `pnpm api:docs` and the drift test.
 */
export async function generateOpenApiDocument(): Promise<OpenApiDocument> {
  const logger = createLogger("silent")
  const pool = createPool("postgres://openapi@127.0.0.1:1/openapi", logger)
  const app = buildApp({ pool, logger })
  try {
    try {
      await app.ready()
      return app.swagger() as unknown as OpenApiDocument
    } finally {
      await app.close()
    }
  } finally {
    await pool.end()
  }
}

/** The snapshot file format: deterministic, 2-space JSON plus a newline. */
export function serializeOpenApiDocument(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
