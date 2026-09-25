import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * The Drizzle schema: the single source of the database structure (AD-7).
 * Changes here reach the database only through drizzle-kit migrations
 * committed under `apps/api/drizzle/`. Column names are snake_case via the
 * `casing` setting in drizzle.config.ts and the Drizzle client.
 */
export const todos = pgTable("todos", {
  id: uuid().primaryKey(),
  description: text().notNull(),
  completed: boolean().notNull().default(false),
  // The database clock is the only clock (AD-3): millisecond precision.
  createdAt: timestamp({ withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp({ withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
})

export type TodoRow = typeof todos.$inferSelect
