import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod"
import type pg from "pg"

import { registerRequestContext } from "./context"
import {
  BODY_LIMIT_BYTES,
  handleFrameworkError,
  registerErrorHandlers,
} from "./errors"
import { createLogController, registerRequestLogging } from "./logger"
import { createRepositories } from "./repositories"
import { healthRoutes } from "./routes/health"
import { todoRoutes } from "./routes/todos"
import { createHealthService } from "./services/health-service"
import { createTodoService } from "./services/todo-service"

export interface BuildAppOptions {
  pool: pg.Pool
  logger: FastifyBaseLogger
}

/**
 * Builds the Fastify app without listening, so tests can drive it through
 * `inject`. Routes are registered with the full `/api/v1` prefix (AD-2).
 */
export function buildApp({ pool, logger }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    loggerInstance: logger,
    logController: createLogController(),
    bodyLimit: BODY_LIMIT_BYTES,
    frameworkErrors: handleFrameworkError,
    // Requests arriving while close() drains go through the normal handlers
    // instead of Fastify's hard-coded, non-envelope 503.
    return503OnClosing: false,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  registerErrorHandlers(app)
  registerRequestContext(app)
  registerRequestLogging(app)

  const repositories = createRepositories(pool)
  const healthService = createHealthService({
    healthRepository: repositories.health,
  })
  const todoService = createTodoService({
    todoRepository: repositories.todos,
  })

  app.register(healthRoutes({ healthService }))
  app.register(todoRoutes({ todoService }))

  return app
}
