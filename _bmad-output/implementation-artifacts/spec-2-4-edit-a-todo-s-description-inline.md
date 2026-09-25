---
title: "Story 2.4: Edit a Todo's Description inline"
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'c5a4b058f26ca7a3e936c22c8f05edeecf701f05'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      When an edit's PATCH 404 removes the row, focus (for example on its Edit button after an Enter save) falls to <body>.
    evidence: |-
      Same root cause as the Story 2.2 toggle residual in _bmad-output/implementation-artifacts/deferred-work.md: row removal by a 404 has no focus-after-removal handling. EXPERIENCE.md says focus is never lost to <body>. The fix should reuse Story 2.3's rule (next row's checkbox, else the previous row's, else the Add input) for any removal of a focused row.
    location: >-
      apps/web/src/features/todos/edit-failure.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** A typo in a Todo can only be fixed by deleting it and adding it again.

**Approach:** Add an Edit button, before Delete, to each row's actions. It opens an inline, auto-growing Textarea in place of the Description. Enter or blur saves through an edit hook on `createTodoMutation("edit")` that sends `PATCH { description }`. Escape cancels. Failures follow the two UX branches: reopen the field, or show a Retry toast.

## Boundaries & Constraints

**Always:**
- **Edit button:** a ghost `Button` with lucide `Pencil` at 16 px in a 44 px hit area, `muted-foreground`, turning `foreground` on hover or focus-visible. Its name is exactly `Edit todo: {Description}`, and it sits before Delete, so the tab order is checkbox, Edit, Delete. It is in the same Row actions container, so it gets the same capability-driven visibility.
- **Opening edit mode:** from Edit on any device, or by double-clicking the Description only when `useMediaQuery(HOVER_POINTER_QUERY)` matches.
  - The Textarea takes the Description's place, in `todo-description` style at the same left edge. It is pre-filled with the rendered Description, focused, all text selected, one row high and growing to fit its content.
  - Created At, the checkbox and the Row actions stay visible.
- **One edit at a time:** opening another edit commits the open one (its blur).
- **Typing:** `maxLength=500`. Every line break in the value (typed or pasted) becomes a space. Enter never inserts a line break. The `CharacterCounter` and its announcements match the Add row.
- **Saving:** normalize with `normalizeDescription`. If the result is empty or equals the rendered Description, cancel with no request.
  - Otherwise apply the edit op in the same tick, announce "Todo updated" and close the field.
  - An Enter save returns focus to that row's Edit button. A blur save leaves focus where it went.
  - The Todo keeps its position.
- **Escape while editing:** `preventDefault` (so the Toaster doesn't dismiss a toast), cancel, restore the Description, and focus that row's Edit button. The blur caused by closing must not save.
- **Sync state:** only `todo-sync.ts` writes it. The API `message` is never shown.

**Never:** No multi-line Descriptions. No edit for exiting rows. No API or shared-schema change. No confirmation or undo. No focus handling for a row removed by a 404 (still logged in `deferred-work.md`). No change to the create, toggle or delete behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | click Edit | Textarea shows the Description, all selected, focused. Checkbox, Created At and Row actions stay | — |
| Double-click | hover device / touch device | Opens / doesn't open | — |
| Save Enter | text `" Buy  oat\nmilk "` | `PATCH /api/v1/todos/{id}` `{"description":"Buy  oat milk"}`. Row shows it at once, same index. "Todo updated". Focus on Edit | — |
| Save blur | click elsewhere after changing text | Same PATCH and optimistic update. Focus stays where it went | — |
| Paste | pasted `"a\r\nb\nc"` | Field value `"a b c"` | — |
| No-op | empty or whitespace, or unchanged text | Field closes with no request and no announcement. The Todo is not deleted | — |
| Escape | Escape with a toast visible | Edit canceled, Description restored, focus on Edit, toast still visible. The next Escape dismisses the toast | — |
| Switch | A open, open B | A is committed (saved if changed), then B opens | — |
| Fail, none open | PATCH fails (network, timeout, 5xx, non-envelope), no edit open | Row reopens edit with the attempted (sent) text, focused only if focus is on `<body>` or inside that row. One plain toast: "Couldn't save your edit. Please try again." | helper rollback |
| Fail, other open | PATCH fails while another row (or this row again) is being edited | Row shows its confirmed Description. One persistent toast: "Couldn't save your edit to “{quote}”." with Retry (quote = `quoteDescription` of the sent text). Retry resends the same PATCH and announces "Todo updated" | helper rollback |
| 404 | PATCH → `404 NOT_FOUND` | `confirmed = null`, row removed, and the Retry toast from "Fail, other open" | `notFoundMeansDeleted` |
| too_long | `400` with a `too_long` detail | Same branch as the two rows above, but the copy is "That todo is too long. The limit is 500 characters." | `isTooLong` |
| Edit then delete | edit pending, then Delete | The DELETE is sent after the PATCH settles. If the PATCH fails, the DELETE is dropped with no fetch, and exactly one (edit) toast appears | `DroppedError` |

</intent-contract>

## Code Map

- `apps/web/src/features/todos/todo-row.tsx`:
  - The memoized row (Stories 2.2/2.3). Put the Description `<p id={descriptionId}>` (the checkbox is `aria-labelledby` it) and `CreatedAt` in the middle column.
  - The Row actions `div data-testid="row-actions"` holds the Delete `Button`. The styling pattern for Edit is at L116-125.
  - `hoverPointer` comes from `useMediaQuery(HOVER_POINTER_QUERY)`.
- `apps/web/src/features/todos/todo-list.tsx`:
  - Owns the hooks (`useToggleTodo`, `useDeleteTodo`), the exiting rows, `handleDelete`, and the `registerDeleteFocusController` pattern.
  - Edit-open state belongs here: one open edit per list.
- `apps/web/src/features/todos/add-row.tsx`: `counterAnnouncement` (L148) is the counter-announce rule to share. `handleSubmit` is the normalize/empty pattern.
- `apps/web/src/features/todos/character-counter.tsx`: the counter to reuse.
- `apps/web/src/features/todos/create-failure.ts`: reuse `quoteDescription`, `isTooLong`, `TOO_LONG_COPY` and `RETRY_LABEL`. The controller-registration pattern (`registerAddRowController`) and the focus-only-if-free rule are there too.
- `apps/web/src/api/hooks/use-toggle-todo.ts`: the hook pattern, using `updateTodo`, `notFoundMeansDeleted` and `toggleOp`.
- `apps/web/src/api/todo-sync.ts`: `toggleOp` is the op pattern for `editOp`. `TodoMutationFailure.retry` resends the same vars.
- `apps/web/src/components/ui/sonner.tsx` L33: the Toaster's Escape handler returns early when `event.defaultPrevented`, so the field must `preventDefault`.
- `apps/web/src/components/ui/input.tsx`: shadcn style reference for a new `textarea.tsx`.
- Tests:
  - `apps/web/src/features/todos/todo-delete.test.tsx` and `todo-row.test.tsx`: component test patterns (`renderPopulated`, `deferredFetch`, toasts, focus).
  - `apps/web/src/api/todo-sync.test.ts`: race tests.
  - `apps/web/src/test/media.ts`: `setMediaQuery`.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/components/ui/textarea.tsx` (new): a shadcn `Textarea` (plain `<textarea>` with the shadcn classes). Auto-grow is done by the edit field.
- `apps/web/src/api/todo-sync.ts`: add `editOp(description)`, which applies `{ ...previous, description }` and gives `null` when `previous` is `null`.
- `apps/web/src/api/hooks/use-edit-todo.ts` (new): `useEditTodo(onFailure)` on `createTodoMutation("edit", { op: editOp, request: updateTodo(id, { description }), failureState: notFoundMeansDeleted, onFailure })`, returning a stable trigger.
- `apps/web/src/features/todos/add-row.tsx`: export `counterAnnouncement` (no behaviour change).
- `apps/web/src/features/todos/edit-failure.ts` (new):
  - `EDIT_FAILED_COPY`, and `editFailedToOtherCopy(text)` using `quoteDescription`.
  - `registerEditController({ openEditId(): string | null, reopen(id, text): void, containsFocus(id): boolean })`.
  - `showEditFailure(failure)`:
    - If no edit is open, reopen with `vars.description` and focus only if focus is on `<body>` or `containsFocus(id)`, then show a plain toast.
    - Otherwise, and for a 404, show a persistent Retry toast whose action calls `retry()` and announces "Todo updated".
    - `too_long` replaces the copy in both branches.
- `apps/web/src/features/todos/edit-field.tsx` (new):
  - The inline Textarea. On mount it focuses and selects all. It auto-grows to `scrollHeight` on every value change. Line breaks become spaces on change.
  - Enter calls `onSave(value, "enter")`. Escape does `preventDefault` and `onCancel()`. Blur calls `onSave(value, "blur")` unless closing was already requested.
  - It renders `CharacterCounter` and announces counter crossings via `counterAnnouncement`.
- `apps/web/src/features/todos/todo-row.tsx`:
  - Add the Edit button before Delete.
  - `editing`/`editText` props render `EditField` in place of the Description `<p>`, and the checkbox's accessible name still resolves while editing.
  - Double-click on the Description calls `onEdit` only when `hoverPointer`.
  - Take `onEdit(id)`, `onSaveEdit(todo, text, how)` and `onCancelEdit(id)`.
  - Update the doc comment.
- `apps/web/src/features/todos/todo-list.tsx`:
  - Hold `edit: { id, text } | null`. Opening sets it (the previous field's blur has already committed).
  - Save:
    1. Normalize. If empty or unchanged, just close.
    2. Otherwise call the edit hook, announce "Todo updated" and close.
    3. For `"enter"`, focus that row's Edit button after the field closes.
  - Cancel closes and focuses Edit.
  - Register the edit controller (`openEditId`, `reopen` sets `edit` with the given text, `containsFocus` checks the row).
- `apps/web/src/api/todo-sync.test.ts`: race tests for delete during a pending edit (ordered; a failed edit drops the queued DELETE with one failure), plus `editOp`.
- `apps/web/src/features/todos/todo-edit.test.tsx` (new): component tests for every I/O matrix row, plus:
  - the Edit button's name, classes and tab order (checkbox, Edit, Delete);
  - Created At and Row actions visible while editing;
  - the counter at 450 and 500;
  - the checkbox name while editing;
  - a reload (fresh query) showing the persisted Description.

**Acceptance Criteria:**
- Given an edit is saved, when the list reloads, then the new Description shows in the same position and `createdAt` is unchanged.
- Given any edit interaction, when it finishes (save, cancel or failure), then focus is never left on `<body>` because of the edit field closing, except for a blur save (focus already went where the user moved it).

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 31 findings — high 0, medium 3, low 17, false 11, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) Caret restore after a line-break replace is untested — added a test: a mid-text line break becomes a space with the caret just after it (grouped with the stale-caret fix).
  - `[low]` `[patch]` (verification-gap) The IME composition guard on Enter/Escape is untested — added composing Enter, composing Escape and `keyCode: 229` Enter tests: no PATCH, field stays open (grouped with the Safari fix).
  - `[low]` `[patch]` (verification-gap, other) `edit` state goes stale when the edited row leaves the list — `edit` is now cleared during render when its id isn't among the non-exiting rows. Test: delete a reopened row, then a failing edit elsewhere takes the reopen branch.
  - `[false]` `[reject]` (intent-alignment) Latency, hover/touch, colors, auto-grow, Escape priority and reload are checked only in jsdom — resolved by the real-browser runs against the dev stack (see Verification), including forced PATCH 500/503 failures via request routing.
  - `[false]` `[reject]` (intent-alignment) `sprint-status.yaml` and the spec aren't in the diff — finalization bookkeeping, committed separately as in earlier stories.
  - `[medium]` `[patch]` (blind) Opening another edit relies on blur, so a reopened unfocused field is dropped silently — the list now holds the open draft (`onDraft`) and commits it through the save path before opening another edit. Edit on the same open row focuses its field, and saves not from the open edit are ignored (no double PATCH). Tests added.
  - `[low]` `[patch]` (blind) `edit` state goes stale after its row disappears — grouped with the verification-gap stale-edit row: same fix.
  - `[false]` `[reject]` (blind) Retry after a 404 can never succeed — the Story 2.4 AC requires a 404 to show the "another edit is open" toast (with Retry), and AD-4 names that copy. Each retry needs a click and gives one toast.
  - `[false]` `[reject]` (blind) Retry on `too_long` can never succeed — `too_long` can't be reached from the UI: the field's `maxLength` (500 UTF-16 units) equals the server's `string.length` check. The copy swap mirrors create.
  - `[false]` `[reject]` (blind) "Todo updated" is announced before the result — an optimistic announcement is the specified pattern (AC: saved within 100 ms, live region announces). Create's Retry does the same.
  - `[low]` `[reject]` (blind) Height isn't recomputed on width change while editing — real but rare (resize or rotate mid-edit). The fix needs a ResizeObserver, more than a direct correction.
  - `[low]` `[patch]` (blind) Safari IME Enter (`keyCode 229`, `isComposing` false) saves early — the key handler also returns early on `keyCode === 229`, with tests.
  - `[false]` `[reject]` (blind) No key hints for screen readers, and the counter isn't `aria-describedby` — parity with the Add row as specified: the counter is announced through the live region at 450 and 500, the same as in the Add row.
  - `[low]` `[reject]` (blind) `maxLength` truncates a 500+ character paste with CRLFs before they become spaces — real but rare. A fix needs custom paste handling, more than a direct correction.
  - `[false]` `[reject]` (blind) No sync tests for stacked edits or edit+toggle — the helper's queue and drop behaviour is kind-agnostic and tested with toggles (Story 2.2) and edit+delete here. No defect was named.
  - `[low]` `[patch]` (blind) The list-level `onSaveEdit` ignores `how` — removed `how` from the list callback. The row still uses it for focus.
  - `[false]` `[reject]` (blind) Spec and `deferred-work.md` missing from the diff — both are in the working tree and committed with this story. The review diff covers `apps`/`packages`.
  - `[low]` `[patch]` (edge) Stale `edit` when the open row is deleted or removed by a 404 — grouped with the verification-gap stale-edit row.
  - `[low]` `[patch]` (edge) A row exits while its unfocused field is open — grouped with the stale-edit row: `edit` is cleared when the row starts exiting.
  - `[medium]` `[patch]` (edge) A reopened unfocused field isn't committed when another edit opens — grouped with the blind medium row: same fix.
  - `[low]` `[patch]` (edge) Edit on the row whose reopened field has no focus does nothing — grouped with the blind medium row: it now focuses the field.
  - `[false]` `[reject]` (edge) Retry after a newer successful edit overwrites it — AD-4: "A Retry of a failed edit resends the original PATCH", last write wins, and Retry is an explicit user action.
  - `[false]` `[reject]` (edge) 404 Retry loops — see the blind 404 row.
  - `[false]` `[reject]` (edge) `too_long` Retry loops — see the blind `too_long` row: can't be reached.
  - `[low]` `[reject]` (edge) Two queued edits, first fails: the newer queued text is dropped and the field reopens with the older text — dropping queued ops after a failure is the FR-10 protocol, and it needs two saves within one request's latency. Recovering the dropped op's text needs helper changes, more than a direct correction.
  - `[low]` `[patch]` (edge) Alt-tab blur commits a half-typed edit — onBlur skips saving when `!document.hasFocus()`, and the field stays open. Test added. Blur-by-click still saves in a real browser (verified).
  - `[low]` `[patch]` (edge) Safari IME `keyCode 229` — grouped with the blind Safari row.
  - `[low]` `[reject]` (edge) Width change leaves a stale height — grouped with the blind resize row.
  - `[low]` `[patch]` (edge) Stale caret ref when the replacement leaves the value unchanged — the caret is recorded only when the replacement changes the value, with a test.
  - `[medium]` `[patch]` (edge, claim) Spec claim that opening another edit follows the previous field's blur doesn't hold for an unfocused field — grouped with the blind medium row.
  - `[low]` `[defer]` (edge, claim) Focus drops to `<body>` after an edit 404 removes the row — the same root cause as the Story 2.2 residual already in `deferred-work.md` (the entry now names the edit path too). It needs the shared focus-after-removal handling.

## Design Notes

"Another edit is open" is read at failure time from the list's single `edit` state. If that open edit is the failed row itself (the user reopened it), the row takes the Retry-toast branch, so the text the user is typing is never overwritten. The attempted text stays recoverable through the quote and Retry.

Closing the field removes a focused element. Some browsers fire `blur` on removal and some don't, so the field sets a "closing" flag before calling `onSave` or `onCancel`, and `blur` checks it. That prevents a second save or a save after Escape. A 404 uses the Retry toast as the AC and AD-4 specify. A Retry after a 404 gets 404 again, and its op on a `null` Todo renders nothing.

## Verification

**Commands:**
- `pnpm --filter @todos/web test && pnpm --filter @todos/shared test` -- expected: all pass, none skipped
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: all exit 0

**Manual checks (if no CLI):**
- Real browser against the dev stack (http://localhost:18080) with a throwaway Todo:
  - Click Edit: text is selected. Type, press Enter: saved, "Todo updated", focus on Edit.
  - Reload: persisted. Double-click opens on a hover device.
  - Escape cancels with a toast still visible.

## Auto Run Result

**Summary:**
- **Edit button:** a ghost `Pencil` button, before Delete, named "Edit todo: {Description}". The tab order is checkbox, Edit, Delete.
- **Opening:** Edit on any device, or a double-click on the Description on hover-capable fine pointers only, opens an auto-growing inline Textarea. It is pre-filled, focused and fully selected, and Created At and the Row actions stay visible.
- **Typing:** line breaks become spaces, with the 500 cap and the 450/500 counter, same as the Add row.
- **Saving:** Enter, blur, or opening another edit commits. The save is optimistic through `useEditTodo` on `createTodoMutation("edit")` and announces "Todo updated". An Enter save returns focus to Edit.
- **No-op:** empty or unchanged text cancels with no request.
- **Escape:** cancels before any toast is dismissed, and focus goes to Edit.
- **Failures:**
  - No edit open: the row reopens with the sent text, taking focus only if focus was free or in that row, with a plain toast.
  - Another edit open: the row shows its confirmed text, with a persistent Retry toast quoting the attempt.
  - A `404` removes the row and uses the Retry toast. `too_long` swaps the copy.
  - A delete queued behind a failed edit is dropped, with one toast.

**Files changed:**
- `apps/web/src/components/ui/textarea.tsx` (new): shadcn Textarea.
- `apps/web/src/api/todo-sync.ts`: `editOp`.
- `apps/web/src/api/hooks/use-edit-todo.ts` (new): edit hook.
- `apps/web/src/features/todos/counter-announcement.ts` (new): shared counter-announce rule, moved from the Add row because lint's `only-export-components` rejects exporting it there.
- `apps/web/src/features/todos/add-row.tsx`: uses the shared rule.
- `apps/web/src/features/todos/edit-field.tsx` (new): the inline field. It auto-grows, turns line breaks into spaces, restores the caret, guards IME composition (including `keyCode 229`), and doesn't save on blur when the window loses focus.
- `apps/web/src/features/todos/edit-failure.ts` (new): failure copy, the controller and the two failure branches.
- `apps/web/src/features/todos/todo-row.tsx`: Edit button, edit mode, double-click on hover devices, focus to Edit after an Enter save or Escape.
- `apps/web/src/features/todos/todo-list.tsx`: the single open edit with its draft ref, commit-before-switch, stale-edit pruning, and the controller.
- `apps/web/src/api/todo-sync.test.ts`: `editOp` and the edit-then-delete race.
- `apps/web/src/features/todos/todo-edit.test.tsx` (new): component tests for every I/O matrix row, plus the review cases.
- `apps/web/src/features/todos/todo-delete.test.tsx`: tab order now checkbox, Edit, Delete.
- `_bmad-output/implementation-artifacts/deferred-work.md`: the 404-focus entry now covers edits too.

**Review findings:** 31 in total. Patched: 15 rows grouped into 8 entries. One entry is medium: commit-before-switch plus focusing the same open row (3 medium rows). The other seven are low: stale-edit pruning, the Safari IME guard, the stale caret, the alt-tab blur, removing the unused `how`, and the caret and IME test gaps. Deferred: 1 (404 focus, low). Rejected: 15 (11 false, 4 low: resize height, CRLF paste truncation, and the dropped queued edit text, reported by two reviewers). Every finding has its own row in the Review Triage Log.

**Follow-up review recommendation:** `false`. Patched entries at entry verdict: high 0, medium 1, low 7. On a first pass, fewer than two medium entries and no high.

**Verification:**
- `pnpm --filter @todos/web test`: 232 passed across 12 files, none skipped.
- `pnpm --filter @todos/shared test`: 46 passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` and `prettier --check apps packages` all exit 0.
- Matrix audit: every I/O row has a passing test.
- Real browser (Chromium via playwright-core, dev stack at :18080, throwaway Todos, cleanup left the Todo count unchanged), run before and after the patches:
  - Open selects all 21 characters with focus, and the Row actions stay visible.
  - Enter sends `PATCH {"description":…}` → 200, focus goes to Edit, and "Todo updated" is announced.
  - A forced 500 reopens the field with the attempted text and focus, alongside "Couldn't save your edit. Please try again."
  - The first Escape cancels and keeps the toast. The second Escape dismisses it.
  - A forced, delayed 503 while row 2 is being edited leaves row 1 with its confirmed text and shows the "Couldn't save your edit to “Second attempt”." Retry toast. Row 2 stays in edit mode.
  - The edit persists across a reload, and a double-click opens the field.
  - A click-away blur saves (`PATCH` → 200) with `document.hasFocus()` true.

**Residual risks:**
- A 404 removal of a focused row still drops focus to `<body>` (deferred).
- The field's height isn't recomputed on a width change mid-edit.
- A 500+ character CRLF paste can be truncated by `maxLength` before line breaks are replaced.
- A newer queued edit's text is dropped if an earlier edit fails (the FR-10 drop rule).
- A 404 Retry toast offers a Retry that gets 404 again (as the AC specifies).
