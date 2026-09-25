import { showErrorToast } from "@/lib/toast"

export const TOGGLE_FAILED_COPY = "Couldn't update that todo. Please try again."

/**
 * The toggle kind's failure handler (the row is already rolled back, or
 * removed after a `404`). One plain toast; focus doesn't move, and the API's
 * `message` is never shown.
 */
export function showToggleFailure(): void {
  showErrorToast(TOGGLE_FAILED_COPY)
}
