import { LogController, type FastifyInstance } from "fastify"
import { pino, type DestinationStream, type Logger } from "pino"

import type { Config } from "./config"

/**
 * The API's pino logger: JSON on stdout (AD-11). Request and response bodies
 * are never logged.
 */
export function createLogger(
  level: Config["LOG_LEVEL"] = "info",
  destination?: DestinationStream
): Logger {
  const options = { level, base: undefined }
  return destination ? pino(options, destination) : pino(options)
}

/**
 * Turns off Fastify's built-in per-request lines ("incoming request" and
 * "request completed"); `registerRequestLogging` emits the single line instead.
 */
export function createLogController(): LogController {
  return new LogController({ disableRequestLogging: true })
}

/**
 * Emits exactly one line per completed request (AD-11), replacing Fastify's
 * two default lines that `createLogController` disables.
 * `reqId` comes from Fastify's per-request child logger binding.
 */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? null,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed"
    )
  })
}
