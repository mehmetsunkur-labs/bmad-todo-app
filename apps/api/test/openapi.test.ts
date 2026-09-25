import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  ErrorCodeSchema,
  HEALTH_PATH,
  OPENAPI_PATH,
  todoPath,
  TODOS_PATH,
} from "@todos/shared"
import { isDeepStrictEqual } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  generateOpenApiDocument,
  serializeOpenApiDocument,
  type OpenApiDocument,
} from "../src/openapi"
import { BODY_LIMIT_BYTES } from "../src/errors"
import { createTestApp, expectValidationError, type TestApp } from "./helpers"

const SNAPSHOT_PATH = resolve(
  import.meta.dirname,
  "../../../docs/api/openapi.json"
)

const TODO_ITEM_PATH = `${TODOS_PATH}/{id}`

/**
 * Every documented operation and exactly the statuses it may return (AD-5,
 * amended 2026-09-25): including the framework-level 400 for a malformed URL
 * on every route, and 413/415 wherever Fastify parses a body (DELETE too).
 */
const EXPECTED_STATUSES: Record<string, Record<string, string[]>> = {
  [HEALTH_PATH]: { get: ["200", "400", "500", "503"] },
  [TODOS_PATH]: {
    get: ["200", "400", "500", "503"],
    post: ["200", "201", "400", "409", "413", "415", "500", "503"],
  },
  [TODO_ITEM_PATH]: {
    patch: ["200", "400", "404", "413", "415", "500", "503"],
    delete: ["204", "400", "404", "413", "415", "500", "503"],
  },
}

const ERROR_CODE_FOR_STATUS: Record<string, string> = {
  "400": "VALIDATION_ERROR",
  "404": "NOT_FOUND",
  "409": "CONFLICT",
  "413": "VALIDATION_ERROR",
  "415": "VALIDATION_ERROR",
  "500": "INTERNAL",
  "503": "UNAVAILABLE",
}

/**
 * Compares the committed snapshot text with a freshly generated document.
 * Returns a failure message, or `undefined` when they match.
 */
function snapshotMismatch(
  committed: string,
  generated: OpenApiDocument
): string | undefined {
  const expected = serializeOpenApiDocument(generated)
  if (committed === expected) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(committed)
  } catch {
    return "docs/api/openapi.json is not valid JSON. Run `pnpm api:docs` and commit the result."
  }
  const kind = isDeepStrictEqual(parsed, generated)
    ? "is formatted differently from"
    : "differs from"
  return `docs/api/openapi.json ${kind} what the current schemas generate. Run \`pnpm api:docs\` and commit the result.`
}

type Json = Record<string, unknown>

function errorCodeEnum(response: { content?: unknown }): unknown {
  const content = response.content as Json | undefined
  const schema = (content?.["application/json"] as Json | undefined)?.schema as
    Json | undefined
  const error = (schema?.properties as Json | undefined)?.error as
    Json | undefined
  const code = (error?.properties as Json | undefined)?.code as Json | undefined
  return code?.enum
}

describe("OpenAPI document", () => {
  let t: TestApp
  let doc: OpenApiDocument

  beforeAll(async () => {
    t = createTestApp()
    doc = await generateOpenApiDocument()
  })
  afterAll(() => t.close())

  it(`serves the generated document at GET ${OPENAPI_PATH}`, async () => {
    const res = await t.app.inject({ method: "GET", url: OPENAPI_PATH })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    const live = res.json() as OpenApiDocument
    expect(live.openapi).toMatch(/^3\./)
    expect(live).toEqual(doc)
  })

  it("documents exactly the API's paths and methods, and hides its own route", () => {
    const actual = Object.fromEntries(
      Object.entries(doc.paths).map(([path, ops]) => [
        path,
        Object.keys(ops).sort(),
      ])
    )
    expect(actual).toEqual({
      [HEALTH_PATH]: ["get"],
      [TODOS_PATH]: ["get", "post"],
      [TODO_ITEM_PATH]: ["delete", "patch"],
    })
    expect(doc.paths[OPENAPI_PATH]).toBeUndefined()
  })

  it.each([
    ["post", TODOS_PATH, ["id", "description"]],
    ["patch", TODO_ITEM_PATH, ["description", "completed"]],
  ])("%s %s has a strict JSON request body", (method, path, keys) => {
    const body = doc.paths[path]?.[method]?.requestBody
    const schema = body?.content["application/json"]?.schema
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    })
    expect(Object.keys(schema?.properties as Json).sort()).toEqual(
      [...keys].sort()
    )
  })

  it("lists exactly each operation's statuses, with the error envelope for every error", () => {
    for (const [path, ops] of Object.entries(EXPECTED_STATUSES)) {
      for (const [method, statuses] of Object.entries(ops)) {
        const responses = doc.paths[path]?.[method]?.responses ?? {}
        expect(Object.keys(responses).sort(), `${method} ${path}`).toEqual(
          [...statuses].sort()
        )
        for (const status of statuses.filter((s) => Number(s) >= 400)) {
          const response = responses[status]!
          expect(
            errorCodeEnum(response),
            `${method} ${path} ${status}`
          ).toEqual(ErrorCodeSchema.options)
          expect(response.description).toMatch(
            new RegExp(`^${ERROR_CODE_FOR_STATUS[status]} — .+`)
          )
        }
      }
    }
  })

  it("matches the committed snapshot docs/api/openapi.json", () => {
    expect(
      existsSync(SNAPSHOT_PATH),
      "docs/api/openapi.json is missing. Run `pnpm api:docs` and commit the result."
    ).toBe(true)
    const committed = readFileSync(SNAPSHOT_PATH, "utf8")
    const mismatch = snapshotMismatch(committed, doc)
    expect(mismatch, mismatch).toBeUndefined()
  })

  it("documents the snapshot's DELETE 204 with a description and no body", () => {
    const committed = JSON.parse(
      readFileSync(SNAPSHOT_PATH, "utf8")
    ) as OpenApiDocument
    const noContent = committed.paths[TODO_ITEM_PATH]?.delete?.responses["204"]
    expect(noContent?.description).toBeTruthy()
    expect(noContent).not.toHaveProperty("content")
  })

  it("reports drift when the schemas change without `pnpm api:docs`", () => {
    const committed = serializeOpenApiDocument(doc)
    expect(snapshotMismatch(committed, doc)).toBeUndefined()

    const drifted = structuredClone(doc)
    drifted.paths[TODOS_PATH]!.post!.responses["201"]!.description = "changed"
    expect(snapshotMismatch(committed, drifted)).toMatch(/pnpm api:docs/)
    expect(snapshotMismatch(committed.trimEnd(), doc)).toMatch(/pnpm api:docs/)
  })

  it("DELETE still sends 204 with no body and no content-type", async () => {
    const id = "0199a1b2-c3d4-7e5f-8a9b-00000000beef"
    const created = await t.app.inject({
      method: "POST",
      url: TODOS_PATH,
      payload: { id, description: "openapi 204 check" },
    })
    expect([200, 201]).toContain(created.statusCode)
    const removed = await t.app.inject({ method: "DELETE", url: todoPath(id) })
    expect(removed.statusCode).toBe(204)
    expect(removed.body).toBe("")
    expect(removed.headers["content-type"]).toBeUndefined()
    expect(removed.headers["content-length"]).toBeUndefined()
  })
  describe("documented = reachable", () => {
    const id = "0199a1b2-c3d4-7e5f-8a9b-00000000cafe"

    function documented(path: string, method: string, status: string): void {
      expect(
        Object.keys(doc.paths[path]?.[method]?.responses ?? {}),
        `${method} ${path} documents ${status}`
      ).toContain(status)
    }

    it.each([
      ["GET", HEALTH_PATH, `${HEALTH_PATH}%zz`],
      ["GET", TODOS_PATH, `${TODOS_PATH}%zz`],
    ] as const)(
      "%s %s: a malformed URL → documented 400",
      async (method, path, url) => {
        const res = await t.app.inject({ method, url })
        expectValidationError(res, 400)
        documented(path, method.toLowerCase(), "400")
      }
    )

    it("DELETE with a text/plain body → documented 415", async () => {
      const res = await t.app.inject({
        method: "DELETE",
        url: todoPath(id),
        headers: { "content-type": "text/plain" },
        payload: "hello",
      })
      expectValidationError(res, 415)
      documented(TODO_ITEM_PATH, "delete", "415")
    })

    it(`DELETE with a JSON body over ${BODY_LIMIT_BYTES} bytes → documented 413`, async () => {
      const res = await t.app.inject({
        method: "DELETE",
        url: todoPath(id),
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ pad: "x".repeat(BODY_LIMIT_BYTES + 1) }),
      })
      expectValidationError(res, 413)
      documented(TODO_ITEM_PATH, "delete", "413")
    })
  })
})
