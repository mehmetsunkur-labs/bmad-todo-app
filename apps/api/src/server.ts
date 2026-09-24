import { buildApp } from "./app"
import { ConfigError, loadConfig, type Config } from "./config"
import { createPool } from "./db/client"
import { runMigrations } from "./db/migrate"
import { createLogger } from "./logger"

async function main(): Promise<void> {
  let config: Config
  try {
    config = loadConfig(process.env)
  } catch (err) {
    const logger = createLogger("info")
    if (err instanceof ConfigError) {
      logger.error({ issues: err.issues }, err.message)
    } else {
      logger.error({ err }, "failed to load configuration")
    }
    process.exitCode = 1
    return
  }

  const logger = createLogger(config.LOG_LEVEL)
  const pool = createPool(config.DATABASE_URL, logger)

  try {
    await runMigrations(pool, logger)
  } catch (err) {
    logger.error({ err }, "failed to apply migrations")
    await pool.end().catch(() => undefined)
    process.exitCode = 1
    return
  }

  const app = buildApp({ pool, logger })

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, "shutting down")
    try {
      await app.close()
      logger.info("http server closed")
      await pool.end()
      logger.info("database pool closed")
      process.exit(0)
    } catch (err) {
      logger.error({ err }, "error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGTERM", (signal) => void shutdown(signal))
  process.once("SIGINT", (signal) => void shutdown(signal))

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" })
  } catch (err) {
    logger.error({ err }, "failed to start server")
    await pool.end().catch(() => undefined)
    process.exitCode = 1
  }
}

await main()
