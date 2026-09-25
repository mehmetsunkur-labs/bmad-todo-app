import { z } from "zod"

/** The closed set of error codes the API may return (AD-5). */
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "UNAVAILABLE",
  "INTERNAL",
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export const ErrorReasonSchema = z.enum([
  "empty",
  "too_long",
  "invalid",
  "unknown_field",
])
export type ErrorReason = z.infer<typeof ErrorReasonSchema>

export const ErrorDetailSchema = z.object({
  field: z.string(),
  reason: ErrorReasonSchema,
})
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>

/**
 * The body of every non-2xx API response. A response schema, so unknown keys
 * are stripped rather than rejected (AD-2).
 */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
})
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>
