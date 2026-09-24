import { z } from "zod"

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const

export const ConfigSchema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: "must be a postgres:// or postgresql:// URL",
  }),
  PORT: z
    .string()
    .regex(/^\d+$/, "must be an integer")
    .default("3000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
})

export type Config = z.infer<typeof ConfigSchema>

export class ConfigError extends Error {
  readonly issues: { variable: string; message: string }[]

  constructor(issues: { variable: string; message: string }[]) {
    super(
      `Invalid configuration: ${issues
        .map((i) => `${i.variable} ${i.message}`)
        .join("; ")}`
    )
    this.name = "ConfigError"
    this.issues = issues
  }
}

/**
 * Reads and validates the API configuration. The API reads only
 * DATABASE_URL, PORT, and LOG_LEVEL (AD-10).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    PORT: env.PORT === "" ? undefined : env.PORT,
    LOG_LEVEL: env.LOG_LEVEL === "" ? undefined : env.LOG_LEVEL,
  })
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => ({
        variable: String(issue.path[0] ?? "config"),
        message:
          issue.code === "invalid_type" && issue.input === undefined
            ? "is required"
            : issue.message,
      }))
    )
  }
  return result.data
}
