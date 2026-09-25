---
title: 'Epic 2 retro fix-now: dropped deletes, focus after removal, edit focus ring'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
baseline_commit: '8fc987b58d70d9db1515997f5deaa86b3587e76c'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-25.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 2 retro (`epic-2-retro-2026-09-25.md`) found three cross-story defects.
- **F1:** a delete queued behind a failed write reappears under that write's failure UI, after "Todo deleted" was already announced: the edit reopens, or the text goes back into the Add box.
- **F3:** when a PATCH 404 or a failed create removes the row that has focus, focus falls to `<body>`, against EXPERIENCE.md's rule that focus is never lost to `<body>`.
- **F2:** the inline edit field has no visible focus ring.

These are sprint action items `epic-2-retro-item-9`, `-10` and `-11`.

**Approach:**
- **F1:** the write helper tells failure handlers which queued kinds it dropped, and what the Todo renders as after the rollback. When a delete was dropped, one shared rule reports the delete's outcome instead of the failed write's UI.
- **F3:** the Todo List moves focus by Story 2.3's rule (next row, else previous, else the Add input) whenever a focused, non-exiting row is removed. The list region counts as "free" focus, just like `<body>`.
- **F2:** the edit field gets the standard 2 px focus ring.

## Boundaries & Constraints

**Always:**
- Only `todo-sync.ts` writes sync state.
- Exactly one toast per failed action.
- The API `message` is never shown.
- A dropped delete never reopens an edit and never restores text to the Add row.
- The focus-after-removal target uses the display order from before the removal, and skips exiting rows.
- The edit field's focus ring matches the design-system focus ring (`outline-2 outline-offset-2 outline-ring`, like `index.css:182-184`).

**Never:**
- No change to the FR-10 drop protocol for non-delete queued ops (a toggle or edit dropped behind a failure stays silent).
- No new copy strings.
- No API or shared-schema changes.
- No change to the delete flow's own focus handling (Story 2.3).
- No refactor beyond what these fixes need (retro action item 13 covers that separately).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit fails, delete queued | Edit pending, then Delete, then the PATCH gets 500 | The row is back with its confirmed text and **not** in edit mode. One toast: "Couldn't delete that todo. Please try again." The delete focus-restore rule applies. No DELETE is sent | dropped-delete rule |
| Toggle fails, delete queued | Toggle pending, then Delete, then the PATCH gets 500 | The same as the row above: the delete-failure toast only, never the toggle toast | dropped-delete rule |
| Edit/toggle 404, delete queued | PATCH gets 404 with a delete queued | The row is removed, and the delete counts as done: no toast, nothing reopened. Focus follows the delete's move | dropped-delete rule (decision 1) |
| Create fails, delete queued | Create pending, then Delete, then the POST fails (any error, including a timeout or network error where the POST may have committed) | The row stays gone, with no toast, and the Add input is left untouched. The DELETE is **still sent** (a 404 counts as success), so the Todo can't reappear on reload. If that DELETE fails, one "Couldn't delete that todo. Please try again." toast | dropped-delete rule (decisions 1, 4) |
| Focused row removed by 404 | Focus is in row B (checkbox, Edit or Delete), and its toggle or edit PATCH gets 404 | B is removed, and focus goes to the next row's checkbox, else the previous one's, else the Add input. The toast is unchanged | focus-after-removal |
| Focused row removed by a failed create | Focus is in a pending-create row and its POST fails | The row is removed, and focus goes to the next row's checkbox, else the previous one's, else the Add input (decision 2). The create failure UI is otherwise unchanged | focus-after-removal |
| Region counts as free focus | Focus is on the list region (a click on blank list space) when an edit fails with no other edit open | The reopened field takes focus, just as if focus were on `<body>` | `focusWasFree` |
| Edit field focus | The field is opened by keyboard | The computed outline is `solid 2px` with a 2 px offset in the ring colour | — |

**Decisions (Msunkur):**
1. When a delete was dropped and the Todo renders as gone after the rollback (a PATCH 404, or a failed create), the delete counts as done. There is no toast and nothing is restored, matching AD-4's rule that a DELETE 404 means success. When the Todo is still present after the rollback, the delete really failed: one "Couldn't delete that todo. Please try again." toast, plus the delete focus-restore rule.
2. Every removal of a focused row uses one rule: the next row's checkbox, else the previous one's, else the Add input. This includes a failed create.
3. Keep all three fixes in one spec, even though it is about 2,100 tokens.
4. A delete dropped behind a failed **create** is still sent, whatever the create's error was: a timeout or network error means the POST may have committed. The UI treats it as done (no toast, nothing restored). A 404 counts as success. If the resent DELETE itself fails, it gets the delete-failure toast. This was decided after review pass 1 (triage row: medium intent_gap).

</frozen-after-approval>

## Code Map

- `apps/web/src/api/todo-sync.ts`:
  - `TodoMutationFailure` (L~190) gains `dropped: readonly TodoWriteKind[]` and `state: Todo | null`.
  - In `onError` (L286-301), compute `dropped` from `sync.pending.get(id)`, minus the failed op, **before** `pending.delete`. Compute `state = renderedTodo(sync, id)` after the rollback.
  - `renderedTodo` (L~140) is the one to reuse.
- `apps/web/src/features/todos/delete-failure.ts`:
  - `showDeleteFailure` (L42-50), the `movedFocus` map (L28) and the controller (L15).
  - Add `withDroppedDelete(handler)` here. When `dropped` includes `"delete"`, it applies the matrix rule and clears the `movedFocus` entry. Otherwise it calls `handler`.
- `apps/web/src/features/todos/todo-list.tsx`:
  - `useToggleTodo(showToggleFailure)` and `useEditTodo(showEditFailure)` (L129-131) get wrapped with `withDroppedDelete`, as module-level constants so they stay stable.
  - The delete focus target logic (L215-236) becomes a shared `removalFocusTarget(shownRows, id)`.
  - `focusRowId` plus the layout effect (L172-196) is the one place focus gets resolved after a commit. Reuse it for removal requests.
  - `latest.current.rows` (L166-170) holds the pre-removal order.
- `apps/web/src/features/todos/todo-row.tsx`: add a `useLayoutEffect` cleanup on unmount that calls a new `onFocusedRemoval(id)` prop when `rowRef.current` contains `document.activeElement` and the row isn't `exiting`. Layout cleanups run before the host node is removed.
- `apps/web/src/features/todos/add-row.tsx` L~33: `useCreateTodo(showCreateFailure)` gets wrapped the same way.
- Resending a dropped delete (decision 4): extend the list's `DeleteFocusController` (`delete-failure.ts` L10-25, registered in `todo-list.tsx` L175-184) with `resendDelete(id)`, which calls the list's `useDeleteTodo` trigger. The delete then runs through the normal helper: the op renders `null` (already gone), 404 counts as success, and a failure goes to `showDeleteFailure`. Don't call `http.ts` directly from the failure module.
- **Prior attempt:** `_bmad-output/implementation-artifacts/spec-epic-2-retro-fix-now-attempt-1.patch` implements everything except decision 4. Review pass 1 cleared it apart from the triage rows marked patch. Apply it first (`git apply`), then make the changes that decision 4 and those patch rows need.
- `apps/web/src/features/todos/edit-failure.ts` L66-67, `delete-failure.ts` L45-46 and `create-failure.ts` L80-81: three copies of the `focusWasFree` check. Replace them with one helper in a new `features/todos/free-focus.ts`, which counts `<body>`, `null` and any element with `data-focus-free` (put that attribute on the list region at `todo-list.tsx` L303).
- `apps/web/src/features/todos/edit-field.tsx` L121: `focus-visible:ring-0` combined with the `textarea.tsx` base `outline-none` hides the ring. Restore the design ring.
- Tests: `todo-edit.test.tsx` "edit then delete: … a failed PATCH drops it with one edit toast" currently pins the F1 bug and must be changed to the new behaviour. Test patterns live in `todo-delete.test.tsx`, `todo-row.test.tsx` and `todo-sync.test.ts`. Shared helpers are in `apps/web/src/test/*`.
- `_bmad-output/implementation-artifacts/deferred-work.md` L4: the PATCH-404 focus entry. Mark it resolved by this spec. The file is append-only, so add a resolution line under it.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/api/todo-sync.ts` -- add `dropped` and `state` to the failure, computed as in the Code Map -- this is the only place that knows what was dropped.
- [x] `apps/web/src/features/todos/free-focus.ts` (new) -- `focusIsFree()` -- one definition of free focus, including the list region.
- [x] `apps/web/src/features/todos/delete-failure.ts` -- `withDroppedDelete(handler)` implementing the matrix and decisions 1 and 4. After a failed create it calls `controller.resendDelete(id)`. `showDeleteFailure` uses `focusIsFree`.
- [x] `apps/web/src/features/todos/edit-failure.ts`, `create-failure.ts` -- use `focusIsFree`.
- [x] `apps/web/src/features/todos/todo-list.tsx`, `add-row.tsx` -- wrap the toggle, edit and create failure handlers. Add `data-focus-free` to the region. Handle `onFocusedRemoval` through the shared target rule and the existing post-commit focus request.
- [x] `apps/web/src/features/todos/todo-row.tsx` -- report the removal of a focused, non-exiting row.
- [x] `apps/web/src/features/todos/edit-field.tsx` -- restore the focus ring.
- [x] Tests (`todo-sync.test.ts`, `todo-delete.test.tsx`, `todo-edit.test.tsx`, `todo-row.test.tsx`) -- cover every matrix row, including the 500 and 404 dropped-delete variants and the create variant. Update the pinned "edit then delete" test. Assert the focus ring classes. Also cover:
  - a create timeout with a delete queued: the DELETE is sent, with no toast;
  - the resent DELETE failing: one delete toast;
  - a delete failure while focus is on the list region;
  - a `state === null` dropped delete, followed by a later failed delete elsewhere, restoring its own focus.

  Drop the "reload without it" claim from the `todo-list.tsx` comment.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append the resolution note.

**Acceptance Criteria:**
- Given any failure with a queued delete, when it is handled, then exactly one toast appears (none when decision 1 counts the delete as done), and focus is never left on `<body>`.
- Given the full test suites, when they run, then web, shared and API all pass with none skipped. Lint, typecheck and build exit 0.

## Implementation Notes

- **StrictMode guard (F3):** in dev, React StrictMode simulates an unmount of newly mounted rows after their effects run. A just-restored row that had focus reported a "removal", and focus jumped back to its neighbour. The browser check caught this; jsdom tests don't use StrictMode. The row now reports `onFocusedRemoval(id, li)`. The list moves focus only if that `li` is disconnected and focus is on `<body>`/`null`. Pinned by the StrictMode tests in `todo-delete.test.tsx`.
- **Shared rule:** `removalFocusTargets(shown, id)` returns the next non-exiting rows, then the previous ones. Both the delete and the removal path focus the first one still rendered (`firstCheckbox`), else the Add input.
- **Focus ring:** Tailwind's `outline-none` sets `--tw-outline-style: none`, so `focus-visible:outline-2` alone still renders no outline. The field also carries `focus-visible:outline-solid`.
- **Free focus:** counting the list region as free changes one existing Add row test, "leaves focus alone when it is elsewhere". That test used the region as "elsewhere" and now uses a row checkbox. A new test pins region → Add input.
- **Test changes:** `todo-delete.test.tsx` "delete on a pending create that fails" now expects no toast and an empty Add input, per decision 1.

## Spec Change Log

- **Review pass 1:**
  - **Trigger (intent_gap):** a delete dropped behind a create that timed out was counted as done and never sent, but the POST may have committed, so the Todo could reappear on reload.
  - **Amended:**
    - Msunkur added decision 4 to the frozen block, and the matrix row "Create fails, delete queued" now says the DELETE is still sent.
    - The Code Map gains the `resendDelete` controller and a pointer to the prior attempt.
    - The Tasks are reset to unchecked, with added test cases.
  - **Known-bad state avoided:** a user-deleted Todo that survives a reload.
  - **KEEP from attempt 1** (`spec-epic-2-retro-fix-now-attempt-1.patch`):
    - `dropped` and `state` computed in `onError` before `pending.delete`.
    - `withDroppedDelete` as a module-level stable wrapper.
    - `focusIsFree` with `data-focus-free` on the region.
    - The row's layout-cleanup removal report.
    - The list resolving removal focus only when the `li` is disconnected and focus fell to `<body>` (StrictMode-safe).
    - `removalFocusTargets` shared with delete.
    - The edit-field `focus-visible:outline-solid` ring.
    - All the new tests.

## Review Triage Log

### 2026-09-25 — Review pass 1
- verdicts: 14 findings — high 0, medium 1, low 6, false 6, maybe-false 1
- route: intent_gap (the second row), so the code was reverted and it loops back to the human. The attempt is saved in `spec-epic-2-retro-fix-now-attempt-1.patch`.
- `[low]` `[patch (moot: loopback)]` (verification-gap) No test covers a delete failure while focus is on the list region — pre-verified. Re-add in the re-derivation: delete fails with focus on `todo-list-region`, so the restored row's checkbox takes focus.
- `[medium]` `[intent_gap]` (blind) A delete dropped behind a create that failed by timeout or network error is counted as done and never sent, but the idempotent POST may have committed, so the deleted Todo can reappear on reload — verified: `withDroppedDelete` checks only `failure.state === null`, and a failed create always rolls back to `null` whatever the error kind (`todo-sync.ts` `onError`, `failureState` undefined for create). Decision 1's premise, a create that "never reached the server", doesn't hold for NETWORK or timeout. The frozen intent doesn't say what to do when the create's outcome is unknown. Attempt saved as `spec-epic-2-retro-fix-now-attempt-1.patch`.
- `[low]` `[reject]` (blind) An edit or toggle that fails with a delete queued loses its change with only the delete toast — the user's last action was the delete, and decision 1 reports the delete's outcome. The rolled-back text is the confirmed state, so no data the user still wants is lost.
- `[maybe-false]` `[reject]` (blind) Failed create with focus in its pending row: which of the create handler and the removal effect wins depends on React commit timing — `setQueryData` notifies through TanStack's batched scheduler, so the commit happens after `onFailure` returns and the removal effect runs last. It would only matter if TanStack committed synchronously. If true it is low (focus still lands on a live target), so rejected.
- `[false]` `[reject]` (blind) The removal layout effect uses an inline `<body>` check instead of `focusIsFree()` — deliberate: the effect asks whether focus fell to `<body>` because the node was removed, not whether focus is free. If a user clicked the region, focus must stay there.
- `[low]` `[patch (moot: loopback)]` (blind) The "no stale entry" test doesn't exercise the `state === null` path — re-add in the re-derivation: a 404 or failed create with a dropped delete, then a later failed delete of another row restores its own focus.
- `[low]` `[patch (moot: loopback)]` (blind) The `todo-list.tsx` comment promises focus handling for "a reload without it", with no test — a list reload can't happen while rows show (AD-6 pinned defaults), so drop the claim from the comment in the re-derivation. The other missing tests (multi-kind `dropped` order, a `focusIsFree` unit test) are low with no named harm: rejected.
- `[false]` `[reject]` (blind) `removalFocusTargets` falls back to the top row when `id` isn't found — can't happen: the removal is reported by a row rendered from `rows`, and `latest.current.rows` is that same render.
- `[low]` `[reject]` (blind) `setFocusRequest` in `handleFocusedRemoval` causes one extra render — real but negligible, one render per focused removal. Removing it would depend on the parent effect running in the same commit, which isn't a direct correction.
- `[false]` `[reject]` (blind) The planning docs aren't updated for the new rules — the spec reconciliations are tracked as Epic 2 retro items 3 and 6 (PM + Architect). This spec's Never excludes them.
- `[false]` `[reject]` (blind) The focus ring uses `outline` rather than `ring`, and only class names are tested — the design-system ring is the global `:focus-visible { outline-2 outline-offset-2 outline-ring }` (`index.css:182-184`), which is outline-based. A real Chromium probe measured `solid 2px`, offset 2 px, on the keyboard-opened field.
- `[false]` `[reject]` (edge) A focused row unmounts because the list goes to Loading or Error, and `focusAddRow()` on a disabled input leaves `<body>` — can't happen: rows exist only in the success state, and nothing moves a loaded list back to Loading or Error (AD-6: no refetch; "Try again" exists only in the error state).
- `[low]` `[reject]` (edge) With `dropped = [edit, delete]`, the dropped edit's text is lost silently — grouped with the third row: decision 1 reports the delete's outcome.
- `[false]` `[reject]` (edge) A dropped delete with `state` null, when the element the delete focused has since been removed, leaves focus on `<body>` — that element's removal is itself a focused-row removal, and the new rule moves focus to a neighbour or the Add input.

### 2026-09-25 — Review pass 2 (after loopback 1)
- verdicts: 15 findings — high 0, medium 0, low 8, false 7, maybe-false 0
- route: nothing to patch, defer or loop back. Verification-gap reported no gaps.
- `[low]` `[reject]` (blind) After a client timeout the POST may still be in flight, so the resent DELETE can 404 before a late commit, and the Todo reappears — real but needs the server to commit the POST more than 10 s after it was sent and after the DELETE was processed. Closing it needs a delayed retry or refetch, more than a direct correction. Grouped with the edge-case race row.
- `[low]` `[reject]` (blind) A failed resent DELETE shows "Couldn't delete" with no row to retry from — it needs a failed create plus a failed DELETE. The toast honestly reports that the Todo may still exist, and a reload shows it if so. A Retry path would add new surface.
- `[false]` `[reject]` (blind) A failed resend while focus is free leaves a stale `focusRowId` that can later steal focus — the list's layout effect clears the request when the id isn't in the cache (`todo-list.tsx`: `if (!cached?.some(…)) focusRowId.current = null`), and after a failed create the id is never in the cache.
- `[false]` `[reject]` (blind) The removal effect's inline `<body>` check versus `focusIsFree()` — carried: the same claim as the pass-1 row. The check deliberately means focus fell because the node was removed.
- `[low]` `[reject]` (blind) Dropped kinds other than delete are silently lost — carried: grouped with the pass-1 rows. That is the FR-10 protocol, and this spec's Never keeps it.
- `[false]` `[reject]` (blind) Whole-list unmounts (to Loading, Error or Empty) trigger the removal handler with a disabled Add input — carried: the same claim as the pass-1 edge row. A loaded list never returns to Loading or Error. Deleting to Empty focuses the Add input, which is enabled in success.
- `[false]` `[reject]` (blind) `resendDelete` also fires for definite 4xx create failures (a wasted DELETE) — decision 4 (Msunkur) says to resend whatever the error was. A wasted request that gets 404 is the accepted cost of that simple rule.
- `[low]` `[reject]` (blind) No direct unit tests for `focusIsFree`, `withDroppedDelete` or `removalFocusTargets`, and the `index === -1` fallback — every branch runs through the integration tests (the verification-gap layer confirmed this, and breaking `focusIsFree` fails 3 tests). `index === -1` is carried false from pass 1.
- `[false]` `[reject]` (blind) The focus-ring test checks class names only — carried: the same claim as pass 1. The browser probe measured `solid 2px`, offset 2 px (implementer's check #1 this pass, and my probe in pass 1).
- `[low]` `[reject]` (blind) The `deferred-work.md` resolution line omits the behaviour changes, and the attempt-1 patch file shouldn't be committed — the spec (committed with the fix) records the behaviour changes. The patch file stays: the append-only Triage and Change Log entries cite it as evidence of the reverted attempt.
- `[false]` `[reject]` (blind) The `[deleteTodo]` dependency may re-register the controller every render — `useDeleteTodo` returns a `useCallback` over a `useMemo` keyed on the module-level `showDeleteFailure`, so it's stable. The verification-gap layer confirmed this.
- `[low]` `[reject]` (edge) The resent DELETE races a late POST commit after a timeout — grouped with the first row.
- `[false]` `[reject]` (edge) No controller registered when a create fails, so the resend is skipped — `TodoList` registers the controller in a mount effect before the Add row can submit: the Add row is disabled until the list query succeeds, and both mount together.
- `[low]` `[reject]` (verification-gap, other) `movedFocus.delete(id)` on the `state === null` path isn't checked by any test — memory hygiene only, with no user-visible effect (the layer's own assessment). A test would have to read module internals.
- `[low]` `[reject]` (verification-gap, other) The removal effect's "focus hasn't moved elsewhere" guard isn't checked by any test — defensive guard. The layer found no realistic way for focus to move between the row cleanup and the list effect in one commit.

## Design Notes

A layout-effect cleanup runs while the unmounting row is still in the DOM, so "did this row hold focus?" can be answered at that point. The list resolves the target in its own post-commit layout effect, the same one the failed-delete restore already uses, so both focus moves go through one path and never compete.

## Verification

**Commands:**
- `pnpm --filter @todos/web test && pnpm --filter @todos/shared test` -- expected: all pass, none skipped
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: exit 0

**Manual checks:**
- Real Chromium against the dev stack:
  - A keyboard-opened edit field's computed outline is `solid 2px`.
  - A forced PATCH 500 with a queued delete shows only the delete-failure toast, and the row isn't in edit mode.
  - A forced PATCH 404 on the focused row moves focus to its neighbour.
