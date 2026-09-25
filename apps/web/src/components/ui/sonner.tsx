import { useEffect, useRef } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon,
  Loader2Icon,
} from "lucide-react"

import { dismissNewestToast, setToastsPaused } from "@/lib/toast"
import { useMediaQuery } from "@/lib/use-media-query"

/**
 * The toast action ("Retry"): Sonner's 24 px button keeps its look, with a
 * hit extender to 44 px tall (FR-12) and the design-system focus ring
 * (2 px `ring`, 2 px offset) in place of Sonner's faint box-shadow, which
 * its unlayered `outline: none` would otherwise leave (hence `!`).
 */
export const TOAST_ACTION_CLASS =
  "relative after:absolute after:-inset-2.5 after:content-[''] focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-solid! focus-visible:outline-ring!"

/**
 * The app's one Toaster (mounted in `AppProviders`): Sonner's default style
 * (not `richColors`) with the destructive CircleX error icon, bottom-center
 * below 640px and bottom-right from 640px, at most 3 visible. Escape anywhere
 * dismisses the newest toast (a handler that `preventDefault`s Escape first,
 * such as Epic 2's inline edit, takes priority). Hovering or focusing the
 * toasts pauses the plain toasts' auto-dismiss timers.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const wide = useMediaQuery("(min-width: 640px)")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hover = useRef({ hovered: false, focused: false })
  const update = (patch: Partial<typeof hover.current>) => {
    hover.current = { ...hover.current, ...patch }
    setToastsPaused(hover.current.hovered || hover.current.focused)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return
      dismissNewestToast()
    }
    // A focused toast that is removed fires no blur; the next focusin
    // elsewhere (Sonner restores focus) ends the focus pause.
    function onFocusIn(event: FocusEvent) {
      const inside = !!wrapperRef.current?.contains(event.target as Node)
      if (inside !== hover.current.focused) {
        hover.current = { ...hover.current, focused: inside }
        setToastsPaused(hover.current.hovered || inside)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("focusin", onFocusIn)
      setToastsPaused(false)
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="contents"
      onMouseEnter={() => update({ hovered: true })}
      onMouseLeave={() => update({ hovered: false })}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          update({ focused: false })
        }
      }}
    >
      <Sonner
        theme="system"
        className="toaster group"
        position={wide ? "bottom-right" : "bottom-center"}
        visibleToasts={3}
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <CircleXIcon className="size-4 text-destructive" />,
          loading: <Loader2Icon className="size-4 animate-spin" />,
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
        toastOptions={{
          classNames: {
            toast: "cn-toast",
            actionButton: TOAST_ACTION_CLASS,
          },
        }}
        {...props}
      />
    </div>
  )
}

export { Toaster }
