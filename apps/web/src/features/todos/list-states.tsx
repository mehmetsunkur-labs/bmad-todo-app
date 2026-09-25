import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDelayedFlag } from "@/lib/use-delayed-flag"

/** Nothing shows for the first 300 ms, so a fast load never flashes. */
export const SKELETON_DELAY_MS = 300
const SKELETON_ROWS = 4

/**
 * Loading: the list is `aria-busy` for the whole fetch; after 300 ms it shows
 * four `aria-hidden` skeleton rows shaped like Todo rows (DESIGN.md): a
 * 16 px square in the checkbox's 44 px column, a Description bar, and a
 * short meta bar.
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
            className="flex min-h-touch-target items-start gap-1 border-b py-row-padding-y"
          >
            {/* Where TodoRow's checkbox sits: 16 px, centred on the first line. */}
            <div className="-my-2.5 mr-4 -ml-3.5 flex size-touch-target shrink-0 items-center justify-center">
              <Skeleton
                data-testid="todo-skeleton-checkbox"
                className="size-4 rounded-[4px]"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="mt-1 h-4 w-3/4" />
              <Skeleton className="h-3 w-16" />
            </div>
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
      <p className="text-sm text-muted-foreground">{body}</p>
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
