import { announce } from "@/lib/announce"
import { showErrorToast } from "@/lib/toast"

import { RETRY_LABEL } from "./failure-copy"

/**
 * A persistent failure toast with "Retry": the action resends the failed
 * write (`retry`) and announces `announcement` (the success message the
 * owning component would have announced).
 */
export function showRetryToast(
  copy: string,
  retry: () => void,
  announcement: string
): void {
  showErrorToast(copy, {
    action: {
      label: RETRY_LABEL,
      onClick: () => {
        retry()
        announce(announcement)
      },
    },
  })
}
