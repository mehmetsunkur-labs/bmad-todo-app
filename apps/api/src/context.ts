import type { FastifyInstance } from "fastify"

/**
 * Per-request context threaded as the first parameter of every service and
 * repository function (AD-8). Owners/auth will add fields here later.
 */
export interface RequestContext {
  requestId: string
}

declare module "fastify" {
  interface FastifyRequest {
    ctx: RequestContext
  }
}

export function registerRequestContext(app: FastifyInstance): void {
  app.decorateRequest("ctx", null as unknown as RequestContext)
  app.addHook("onRequest", async (request) => {
    request.ctx = { requestId: request.id }
  })
}
