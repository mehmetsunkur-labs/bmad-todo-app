import { HEALTH_PATH, HealthResponseSchema } from "@todos/shared"
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod"

import { errorResponses } from "../openapi"
import type { HealthService } from "../services/health-service"

export function healthRoutes(deps: {
  healthService: HealthService
}): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      HEALTH_PATH,
      {
        schema: {
          response: {
            200: HealthResponseSchema.describe(
              "The API is up and the database is reachable"
            ),
            ...errorResponses(400, 500, 503),
          },
        },
      },
      async (request) => {
        await deps.healthService.check(request.ctx)
        return { status: "ok" as const }
      }
    )
  }
}
