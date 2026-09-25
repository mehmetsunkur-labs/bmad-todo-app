import { memo } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatFullDateTime, formatRelativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import { useMinuteTick } from "@/lib/use-minute-tick"

/**
 * The Created At time. Relative text by default; "Created {full}" while its
 * row (`group/row`) has focus-within, without adding a tab stop; the full
 * date and time in a Tooltip on pointer hover. Subscribes to the shared
 * minute ticker itself, so a tick re-renders only this element.
 */
export const CreatedAt = memo(function CreatedAt({
  iso,
  className,
}: {
  iso: string
  /** Placement in the row. */
  className?: string
}) {
  const now = useMinuteTick()
  const date = new Date(iso)
  const full = formatFullDateTime(date)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={iso}
          className={cn(
            "mt-0.5 self-start justify-self-start text-meta text-muted-foreground",
            className
          )}
        >
          <span className="group-focus-within/row:hidden">
            {formatRelativeTime(date, now)}
          </span>
          <span className="hidden group-focus-within/row:inline">
            Created {full}
          </span>
        </time>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  )
})
