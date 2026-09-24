import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { defineConfig } from "drizzle-kit"

// Host-side commands (`pnpm db:generate`, `pnpm db:migrate`) read the root
// .env; variables already set in the environment win.
const rootEnv = resolve(process.cwd(), "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
})
