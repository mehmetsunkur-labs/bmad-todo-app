import { z } from "zod"

/** Response schema: unknown keys are stripped, since clients ignore them (AD-2). */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>
