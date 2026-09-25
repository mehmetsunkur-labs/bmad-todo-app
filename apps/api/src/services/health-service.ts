import type { RequestContext } from "../context"
import { AppError } from "../errors"
import type { HealthRepository } from "../repositories/health-repository"

export interface HealthService {
  /** Throws `AppError('UNAVAILABLE')` when the database cannot be reached. */
  check(ctx: RequestContext): Promise<void>
}

export function createHealthService(deps: {
  healthRepository: HealthRepository
}): HealthService {
  return {
    async check(ctx) {
      try {
        await deps.healthRepository.ping(ctx)
      } catch (cause) {
        throw new AppError("UNAVAILABLE", {
          message: "The database is unreachable.",
          cause,
        })
      }
    },
  }
}
