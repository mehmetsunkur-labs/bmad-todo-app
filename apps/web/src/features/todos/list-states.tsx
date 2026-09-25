import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDelayedFlag } from "@/lib/use-delayed-flag"

/** Nothing shows for the first 300 ms, so a fast load never flashes. */
export const SKELETON_DELAY_MS = 300
const SKELETON_ROWS = 4

/**
 * Loading: the list is `aria-busy` for the whole fetch; after 300 ms it shows
 * four `aria-hidden` skeleton rows shaped like the current (single-column)
 * Todo rows.
 */
export function LoadingState() {
  const showSkeleton = useDelayedFlag(true, SKELETON_DELAY_MS)
  return (
    <ul aria-label="Todos" aria-busy="true">
      {showSkeleton &&
        Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li
            key={i}
            aria-hidden="true"
            data-testid="todo-skeleton"
            className="flex min-h-touch-target flex-col gap-2 border-b py-row-padding-y"
          >
            {/* Single column like TodoRow: a Description bar, then a short
                meta bar. No checkbox square until Epic 2 adds the checkbox. */}
            <Skeleton className="mt-1 h-4 w-3/4" />
            <Skeleton className="h-3 w-16" />
          </li>
        ))}
    </ul>
  )
}

function StateMessage({
  title,
  body,
  children,
  ...props
}: {
  title: string
  body: string
  children?: React.ReactNode
} & React.ComponentProps<"div">) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-12 text-center"
      {...props}
    >
      <p className="text-empty-title">{title}</p>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </div>
  )
}

export function EmptyState() {
  return (
    <StateMessage title="Nothing here yet." body="Add your first todo above." />
  )
}

/** Load error: never shown as an empty list. "Try again" returns to Loading. */
export function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      role="alert"
      title="Couldn't load your todos."
      body="Check your connection and try again."
    >
      <Button
        variant="secondary"
        className="mt-4 h-touch-target px-4"
        onClick={onRetry}
      >
        Try again
      </Button>
    </StateMessage>
  )
}
