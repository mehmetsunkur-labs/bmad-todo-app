import { useLayoutEffect, useRef, useState } from "react"
import { DESCRIPTION_MAX } from "@todos/shared"

import { Textarea } from "@/components/ui/textarea"
import { announce } from "@/lib/announce"

import { CharacterCounter } from "./character-counter"
import { counterAnnouncement } from "./counter-announcement"

/** How a save was requested: Enter, or the field losing focus. */
export type EditSaveTrigger = "enter" | "blur"

const LINE_BREAK = /\r\n|\r|\n/g

/**
 * The inline edit field: an auto-growing Textarea in `todo-description`
 * style at the Description's left edge, one row high and growing to fit its
 * content, with the Add row's 500-character cap and counter.
 *
 * - On mount (with `autoFocus`) it takes focus with all text selected.
 * - Every line break in the value (typed or pasted) becomes a space; Enter
 *   never inserts one.
 * - Enter saves (`onSave(value, "enter")`), blur saves
 *   (`onSave(value, "blur")`), Escape cancels (`onCancel()`) and
 *   `preventDefault`s so the Toaster doesn't also dismiss a toast.
 * - Switching away from the window blurs without saving.
 * - Closing sets a flag first: the blur some browsers fire when the focused
 *   field is removed never saves a second time, or after Escape.
 */
export function EditField({
  initialText,
  label,
  autoFocus,
  onSave,
  onCancel,
  onChange,
}: {
  initialText: string
  label: string
  autoFocus: boolean
  onSave: (text: string, how: EditSaveTrigger) => void
  onCancel: () => void
  /** The field's text after each change. */
  onChange?: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialText)
  const closing = useRef(false)
  // The caret to restore after a line break is replaced (React would move it
  // to the end).
  const caret = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!autoFocus) return
    ref.current?.focus()
    ref.current?.select()
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // `scrollHeight` excludes the border; the height (border-box) includes it.
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    if (caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  }, [value])

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = event.target.value
    const next = raw.replace(LINE_BREAK, " ")
    // Only when React re-renders (the value changes) is the caret restored;
    // otherwise a stale caret would land on a later change.
    if (next !== raw && next !== value) {
      const before = raw.slice(0, event.target.selectionStart ?? raw.length)
      caret.current = before.replace(LINE_BREAK, " ").length
    }
    const message = counterAnnouncement(value.length, next.length)
    setValue(next)
    onChange?.(next)
    if (message) announce(message)
  }

  function close(action: () => void) {
    if (closing.current) return
    closing.current = true
    action()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Safari confirms an IME composition with Enter as keyCode 229.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === "Enter") {
      event.preventDefault()
      close(() => onSave(value, "enter"))
    } else if (event.key === "Escape") {
      event.preventDefault()
      close(onCancel)
    }
  }

  return (
    <div className="flex flex-col">
      <Textarea
        ref={ref}
        rows={1}
        aria-label={label}
        maxLength={DESCRIPTION_MAX}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Leaving the window (alt-tab) keeps the edit; focus comes back.
          if (!document.hasFocus()) return
          close(() => onSave(value, "blur"))
        }}
        className="min-h-0 resize-none overflow-hidden rounded-none border-0 border-b bg-transparent px-0 py-0 text-(length:--text-todo-description) leading-(--text-todo-description--line-height) wrap-anywhere focus-visible:ring-0 md:text-(length:--text-todo-description) dark:bg-transparent"
      />
      <CharacterCounter length={value.length} />
    </div>
  )
}
