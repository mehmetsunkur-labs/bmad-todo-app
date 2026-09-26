import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { QueryClient } from "@tanstack/react-query"
import type { Todo } from "@todos/shared"

import { TODOS_QUERY_KEY } from "@/api/query-client"

import { focusAddRow } from "./create-failure"
import { checkboxOf, firstCheckbox } from "./list-dom"
import type { DisplayedRow, LatestRender } from "./use-exiting-rows"

/**
 * Where focus goes when the row `id` leaves the list (Story 2.3's rule),
 * from the display order before the removal: the next non-exiting rows,
 * then the previous ones, nearest first. The first one still rendered takes
 * focus; none means the Add input.
 */
export function removalFocusTargets(
  shown: readonly DisplayedRow[],
  id: string
): string[] {
  const index = shown.findIndex((row) => row.todo.id === id)
  const live = (row: DisplayedRow) => !row.exiting && row.todo.id !== id
  return [
    ...shown.slice(index + 1).filter(live),
    ...shown.slice(0, Math.max(index, 0)).reverse().filter(live),
  ].map((row) => row.todo.id)
}

/**
 * The list's focus handling after the commit, in one layout effect:
 * - a focused, non-exiting row left the list (a `404`, a failed create):
 *   focus moves by the delete rule, from the order before the removal;
 * - a failed delete's focus restore waits for the restored row to render.
 *
 * Owns the list region's ref. `handleFocusedRemoval` and `requestRowFocus`
 * are stable.
 */
export function useListFocus({
  latest,
  queryClient,
}: {
  latest: RefObject<LatestRender>
  queryClient: QueryClient
}) {
  const regionRef = useRef<HTMLDivElement>(null)
  // A failed delete's focus restore waits for the restored row to render.
  const focusRowId = useRef<string | null>(null)
  // A focused row's removal: the row and its focus targets, resolved after
  // the commit.
  const focusRemoval = useRef<{
    row: HTMLElement
    targets: string[]
  } | null>(null)
  const [, setFocusRequest] = useState(0)

  useLayoutEffect(() => {
    const removal = focusRemoval.current
    focusRemoval.current = null
    // Only a row really gone (not StrictMode's simulated unmount), and only
    // while its focus hasn't gone anywhere else.
    const active = document.activeElement
    if (
      removal &&
      !removal.row.isConnected &&
      (!active || active === document.body)
    ) {
      const box = firstCheckbox(regionRef.current, removal.targets)
      if (box) box.focus()
      else focusAddRow()
    }
    const id = focusRowId.current
    if (id === null) return
    const box = checkboxOf(regionRef.current, id)
    if (box) {
      focusRowId.current = null
      box.focus()
      return
    }
    const cached = queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY)
    if (!cached?.some((todo) => todo.id === id)) focusRowId.current = null
  })

  // A focused, non-exiting row left the list (a `404`, a failed create):
  // focus moves by the delete rule, after the commit.
  const handleFocusedRemoval = useCallback(
    (id: string, row: HTMLElement) => {
      focusRemoval.current = {
        row,
        targets: removalFocusTargets(latest.current.rows, id),
      }
      setFocusRequest((n) => n + 1)
    },
    [latest]
  )

  // Focus the row's checkbox once it renders (a failed delete's restore).
  const requestRowFocus = useCallback((id: string) => {
    focusRowId.current = id
    setFocusRequest((n) => n + 1)
  }, [])

  return { regionRef, handleFocusedRemoval, requestRowFocus }
}
