import { useEffect, useId, useRef, useState } from "react"
import { v7 as uuidv7 } from "uuid"
import { DESCRIPTION_MAX, normalizeDescription } from "@todos/shared"

import { useCreateTodo } from "@/api/hooks/use-create-todo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { announce } from "@/lib/announce"
import { HOVER_POINTER_QUERY, matchesMedia } from "@/lib/use-media-query"

import { CharacterCounter } from "./character-counter"
import { counterAnnouncement } from "./counter-announcement"
import { registerAddRowController, showCreateFailure } from "./create-failure"

/**
 * The Add row: a `<form>` with the "New todo" input and the primary "Add"
 * button, plus the reserved counter line. Enter or Add submits the
 * normalized Description (an empty result does nothing), the row appears at
 * once, the input clears and keeps focus, and "Todo added" is announced.
 * Disabled while the list is Loading or in Load error; focused when the list
 * becomes Empty or Populated on hover-capable fine pointers only.
 */
export function AddRow({
  status,
}: {
  status: "pending" | "error" | "success"
}) {
  const inputId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValueState] = useState("")
  // The current value, synchronously: two failures in one tick must see the
  // first restore before React re-renders.
  const valueRef = useRef("")
  const setValue = (next: string) => {
    valueRef.current = next
    setValueState(next)
  }
  // The last restored failure (see `AddRowController.restore`); cleared by
  // the next submit, replaced by a newer restore.
  const restoredRef = useRef<{ id: string; description: string } | null>(null)
  const disabled = status !== "success"
  const createTodo = useCreateTodo(showCreateFailure)

  useEffect(
    () =>
      registerAddRowController({
        getValue: () => valueRef.current,
        restore: (description, id) => {
          restoredRef.current = { id, description }
          valueRef.current = description
          setValueState(description)
        },
        focus: () => inputRef.current?.focus(),
        containsFocus: () =>
          !!formRef.current?.contains(document.activeElement),
      }),
    []
  )

  useEffect(() => {
    if (status === "success" && matchesMedia(HOVER_POINTER_QUERY)) {
      inputRef.current?.focus()
    }
  }, [status])

  function handleChange(next: string) {
    const message = counterAnnouncement(value.length, next.length)
    setValue(next)
    if (message) announce(message)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    inputRef.current?.focus()
    if (disabled) return
    const description = normalizeDescription(value)
    if (!description) return
    const restored = restoredRef.current
    restoredRef.current = null
    const id =
      restored && restored.description === description ? restored.id : uuidv7()
    createTodo({ id, description })
    setValue("")
    announce("Todo added")
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mb-list-gap">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <label htmlFor={inputId} className="sr-only">
            New todo
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            type="text"
            autoComplete="off"
            placeholder="Add a todo…"
            maxLength={DESCRIPTION_MAX}
            value={value}
            disabled={disabled}
            onChange={(event) => handleChange(event.target.value)}
            className="h-(--spacing-touch-target) px-3 text-(length:--text-todo-description) leading-(--text-todo-description--line-height) md:text-(length:--text-todo-description)"
          />
          <CharacterCounter length={value.length} />
        </div>
        <Button
          type="submit"
          disabled={disabled}
          className="h-(--spacing-touch-target) min-w-(--spacing-touch-target) px-4"
        >
          Add
        </Button>
      </div>
    </form>
  )
}
