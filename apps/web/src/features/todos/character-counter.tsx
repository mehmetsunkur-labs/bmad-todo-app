import { COUNTER_THRESHOLD, DESCRIPTION_MAX } from "@todos/shared"
import { cn } from "@/lib/utils"

/**
 * "{n} / 500" in `meta` style, right-aligned in an always-reserved 16px line
 * (so it never moves the list), visible from `COUNTER_THRESHOLD` characters
 * and destructive at `DESCRIPTION_MAX`. `aria-hidden`: it is announced only
 * through the live region, not on every keystroke.
 */
export function CharacterCounter({ length }: { length: number }) {
  return (
    <p
      aria-hidden="true"
      data-testid="character-counter"
      className="h-counter-line text-right text-meta leading-(--spacing-counter-line) text-muted-foreground"
    >
      {length >= COUNTER_THRESHOLD && (
        <span className={cn(length >= DESCRIPTION_MAX && "text-destructive")}>
          {length} / {DESCRIPTION_MAX}
        </span>
      )}
    </p>
  )
}
