---
title: Reconcile UX spines against PRD
created: 2026-09-24
source: _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
spines: DESIGN.md, EXPERIENCE.md (decisions in .memlog.md)
---

# Reconcile: UX spines vs Todos PRD

Status key: **Honored** (spine covers it faithfully) · **Weakened** (covered, but a threshold, intent, or part is missing or softened) · **Contradicted** (spine behavior conflicts with the PRD) · **Omitted** (not addressed where UX should address it) · **N/A** (not a UX concern; checked for conflicts only) · **Exceeds** (spine adds behavior beyond PRD scope).

Abbreviations: D = DESIGN.md, E = EXPERIENCE.md.

## 1. Traceability table

### Vision and qualitative intent

| PRD item | Spine location | Status | Notes |
|---|---|---|---|
| §1 "calm" / minimal, no onboarding | D Brand & Style; D Do's/Don'ts; E Information Architecture (no routes, dialogs, settings); .memlog "Feel" | Honored | One column, one accent, no illustration, no celebration. |
| §1 "trust and clarity" | E State Patterns (row-level), E Voice (error copy), E Key Flows failure paths | Honored | Every failure path has a rollback and a message. |
| §1 "every change shows on screen immediately" | E Component Patterns (Add row, Checkbox); D Pending row | Weakened | "At once" is stated, but the 100 ms number never appears (see FR-4/FR-7/FR-8/NFR-1). |
| §1 "never silently loses work" | E State Patterns "Failed create" | Contradicted | When the user has typed new text, the failed Description is dropped and the toast only says "Couldn't add that todo." The text is gone. See Gap G1. |
| NFR-12 "feels like a finished product" | D Typography `app-title`; E Accessibility Floor (h1) | Weakened | Header name covered; browser tab title and favicon absent. See G2. |
| NFR-12 "no layout jumps" | E Interaction Primitives → Motion (150 ms row transitions) | Weakened | Row add/remove covered, but the character counter appearing under the input and the add row disappearing in Error both shift content. See G4. |

### Functional requirements

| PRD item | Spine location | Status | Notes |
|---|---|---|---|
| FR-1 List is the first screen, no login/splash | E Foundation; E Information Architecture | Honored | |
| FR-1 All Todos shown, newest first | E State Patterns → Populated; E "Not allowed: infinite scroll, auto-sorting" | Honored | |
| FR-1 Description, Completion Status, Created At shown | D Components → Todo row; E Component Patterns → Created At time | Honored | |
| FR-1 [ASSUMPTION] relative time, absolute on hover **or focus** | E Component Patterns → Created At time; E Interaction Primitives → Tab order | Weakened | Tooltip says "on hover or focus", but the timestamp is explicitly not a tab stop, so keyboard users can never focus it to see the tooltip. The fallback ("absolute time in the Description's accessible name") only helps screen readers, and it conflicts with the checkbox/Edit/Delete label copy in E Voice, which contains no time. See G5. |
| FR-2 ≥ 2 visual properties, never color alone | D Components → Completed Todo row (check fill + line-through + muted); D Do's/Don'ts | Honored | Three cues. |
| FR-2 Status exposed to assistive tech | E Accessibility Floor → Checkbox | Honored | Minor: E Voice changes the checkbox's name with state ("Mark as done" / "Mark as not done") while the checked state is also exposed. Screen readers will say "Mark as not done, checkbox, checked", which reads twice. Suggest name = Description, state = checked. |
| FR-3 Loading indicator, none if data < 300 ms | E State Patterns → Loading; E Flow 1 step 1, Flow 3 step 2; D Components → Loading state | Honored | |
| FR-3 Empty invites first Todo, input visible and usable | E State Patterns → Empty; E Voice; D Components → Empty state | Honored | |
| FR-3 Error message + **Retry** action, never empty-as-no-data | E State Patterns → Error; E Voice ("Try again"); E Flow 3 failure; D Load error state | Honored | Label is "Try again" rather than "Retry". The PRD names the action and does not set its label, so this is acceptable. |
| FR-4 New Active Todo at top **within 100 ms** (Optimistic Update) | E Component Patterns → Add row ("at once") | Weakened | 100 ms threshold not stated anywhere in the spines. See G3. |
| FR-4 Clear input, keep focus | E Component Patterns → Add row; E Flow 1 step 2 | Honored | |
| FR-4 Client doesn't supply timestamps; persists on reload | E Flow 1 step 5, Flow 2 step 4 | N/A / Honored | Architecture concern; flows confirm reload persistence. |
| FR-5 Empty/whitespace does nothing, no toast | E Component Patterns → Add row | Honored | |
| FR-5 > 500 prevented at input, visible limit near cap | E Component Patterns → Add row (`maxlength`), Character counter (450 → "{n} / 500", destructive at 500); D Components → Add input | Honored (add) / Omitted (edit) | Counter and `maxlength` are specified only for the add input. FR-6 says "same validation as FR-5 applies", but the inline edit field has no cap or counter. See G6. |
| FR-5 API rejects independently | E State Patterns → Todo API validation error | Honored | |
| FR-6 Edit mode: double-click or Edit control (desktop), Edit control (touch); pre-filled and focused | E Component Patterns → Inline edit field; E Interaction Primitives → Pointer and touch; .memlog decision | Honored | The [ASSUMPTION] is finalized in UX as the PRD required. |
| FR-6 Enter/blur saves; Escape cancels and restores | E Component Patterns → Inline edit field; E Interaction Primitives → Keyboard | Honored | Escape is also bound to "dismiss the newest toast", so it's unclear what Escape does while editing with a toast visible. See G8. |
| FR-6 Same validation as FR-5; empty-on-edit cancels, doesn't delete | E Component Patterns → Inline edit field | Honored (empty) / Omitted (max length) | See G6. |
| FR-6 Editable whether Active or Completed | E Component Patterns (no restriction stated) | Honored (implicit) | Suggest stating it, and saying whether the edit field shows line-through/muted for a Completed Todo (it shouldn't). |
| FR-6 Position and Created At unchanged | E Flow 1 step 3 ("row stays where it is") | Honored | |
| FR-7 One click/tap toggles; visual change **within 100 ms** | E Component Patterns → Completion checkbox | Weakened | 100 ms not stated (G3). |
| FR-7 Keeps position; persists | E Component Patterns → Completion checkbox; E "Not allowed: auto-sorting" | Honored | |
| FR-8 Delete visible on touch, reachable by keyboard, may be hover/focus on desktop | E Interaction Primitives → Pointer and touch (hover media query, opacity 0 but in tab order); E Responsive | Honored | Using the hover capability rather than width is a good call. |
| FR-8 No confirm; disappears **within 100 ms** | E Component Patterns → Delete button; E Motion (150 ms collapse) | Weakened / tension | A 150 ms height-and-opacity collapse is longer than the 100 ms "disappears within" budget. It's compliant only if "reflected" means "transition starts". See G3. |
| FR-8 Out of scope: bulk delete, undo, trash | E Flow 2 failure ("no undo in v1") | Honored | E Flow 2 leaves a `[NOTE FOR UX]` marker in a draft spine; resolve it or move it to .memlog. |
| FR-9 Durable; browser is not the store | E Flows (reload/second device) | N/A / Honored | The spine specifies no local caching. |
| FR-10 Affected Todo returns to pre-action state | E State Patterns → Failed toggle or delete / Failed edit / Failed create | Honored | |
| FR-10 Timeout after 10 s | E State Patterns → Error (initial fetch); E Flow 1 failure ("within 10 s") | Weakened | The 10 s timeout is stated for the initial fetch and implied in one flow, but not in the row-level mutation states. |
| FR-10 Failed create restores typed Description | E State Patterns → Failed create | Contradicted (edge) | The spine deliberately does not restore it if the input has new text, and the text is lost. See G1. |
| FR-10 Failed edit stays in edit mode with attempted text | E State Patterns → Failed edit; E Component Patterns ("only one Todo in edit mode; opening another commits the first") | Weakened | The spine doesn't say what happens when the failure arrives after the user has blurred away or opened another row's edit. With a single edit slot, the failed row can't "reopen" without evicting the other edit, and the attempted text may be lost. See G7. |
| FR-10 Non-blocking message; other Todos usable; no reload | E Component Patterns → Toast; E Information Architecture → Toast region | Honored | |
| FR-10 Validation errors human-readable | E Voice (too-long copy); E State Patterns → Todo API validation error | Honored, with inconsistency | State Patterns says the API's message is shown, while Voice supplies client copy for the same case. Pick one source. The Voice copy "Keep it under 500 characters" also misstates the Glossary (1–500 inclusive). See G9. |
| FR-10 Pending changes applied in order; on failure restore last confirmed state; nothing applied on top of a failure | E State Patterns → Pending ("queued in order"), Failed toggle or delete ("last confirmed state") | Weakened | "Drop queued later changes after a failure" isn't stated, and neither is what the user sees (one toast or several) when a queued chain collapses. |
| FR-11 Consistent API, error codes | — | N/A | Architecture. E Voice "never show codes" is consistent. |
| FR-12 320 px to ≥ 1920 px | E Foundation; E Responsive & Platform | Honored | |
| FR-12 Never scrolls horizontally | E Accessibility Floor → Zoom; D Typography (`overflow-wrap: anywhere`) | Honored | |
| FR-12 Touch targets ≥ 44×44 px | D `spacing.touch-target`, add-input, add-button, row-icon-button, todo-row minHeight; E Accessibility Floor → Touch targets | Weakened (minor) | E lists the checkbox, but the D component tokens give no 44 px hit area to the checkbox (shadcn's is 16 px visually). Add a `todo-checkbox` hit-area token. |
| FR-12 Long Descriptions (500 chars, URLs) wrap | D Typography; E State Patterns → Long Description; D Do's/Don'ts | Honored | |

### Non-functional requirements

| PRD item | Spine location | Status | Notes |
|---|---|---|---|
| NFR-1 UI reflects actions within 100 ms | — | Weakened | Never cited numerically (G3). |
| NFR-1 Interactive within 2 s with up to 1,000 Todos | — | Omitted | The spine gives no rendering guidance for 1,000 rows, each with a Tooltip, a per-minute relative-time refresh, and hover-revealed buttons. At minimum, say "all 1,000 render without pagination" and that one shared timer drives the timestamp refresh. |
| NFR-4 WCAG 2.1 AA; keyboard-only; visible focus; labels; 4.5:1 text | E Accessibility Floor; E Interaction Primitives → Keyboard; D Colors contrast table; D focus-ring | Honored (with G5) | Verified: white on #2F6F6A = 5.83:1; #0A0A0A on #5FB3AA = 8.03:1; shadcn neutral muted #737373 on white = 4.74:1. Timestamp keyboard access is the gap. |
| NFR-5 Browser support | E Responsive & Platform (refers to NFR-5); D Typography (16 px, no iOS zoom) | Honored | |
| NFR-10 Plain text; HTML shown literally | — | Omitted | Neither spine says Descriptions render as literal text. This also applies to the aria-labels, tooltips, and toast text that interpolate `{Description}`. |
| NFR-12 Product name in header | D Typography `app-title`; E Accessibility Floor (`<h1>` "Todos") | Honored | |
| NFR-12 Product name in **browser tab title** | — | Omitted | G2. |
| NFR-12 **Favicon** | — | Omitted | G2. |
| NFR-12 All List States share one visual design | D Components (Error uses the Empty layout; skeleton shaped like rows) | Honored | |
| NFR-12 No placeholder text | E Voice (all copy final) | Honored | The "Add a todo…" input placeholder is real UI copy, not filler. |
| NFR-12 No layout jumps when Todos are added, completed, or removed | E Motion; D Pending row (no spinner/dimming) | Weakened | See G4 (counter insertion, Error hides add row, skeleton-to-row height). |

### User journeys

| PRD item | Spine location | Status | Notes |
|---|---|---|---|
| UJ-1 path and climax | E Flow 1 steps 1–6 | Honored | |
| UJ-1 edge case (tick, revert, non-blocking message, nothing lost) | E Flow 1 Failure | Honored | |
| UJ-2 fits narrow screen, easy tap, on-screen keyboard add, synced after reload | E Flow 2; E Responsive; D touch-target | Honored | |
| UJ-3 friendly empty state, input already visible, no explanation needed | E Flow 3; E State Patterns → Empty/Loading | Honored | Flow 3 step 3 says "cursor ready", but on mobile the input isn't auto-focused. Qualify it as desktop. |
| UJ-4 | E Key Flows intro | N/A | Correctly excluded. |

### Glossary fidelity

| Term | Spine usage | Status | Notes |
|---|---|---|---|
| Todo, Description, Completion Status, Active/Completed Todo, Created At, Todo List, Optimistic Update, List States | E Foundation declares exact use; used consistently in E State Patterns and D Components | Honored | Lowercase "todo" and "done" in UI copy is a deliberate voice decision (E Voice), not drift. |
| List States: **Error** | D Components calls it "Load error state" | Weakened (minor) | Rename to "Error state" to match the Glossary. |
| Description length 1–500 | E Voice "Keep it under 500 characters" | Contradicted (minor) | "Under 500" means at most 499. See G9. |
| Timestamps (Updated At) | Not shown in UI | Honored | The PRD only requires Created At to be shown. |
| "Pending" (row state) | E State Patterns; D Components | Exceeds (term) | New term that isn't in the Glossary. It's fine as a spine-local term, but define it once as "a Todo with an Optimistic Update not yet confirmed" (E already does this inline). |
| Deployment, Todo API | E Foundation, State Patterns | Honored | |

### Out of scope (§6.2)

| PRD item | Spine location | Status |
|---|---|---|
| Accounts, auth, per-user lists | E Foundation ("no sign-in") | Honored |
| Access control, production hardening | — | N/A |
| Collaboration, sharing, assignment | none present | Honored |
| Priorities, due dates, reminders, notifications | none present | Honored |
| Tags, multiple lists, search, filters, manual reordering | E Pointer and touch ("no drag-to-reorder"); no filters present | Honored |
| Bulk actions, undo | E Flow 2 failure; D/E contain no clear-completed | Honored |
| Offline, PWA, native | E Responsive & Platform | Honored |
| Real-time sync | E Flow 2 ("reloads") | Honored |

### Success metrics

| PRD item | Spine location | Status | Notes |
|---|---|---|---|
| SM-1 Unguided add/edit/complete/un-complete/delete, identify completed, explain failed save, phone testers | E Flows; E Voice error copy; D Completed row | Honored | Risk: on desktop, Edit is invisible until hover. An unguided tester who never hovers or double-clicks may not find edit. Watch for this in the hallway test. |
| SM-C1 No extra controls/settings/screens | E Information Architecture (no settings, dialogs); .memlog (no theme toggle) | Honored | |
| SM-C2 Don't hide or delay errors; never leave Optimistic Update after failure | E Toast; E State Patterns | Weakened | Toasts auto-dismiss after 6 s with no pause on hover or focus, and the failed-create path can drop text without saying so (G1). |

### Accepted assumptions (§9)

| Assumption | Spine location | Status |
|---|---|---|
| 500-character cap | E Add row, Character counter | Honored (add); Omitted (edit), see G6 |
| Newest-first, no reordering | E Populated; E Not allowed | Honored |
| Relative Created At, absolute on hover or focus | E Created At time | Weakened (focus), see G5 |
| Edit pattern finalized in UX | E Inline edit field; .memlog | Honored |
| Empty-on-edit cancels | E Inline edit field | Honored |
| No confirm, no undo | E Delete button; E Not allowed; Flow 2 | Honored |
| 10 s timeout | E Error state; Flow 1 failure | Weakened (not stated for mutations) |
| 1,000 Todos sizing | — | Omitted |
| Last-write-wins | — | N/A (no UX surface; no real-time sync) |
| WCAG 2.1 AA | E Accessibility Floor; D Colors | Honored |

### Spine behavior beyond PRD scope (scope check)

| Spine behavior | Location | Assessment |
|---|---|---|
| Dark mode following the OS setting | D colors (paired values); E Foundation; .memlog | Exceeds. It adds no control, so SM-C1 holds, but it doubles the contrast and QA matrix. Acceptable if kept; record it as a deliberate addition. |
| Add row disabled during Loading, hidden in Error | E State Patterns | Exceeds (reasonable). The Error hide causes a layout jump (G4). |
| Desktop-only autofocus on load | E Add row | Exceeds (harmless) |
| Relative-time refresh every minute | E Created At time | Exceeds (harmless); relevant to the NFR-1 1,000-row budget |
| Polite live-region announcements | E Accessibility Floor | Exceeds (supports NFR-4) |
| Toast stacking (max 3), 6 s auto-dismiss | E Toast | Exceeds, with SM-C2 risk |
| Only one Todo in edit mode; opening another commits the first | E Inline edit field | Exceeds. Interacts badly with failed-edit recovery (G7). |
| Unchanged edit is a no-op | E Inline edit field | Exceeds (good; avoids a spurious Updated At change) |

No spine behavior introduces an out-of-scope feature (filters, undo, bulk actions, settings, sync).

## 2. Counts

| Status | Count |
|---|---|
| Honored | 58 |
| Weakened | 19 |
| Contradicted | 3 |
| Omitted | 7 |
| N/A | 8 |
| Exceeds (scope additions) | 9 |

Counts are per table row, with split rows counted under their worst status. Omitted: NFR-1 sizing, NFR-10, tab title, favicon, edit-field max length (counted with FR-5/FR-6/§9 cap), 1,000 sizing assumption. Contradicted: "never silently loses work", FR-10 failed-create restore, and "under 500" copy vs the Glossary.

## 3. Gaps and suggested fixes

**G1. Failed create can silently lose the user's text (Contradicted: FR-10, §1 "never silently loses work", SM-C2).**
E State Patterns → Failed create: when the input already has new text, the failed Description is discarded.
*Fix:* never discard it. Either (a) put the failed text back when the input is empty, and otherwise keep it and show it in the toast ("Couldn't add "Send Q3…". Your text is below.") with a single "Restore" action that swaps it into the input, or (b) show the failed row in place in a "not saved" state with retry/discard. Option (a) adds one toast action only for this case, which is the smallest change consistent with SM-C1. Update the E Toast rule "no Retry action" to allow this one exception.

**G2. Browser tab title and favicon missing (Omitted: NFR-12).**
*Fix:* add to D Brand & Style or Components: document `<title>` = "Todos" (static; no count), plus a favicon spec (for example, a Quiet Teal checkmark on a transparent background, with SVG and 32 px PNG, legible on light and dark tab strips). Add a line to E Foundation or Accessibility Floor.

**G3. 100 ms reflection threshold never stated; 150 ms delete collapse vs "disappears within 100 ms" (Weakened: FR-4, FR-7, FR-8, NFR-1).**
*Fix:* in E Component Patterns (or Foundation), state: "Every add, edit, toggle, and delete shows its result within 100 ms of the input event (NFR-1)." In E Motion, clarify that the row's visible change (opacity drop and removal from the accessibility tree and tab order) starts immediately and the row is removed from the list within 100 ms. Either shorten the collapse to 100 ms, or say that the 150 ms height tween is cosmetic and happens after the Todo has already "disappeared" (opacity 0 by 100 ms).

**G4. Layout jumps not fully prevented (Weakened: NFR-12).**
The character counter appears under the add input at 450 characters and pushes the list down. The add row is visible (disabled) in Loading and then removed in Error. Skeleton row heights may not match real rows.
*Fix:* reserve the counter's line height permanently (render it empty or `visibility: hidden` below 450). Keep the add row in Error but disabled, rather than hiding it; the "can't enter work into a failed list" goal still holds. Make skeleton rows `todo-row` min-height (44 px + padding) so Loading → Populated doesn't reflow the header area.

**G5. Absolute timestamp not reachable by keyboard focus (Weakened: FR-1 assumption, NFR-4).**
E makes the tooltip appear "on hover or focus", but the timestamp isn't a tab stop. The screen-reader fallback ("absolute time in the Description's accessible name") doesn't match the E Voice label copy.
*Fix:* choose one approach. (a) Make the `<time>` element the Tooltip trigger and a tab stop (Tab order: checkbox → time → Edit → Delete). Or (b) show the tooltip when any control in the row has focus (`:focus-within`), and add the absolute time to the row's description via `aria-describedby`. Then update the E Voice labels to match.

**G6. Inline edit field has no 500-character cap or counter (Omitted: FR-6 "same validation as FR-5", FR-5 "visible character limit near the cap").**
*Fix:* in E Component Patterns → Inline edit field, add "`maxlength` 500 and the same 450/500 character counter as the add row, placed under the edit field." Add the counter placement to D Components → Inline edit field.

**G7. Failed-edit recovery is undefined when the user has moved on (Weakened: FR-10 failed edit).**
With "blur saves" and "only one Todo in edit mode", a failure that arrives after the user has blurred away or opened another row's edit can't reopen edit mode without evicting the other edit.
*Fix:* specify that the failed row reopens edit mode with the attempted text only if no other edit is open. Otherwise the row keeps its last confirmed Description, and the toast includes the attempted text ("Couldn't save "Book room for retro". Please try again."). Also state: "after any failure in a queued chain, later queued changes for that Todo are discarded and one toast is shown" (FR-10, last consequence).

**G8. Escape is double-bound (minor, NFR-4 predictability).**
E Keyboard gives Escape both "cancel inline edit" and "dismiss newest toast".
*Fix:* Escape cancels the edit when focus is in an edit field, and dismisses a toast only when focus is in the toast or no edit is open.

**G9. Too-long copy misstates the cap; two sources for validation copy (Contradicted, minor: Glossary 1–500; FR-10 human-readable).**
*Fix:* change the copy to "That todo is too long. Keep it to 500 characters or fewer." In E State Patterns, state that the client maps API validation codes to E Voice copy, falling back to the API's human-readable message for unknown codes.

**G10. Error toasts auto-dismiss at 6 s with no pause (Weakened: SM-C2 "do not hide error messages").**
*Fix:* pause the auto-dismiss while the toast is hovered or focused, and while the window is unfocused. Alternatively, keep failure toasts until dismissed; they're rare, and the PRD values honesty over polish.

**G11. NFR-10 plain text rendering not stated (Omitted).**
*Fix:* add to E State Patterns → Long Description (or a new row): "Descriptions render as literal text everywhere: in rows, the edit field, tooltips, aria-labels, and toasts. HTML-like content such as `<b>` shows as typed."

**G12. NFR-1 sizing (1,000 Todos in 2 s) not addressed (Omitted).**
*Fix:* add to E State Patterns → Populated: "All Todos render in one list with no pagination, up to 1,000. Timestamps refresh from a single shared timer, and Tooltips mount lazily on hover or focus, so the list is interactive within 2 s (NFR-1)."

**G13. Minor tidy-ups.**
- Rename D "Load error state" to "Error state" (Glossary List State).
- Add a 44×44 checkbox hit-area token (`todo-checkbox.hitArea: {spacing.touch-target}`) in D (FR-12).
- Use the Description as the checkbox's accessible name, rather than "Mark as done / not done", so the checked state isn't announced twice (FR-2 / NFR-4).
- Flow 3 step 3: say "(desktop)" for "cursor ready".
- Resolve or move the `[NOTE FOR UX]` in E Flow 2 to .memlog.
- Record dark mode as a deliberate scope addition in .memlog (it's already in D/E, but not flagged as beyond the PRD).
