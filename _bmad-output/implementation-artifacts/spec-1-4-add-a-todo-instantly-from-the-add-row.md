---
title: 'Story 1.4: Add a Todo instantly from the Add row, and never lose what I typed'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1c75798a6a88402953843cb9d03284c7095c0346'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The page shows the Todo List but gives no way to add a Todo, even though the `POST /api/v1/todos` endpoint from Story 1.3 exists.

**Approach:** Add the Add row (input, Add button, reserved counter line) above the list, and add the AD-12 write path. `createTodoMutation(kind)` in `todo-sync.ts` applies an optimistic create under a UUIDv7 generated in the browser. It confirms the Todo on success, or rolls back to the confirmed state with exactly one Sonner toast. For a create failure, that toast either restores the text to the box or offers Retry, which resends the same `id` and Description.

## Boundaries & Constraints

**Always:**
- Ids come from `v7()` in the `uuid` package (v14), never `crypto.randomUUID`.
- Before submitting, the client runs the shared `normalizeDescription`. An empty result does nothing: no request, no toast, and focus stays in the input. The POST body is `{ id, description: normalized }`.
- `http.ts` gets `createTodo(body)`, validated with `TodoSchema` (both 200 and 201 count as success).
- The write helper is a single `createTodoMutation(kind)` in `apps/web/src/api/todo-sync.ts`, with `scope: { id }`, following the AD-12 table exactly. `onMutate` records `generation(id)`, appends the op, and re-renders that id. `mutationFn` throws `DroppedError` with no fetch if the generation has changed. `onSuccess` sets `confirmed(id)`, removes the op, and re-renders. A `DroppedError` only removes the op. Any other error increments the generation, clears `pending(id)`, re-renders from `confirmed(id)`, and calls the kind's failure handler exactly once. The create kind is its first user, and Epic 2 adds more.
- Re-rendering writes only that one id into `['todos']`: replace, insert, or remove it, placed by `compareTodos`. The rendered state is `confirmed` with the pending ops applied. An optimistic create uses the client's current time as a provisional `createdAt`/`updatedAt`. Nothing calls `invalidateQueries`, and nothing restores a whole-list snapshot.
- The Add row is `<form>` → the `Input` (visually hidden label "New todo", placeholder "Add a todo…", `maxLength={DESCRIPTION_MAX}`, `todo-description` text, 44 px) → a primary "Add" `Button`, with a reserved 16 px counter line under the input.
  - The input and button are disabled while the list is Loading or in Load error.
  - The input gets focus once the list becomes Empty or Populated, but only if `(hover: hover) and (pointer: fine)` matches.
  - After a valid submit, the input clears and keeps focus.
- The counter shows "{n} / 500" in `meta` style, right-aligned under the input, from `COUNTER_THRESHOLD` characters of raw input length. It uses `text-destructive` at 500.
- A single polite, visually hidden live region (a small shared announcer that Epic 2 reuses) announces "Todo added" on a valid submit. It also announces "{n} / 500" when the counter first appears and again when it reaches 500.
- New rows appear at full opacity, and their height expands over 150 ms. The expansion is instant under `prefers-reduced-motion`. Rows that are already there don't animate on the initial load.
- The create failure handler checks the Add row input at the moment of failure:
  - If it's empty, the handler puts the failed Description back and shows a plain toast: "Couldn't add that todo. Your text is back in the box." Focus moves to the input only if `document.activeElement` is `<body>` or inside the Add row form.
  - If it has text, the handler leaves it alone and shows a persistent toast, "Couldn't add “{quote}”." (quote rule in Decisions), with a "Retry" action. Retry resends the original `id` and Description through the same mutation.
  - If `details` has `reason: "too_long"`, the toast copy is always "That todo is too long. The limit is 500 characters." instead, with the text-restore rule unchanged.
  - Every other failure kind (`NETWORK`, `INTERNAL`, `UNAVAILABLE`, `CONFLICT`, other `VALIDATION_ERROR`s) uses the empty-input or busy-input copy. The API's `message` is never shown.
- Toasts come from one `<Toaster>` mounted in `AppProviders`, using the shadcn `sonner.tsx` wrapper:
  - Default style, not `richColors`. The error icon is lucide `CircleX` in `text-destructive`, and each toast has `role="status"`.
  - Position: `bottom-center` below 640 px, `bottom-right` from 640 px.
  - Plain toasts last 8 s and pause on hover or focus. Toasts with Retry use `duration: Infinity`.
  - At most 3 are visible (`visibleToasts={3}`). Pressing Escape anywhere dismisses the newest toast.

**Never:**
- No checkbox, row actions, edit, toggle, or delete (Epic 2). No API or shared-package changes beyond importing `normalizeDescription`.
- No automatic retries, no browser storage, no `dangerouslySetInnerHTML`. A pending Todo must look exactly like a confirmed one.

**Decisions:**
- **Restored text** is the normalized Description that was sent, not the raw keystrokes.
- **"Todo added"** is announced on submit (optimistic), not when the server confirms.
- **The counter's own element** is `aria-hidden`. Announcements go only through the live region, so screen readers don't hear the counter on every keystroke.
- **Quoted text in the Retry toast** (human decision): quote the Description as-is when it has 40 characters or fewer ("Couldn't add “Buy milk”."). When it's longer, quote the first 40 characters followed by "…".
- **Retry toast lifecycle:** clicking Retry dismisses that toast. If the retry fails again, the failure rules apply again, using the input state at that moment.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | Populated list, type "Buy milk", press Enter | The row is at the top before the fetch resolves; the input is empty and focused; "Todo added" is announced; POST `{id: <v7>, description:"Buy milk"}` | N/A |
| Add by button | Type "  a  ", click Add | Same as Add, with description "a" | N/A |
| Confirmed | The server returns a Todo with a different `createdAt` | The row shows the server's values, re-placed by `compareTodos`; the other rows are untouched | N/A |
| Empty submit | `""` or `"   "`, press Enter | No fetch, no toast, no row; focus stays in the input | N/A |
| Disabled | The list is Loading or in Load error | The input and Add are disabled | N/A |
| Counter | 449 → 450 → 500 characters typed | Hidden at 449; "450 / 500" at 450, announced; destructive "500 / 500" at 500, announced; the list doesn't move | N/A |
| Fail, input empty | NETWORK, 10 s timeout, 5xx, or non-envelope; the input is still empty | The row is removed; the text is back in the input; focus goes to the input if it was on `<body>` or the Add row; one plain toast with the restore copy | Toast auto-dismisses after 8 s |
| Fail, input busy | The user typed "new" before the failure | "new" is kept; the row is removed; one persistent toast quoting the failed text, with Retry | Retry → the row reappears, and POST uses the same `id` and text |
| Too long | 400 with `details:[{reason:"too_long"}]` | Toast copy "That todo is too long. The limit is 500 characters."; the text-restore rule applies | N/A |
| Other Todos | Another Todo was added, then this one fails | Only the failed row is removed; the other stays | N/A |
| Dropped op | Two queued ops for one id; the first fails | The second throws `DroppedError` with no fetch and no second toast | N/A |
| Escape | Two toasts visible, press Escape | The newest is dismissed | N/A |

</frozen-after-approval>

## Code Map

Reuse Story 1.2's data layer; extend it rather than restructuring.

- `apps/web/src/api/todo-sync.ts` (+ `todo-sync.test.ts`) -- today it has the three maps, `seedFromList`, and `getTodoSync(queryClient)` as a per-client `WeakMap`. `PendingOp` is `{ kind: string }`. Add the concrete create op, the one-id re-render, `DroppedError`, and `createTodoMutation(kind)` (returning `useMutation` options or a hook).
- `apps/web/src/api/http.ts` (+ `http.test.ts`) -- `request()` already handles the body, content type, timeout, and classification. Add `createTodo`.
- `apps/web/src/api/hooks/use-create-todo.ts` -- new: the create hook built on `createTodoMutation('create')`.
- `apps/web/src/api/query-client.ts` -- `TODOS_QUERY_KEY`, pinned defaults (mutations: `retry: false`, `networkMode: 'always'`). Don't change it.
- `apps/web/src/features/todos/add-row.tsx`, `character-counter.tsx`, and a create-failure toast module -- new UI. The failure handler needs access to the Add row input (read, set, focus, contains-focus), for example through a small controller the Add row registers.
- `apps/web/src/features/todos/todo-list.tsx` -- render `<AddRow/>` above the list region, passing the query status. `todo-row.tsx` gets the entrance animation.
- `apps/web/src/lib/announcer.tsx` -- new polite live region plus `announce(text)`.
- `apps/web/src/components/ui/sonner.tsx`, `apps/web/src/app-providers.tsx` -- mount the configured `<Toaster>` once. `sonner` 2.0 is already installed; `components/ui/input.tsx` is missing, so run `pnpm dlx shadcn@4.21.0 add input`.
- `apps/web/package.json` -- add `uuid@^14`.
- `apps/web/src/test/{render.tsx,setup.ts}` -- `renderWithProviders`, `jsonResponse`, `makeTodo`, `fakeAbortSignalTimeout`, the microtask `notifyManager`, and the `ResizeObserver` stub. Reuse them, and add a `matchMedia` stub if jsdom lacks one.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/package.json` + `components/ui/input.tsx` -- add `uuid@^14` and the shadcn Input.
- [x] `apps/web/src/api/http.ts` (+ test) -- `createTodo`. Test both 201 and 200 as success, and that the body and content type are sent.
- [x] `apps/web/src/api/todo-sync.ts` (+ test) -- the create op, the one-id re-render, `DroppedError`, and `createTodoMutation`. Unit-test the AD-12 table: success confirms; failure rolls back only that id with exactly one handler call; a changed generation drops with no fetch; no `invalidateQueries`.
- [x] `apps/web/src/api/hooks/use-create-todo.ts` -- the create hook.
- [x] `apps/web/src/lib/announcer.tsx`, `features/todos/{add-row,character-counter}.tsx`, the create-failure toast module, and `todo-list.tsx`/`todo-row.tsx` -- the UI per Boundaries.
- [x] `apps/web/src/components/ui/sonner.tsx` + `app-providers.tsx` -- the configured Toaster and the Escape handler.
- [x] `apps/web/src/features/todos/add-row.test.tsx` -- Testing Library tests for every matrix row except Dropped op, which `todo-sync.test.ts` covers. Use stubbed `fetch`, fake timers for the 8 s and 10 s cases, and assert the exact request bodies (including the same `id` on Retry) and the exact copy.

**Acceptance Criteria:**
- Given the dev stack, when I add a Todo and reload the page, then it's still at the top with its server timestamps, and the console has no errors.
- Given the dev stack with `db` stopped, when I add "Buy milk", then the row disappears, the text is back in the input, and one toast shows the restore copy.
- Given the repo, when I run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test`, then all exit 0 with no tests skipped.

## Implementation Notes

- `scope` is a per-mutation option in TanStack Query, and every create has a new id. So `createTodoMutation(kind, config)` builds the options for each write (`options(queryClient, vars)`) and runs them through a `MutationObserver`. The pinned defaults still apply. `mutationFn` does not receive `onMutate`'s result, so the generation recorded in `onMutate` is kept in a closure for each write.
- `PendingOp` now has `apply(previous) => Todo | null`, and `createOp` is the first op. The failure payload includes `retry()`, which re-runs the same mutation with the same variables.
- `useTodosQuery` sets `structuralSharing: false` (this is not one of the pinned defaults). Without it, index-based sharing copies every row after an inserted or removed id, and all the memoized rows re-render.
- Sonner pauses its own timer on hover but not on focus. Plain toasts therefore use `duration: Infinity`, and `lib/toast.tsx` dismisses them after 8 s. The Toaster pauses that timer while the toasts are hovered or focused. Escape is ignored when it was `defaultPrevented`, so Epic 2's inline edit can take priority.
- `role="status"` is on each toast's message element, because Sonner has no role prop. The announcer is a live region with no role, so it doesn't collide with that. `announce()` lives in `lib/announce.ts` because of the react-refresh lint rule.
- In the create failure handler, a whitespace-only input counts as empty. With no Add row mounted, the persistent Retry toast is shown.

- **Review pass 1:** applied triage rows 1–5 as patches. The Add row controller now reads a synchronous `valueRef`, so two failures in the same tick keep the first text (restored) and give the second a Retry toast. Retry announces "Todo added". The `todo-list.tsx` focus comment is corrected. New tests pin `structuralSharing: false` (other rows keep their objects) and the Toaster position switch at 640 px. Re-verified: lint/typecheck/build exit 0; 230 tests pass (shared 25, API 107, web 98), none skipped. The two dev-stack acceptance criteria (add + reload; add with `db` stopped) have not been checked in a browser.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge | Two creates failing in the same tick: the busy check reads the DOM input, which is still empty before React re-renders, so the second restore overwrites the first and the first text is lost with no Retry | high | Probe: add "First", add "Second", reject both fetches in one `act` → input "Second", two restore toasts, no Retry; "First" is gone | patch |
| 2 | verification-gap | Removing `structuralSharing: false` from `useTodosQuery` would not fail any test | medium | Pre-verified: `todo-sync.test.ts` sets the option itself; `add-row.test.tsx` compares keyed DOM nodes | patch |
| 3 | verification-gap + blind | No test checks the Toaster position switch at 640 px | medium | Pre-verified: no test reads `data-x-position`/`data-y-position` | patch |
| 4 | blind | Clicking Retry re-adds the row without announcing "Todo added" | low | `create-failure.ts` Retry path calls only `retry()`; submit path calls `announce` | patch |
| 5 | blind | After Load error → Try again → success, the input takes focus from the list region on hover pointers | low | This follows the frozen rule ("The input gets focus once the list becomes Empty or Populated") and EXPERIENCE.md:96; focus is never lost to `<body>`. Only the `todo-list.tsx` doc comment ("focus then stays there") is now stale | patch (comment only) |
| 6 | blind + edge | Retry is offered for `too_long`, other validation errors, and 409, which always fail again; a busy-input `too_long` toast neither quotes nor restores the text | low | Unreachable from the UI: `maxLength=500` on raw input and normalization only shortens; the client never reuses an id with different text. The frozen rule keeps the restore/Retry split for `too_long` | reject |
| 7 | blind | A persistent Retry toast closed with Escape or its close button loses the failed text | false | EXPERIENCE.md:84: Retry toasts stay "until the user acts on them or dismisses them"; dismissing is the user's choice | reject |
| 8 | blind | `role="status"` inside Sonner's `aria-live` section may double-announce | maybe-false | Required by the frozen spec and EXPERIENCE.md:146; would need a screen-reader check. If true, only `low` | reject |
| 9 | blind + edge | Settled mutations stay in the MutationCache for the session (`gcTime: Infinity`) | low | Pinned AD-6 default; about one small object per add, bounded by NFR-1's 1,000 Todos | reject |
| 10 | blind | Restoring a Description of 450+ characters shows the counter without announcing it | low | Needs a failed create of 450+ characters; fix threads the announcement through the controller | reject |
| 11 | blind + edge | Escape is global: it dismisses the newest toast even from the input, or while a hover tooltip is open | low | EXPERIENCE.md:120-122 makes Escape dismiss the newest toast unless an inline edit is open; tooltips open only on hover | reject |
| 12 | blind | Module-level Add-row controller singleton; the no-controller branch is untested | low | Exactly one Add row exists; fix is a refactor | reject |
| 13 | blind | Untested: a toast created while paused; `quoteDescription` can split a ZWJ emoji | low | Cosmetic or rare; the paused-start branch is a one-line `if` | reject |
| 14 | blind | The quote counts code points while the counter counts UTF-16 units, with no comment | low | Cosmetic; no user-visible conflict | reject |
| 15 | blind | The spec and sprint status aren't in the diff | false | The blind layer gets only the code diff by design; the spec exists | reject |
| 16 | edge | A focused toast removed (e.g. mouse-clicked Retry) fires no blur, so plain-toast timers stay paused | low | The next focus change (focusing the input, which any new add needs) fires `focusin` and ends the pause, before another plain toast can appear | reject |
| 17 | edge | A hovered toast removed under the pointer may leave `hovered` stuck true | maybe-false | Depends on the browser firing `mouseleave` for a `display: contents` wrapper after the node is removed; would need a real-browser check. If true, only `low` (the next pointer move off the region clears it) | reject |
| 18 | edge | Double-clicking Retry during the exit animation queues two creates for one id | low | Same id and text: the second is an idempotent `200` replay and the create op is a no-op over a confirmed Todo; no visible effect | reject |

## Design Notes

The create failure handler is the only part that needs UI state inside the mutation layer. Keep `todo-sync.ts` free of React and DOM code: the kind config passes `{ id, description, error }` to a handler, and the handler, owned by the feature, reads the Add row through its registered controller. For example:

```ts
createTodoMutation("create", {
  request: (op) => createTodo({ id: op.id, description: op.description }),
  onFailure: ({ op, error }) => showCreateFailure(op, error), // feature-owned
})
```

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: all exit 0
- `docker compose up -d --wait && pnpm test` -- expected: all shared, API, and web tests pass, with none skipped
- `grep -rn "invalidateQueries\|randomUUID\|dangerouslySetInnerHTML" apps/web/src` -- expected: no matches outside comments

**Manual checks:**
- In the dev stack at `localhost:${WEB_PORT}`, add a Todo, reload, stop `db`, add another, and check the rollback and the toast. Check that the counter appears at 450 without moving the list.
