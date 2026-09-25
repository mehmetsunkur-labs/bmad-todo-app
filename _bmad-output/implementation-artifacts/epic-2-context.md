# Epic 2 Context: Manage my todos: edit, complete, and delete

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the user the rest of the everyday Todo lifecycle on top of Epic 1's list-and-add slice. They can fix a Description inline, mark a Todo done and back again, and delete Todos. Every change shows within 100 ms, changes to the same Todo apply in order, and a failed change rolls back only that Todo to its last server-confirmed state with exactly one message. The epic adds the PATCH and DELETE API. It also finishes the generic `todo-sync` write helper, which Epic 1 built only for create, so edit, toggle and delete share one rollback and cancellation protocol instead of each inventing its own.

## Stories

- Story 2.1: Update and delete Todos through the API
- Story 2.2: Complete and un-complete a Todo
- Story 2.3: Delete a Todo
- Story 2.4: Edit a Todo's Description inline

## Requirements & Constraints

- **Toggle:** one click, tap or Space toggles in both directions and shows within 100 ms. The Todo keeps its position, Completed Todos are never re-sorted, and the change persists across reload. Completed status is shown by three cues (checked box, line-through, muted text), never by color alone, and is exposed to assistive technology.
- **Delete:** a visible Delete control, reachable by keyboard, with no confirmation and no undo. The row is gone within 100 ms and stays gone after reload.
- **Edit:** inline, for Active and Completed Todos. Enter or blur saves, Escape cancels. The Add row's validation applies (500-character cap, counter from 450). Empty or unchanged text cancels with no request and never deletes. A save updates Updated At. Created At and position never change.
- **Failure (network, 10 s timeout, 5xx, non-envelope):** the affected Todo returns to its last confirmed state, and exactly one non-blocking message appears. Ops queued after a failed op on the same Todo are dropped silently. A failed edit keeps the attempted text, either in reopened edit mode or in a Retry toast. The API `message` is never shown.
- **Concurrency:** writes from several tabs are last-write-wins, with no crashes or corrupted rows. No acknowledged change is ever lost.
- **API:** unknown id returns not found, invalid input writes nothing, there are no partial writes, and every single-Todo write is one statement.
- **Testing:** API tests cover every PATCH/DELETE case. Web tests include `todo-sync` race cases: double toggle, toggle while a create is pending and the create fails, and delete during a pending edit. Every UI story also gets a Playwright check against the dev stack before merge. (As built: with no e2e harness until Epic 3, Stories 2.2–2.4 ran this as a manual real-browser check, Chromium via playwright-core against the dev stack. Story 3.3's `pnpm test:e2e` suite now covers these flows.)

## Technical Decisions

- **PATCH `/api/v1/todos/:id`:** body `{ description?, completed? }` with at least one key, strict schema. A missing key means unchanged. `{}`, `null` values or unknown keys return `400 VALIDATION_ERROR` with `details`. Success is `200` with the Todo. The Description is normalized as in create (line breaks become spaces, then trim, 1–500 UTF-16 units). `updated_at = now()` only when a value actually changes. A no-op PATCH returns the stored Todo unchanged. Unknown id returns `404 NOT_FOUND`.
- **DELETE `/api/v1/todos/:id`:** `204`, no body. Unknown id returns `404`, which the client treats as success.
- **Create replay once edit and delete exist (settled decision):** the replay compares against the *stored* Description. A late create Retry for a Todo since edited elsewhere gets `409`, and the client shows the add failure. A late create Retry for a Todo since deleted re-creates it (`201`), because Retry means "make this Todo exist". Pin both with API tests. No schema change.
- **Write helper (`createTodoMutation(kind)`):** `kind` is the typed union `'create' | 'edit' | 'toggle' | 'delete'`. Every write uses `scope: { id }`. `onMutate` appends to `pending` and re-renders that id. A changed generation throws `DroppedError` with no network call. On success, `confirmed(id)` is set to the returned Todo, or to `null` after delete. On a real failure, the helper increments the generation, clears pending, applies the kind's failure mapping to `confirmed` (a PATCH `404` maps to `null`, which removes the row), re-renders, and raises exactly one toast carrying any Retry payload. Only `todo-sync.ts` writes sync state. Feature code never does.
- **Seeding:** a successful list fetch seeds `confirmed`. The rendered list is each listed Todo with its pending ops re-applied, plus pending creates not yet listed. Seeding never sets an id with pending ops to `null`.
- **`http.ts` and 204:** a `204` is never parsed and resolves to a typed `null`. A `204` on a call that expects a body is classified `INTERNAL`.
- **Cache rules still apply:** every cache write replaces or removes one id and re-places it by `compareTodos`. There is no whole-list snapshot restore and no `invalidateQueries`.
- **Retry:** an edit Retry resends the original PATCH, and a create Retry resends the original id and Description.

## UX & Interaction Patterns

- **Row layout:** Completion checkbox, then Description with Created At below it, then Row actions (Edit, then Delete). Controls align with the first line of the Description. Tab order within a row: checkbox, Edit, Delete.
- **Completion checkbox:** shadcn/Radix, 16 px in a 44 px hit area, filled with primary when checked. Its accessible name is the Description and doesn't change on toggle.
- **Row actions:** ghost buttons with lucide `Pencil` and `Trash2` icons (16 px, 44 px hit areas) in `muted-foreground`. On hover or focus, Edit turns `foreground` and Delete turns `destructive`. Names are "Edit todo: {Description}" and "Delete todo: {Description}". On `(hover: hover) and (pointer: fine)` they sit at opacity 0 (still tabbable) until the row is hovered or has focus inside it. Otherwise they are always visible. Visibility depends on input capability, not width.
- **Inline edit:** an auto-growing Textarea replaces the Description in place, pre-filled with all text selected. It opens from Edit, or by double-click on fine-pointer hover devices only. Enter always saves, and pasted line breaks become spaces. Created At and the Row actions stay visible. Only one edit is open at a time, and opening another commits the first. Escape cancels and returns focus to Edit. Escape cancels an open edit before it dismisses a toast.
- **Delete motion and focus:** the row fades within 100 ms, then collapses over 150 ms (instant with reduced motion). Focus moves to the next row's checkbox, else the previous row's, else the Add input. Deleting the last Todo shows the Empty state without a layout jump.
- **Failure copy and focus:**
  - Toggle: "Couldn't update that todo. Please try again." Focus doesn't move.
  - Delete: "Couldn't delete that todo. Please try again." The row returns to its original position. If the delete had moved focus, focus returns to the restored row's checkbox.
  - Edit, no other edit open: the row reopens with the attempted text, and the toast says "Couldn't save your edit. Please try again." The field takes focus only if focus was on `<body>` or that row.
  - Edit while another edit is open: the row shows its confirmed text, and a persistent toast says "Couldn't save your edit to “{quote}”." with Retry. {quote} is the text as-is at 40 characters or fewer, otherwise its first 40 characters and "…". An edit `404` uses this toast and removes the row.
  - `too_long`: "That todo is too long. The limit is 500 characters."
  - Plain toasts auto-dismiss after 8 s, and Retry toasts persist. A pending Todo looks identical to a confirmed one.
- **Announcements:** the polite live region says "Marked as done", "Marked as not done", "Todo deleted" and "Todo updated".
- **Not allowed:** confirmation dialogs, modals, undo, swipe or long-press gestures, and celebratory animations.

## Cross-Story Dependencies

- 2.1 (PATCH/DELETE API) must land before 2.2–2.4.
- 2.2 is the first non-create write kind. It generalizes the `todo-sync` helper: the failure-path mapping to `confirmed`, seeding that re-applies pending ops, and the typed `kind`. 2.3 and 2.4 reuse all of this.
- 2.3 adds 204 → `null` in `http.ts`, and delete success depends on it. 2.3 also adds the Row actions container and hover-reveal behavior, and 2.4 adds Edit before Delete in it.
- 2.4's delete-during-pending-edit race test depends on 2.3.
- All of Epic 2 builds on Epic 1's row component, `http.ts`, `todo-sync.ts`, `createTodoMutation`, toast setup, live-region helper and shared test helpers. The Retry quote rule matches Story 1.4's.
- Epic 3's Playwright suite will cover edit, toggle, delete and rollback end to end.
