---
name: Todos
status: draft
sources:
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/addendum.md
created: 2026-09-24
updated: 2026-09-24
---

# Todos — Experience Spine

## Foundation

Todos is a single-surface, responsive web app for desktop and mobile browsers, from 320px to 1920px wide. It is built with shadcn/ui and Tailwind CSS. This spine specifies only the behavior that differs from shadcn's defaults. `DESIGN.md` is the visual reference. Domain terms (Todo, Description, Completion Status, Active Todo, Completed Todo, Created At, Todo List, Optimistic Update, List States) are used exactly as the PRD Glossary defines them. There is one personal Todo List per Deployment, with no sign-in. Color mode follows the operating system's light or dark setting, and there is no in-app toggle.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Todo List view | Opening the app URL | The only screen. The header, the add row, and the Todo List in one of its List States. |
| Toast region | Appears over the Todo List view | Non-blocking messages when a save fails (FR-10). |

There are no routes, no navigation, no dialogs, and no settings. Every capability in the PRD (FR-1 to FR-12) is delivered on the Todo List view:

| Need | Where it's delivered | Journey |
|---|---|---|
| See the list on open (FR-1, FR-3) | Todo List view, List States | UJ-1, UJ-3 |
| Add (FR-4, FR-5) | Add row | UJ-1, UJ-2, UJ-3 |
| Edit (FR-6) | Inline edit field in the Todo row | UJ-1 |
| Complete or un-complete (FR-2, FR-7) | Checkbox in the Todo row | UJ-1, UJ-2 |
| Delete (FR-8) | Delete button in the Todo row | UJ-1 |
| Failure feedback (FR-10) | Toast region, with the row rolled back | UJ-1 (edge case) |

## Voice and Tone

The voice is plain and friendly: short, human, and direct, with no jokes, exclamation marks, or emoji. Button labels are verbs. Error messages say what happened and what to do next, and never show codes. UI text uses lowercase "todo"; the capitalized Glossary term appears only in specs.

| Moment | Copy |
|---|---|
| Add input placeholder | "Add a todo…" |
| Add button | "Add" |
| Empty state | **"Nothing here yet."** / "Add your first todo above." |
| Load error | **"Couldn't load your todos."** / "Check your connection and try again." Button: "Try again" |
| Add failed | "Couldn't add that todo. Your text is still in the box." |
| Toggle failed | "Couldn't update that todo. Please try again." |
| Edit failed | "Couldn't save your edit. Please try again." |
| Delete failed | "Couldn't delete that todo. Please try again." |
| Description too long (from the Todo API) | "That todo is too long. Keep it under 500 characters." |
| Character counter | "{n} / 500" |
| Edit button label (for screen readers) | "Edit todo: {Description}" |
| Delete button label (for screen readers) | "Delete todo: {Description}" |
| Checkbox label (for screen readers) | "Mark as done: {Description}" / "Mark as not done: {Description}" |

| Do | Don't |
|---|---|
| "Couldn't save your edit. Please try again." | "Error 500: Internal Server Error" |
| "Nothing here yet." | "You're all caught up! 🎉" |
| "Add" | "Submit" / "Create new item" |

## Component Patterns

These are behavioral rules. The visual specs are in `DESIGN.md` → Components.

| Component | Behavioral rules |
|---|---|
| Add row | Focused automatically on page load (desktop only, so the on-screen keyboard doesn't pop up on phones) `[ASSUMPTION]`. **Enter** or **Add** submits the Description. Surrounding whitespace is trimmed. An empty or whitespace-only Description does nothing: no error, and focus stays (FR-5). On submit, the new Todo appears at the top of the list at once, the input clears, and focus stays in the input (FR-4). Input stops at 500 characters (`maxlength`). The character counter appears at 450 characters. |
| Todo row | Shows the checkbox, the Description, the Created At time, and Edit and Delete. The whole row is **not** clickable, to avoid toggling or editing by accident. Only the checkbox, the Description (double-click to edit), and the buttons respond. |
| Completion checkbox | One click, tap, or **Space** toggles the Completion Status with an Optimistic Update. The row keeps its position (FR-7). |
| Inline edit field | Opened by the Edit button (any device), by double-clicking the Description (pointer devices), or by pressing **Enter** while the Edit button is focused. It opens pre-filled with the Description, with all text selected. **Enter** or blur saves. **Escape** cancels and restores the original. If the text is empty after trimming, or unchanged, the edit is cancelled and nothing is saved or deleted. Shift+Enter does nothing, because Descriptions are one logical line that wraps visually. Only one Todo can be in edit mode at a time; opening another commits the first. |
| Delete button | Deletes immediately, with no confirmation (FR-8). The row collapses and focus moves (see Interaction Primitives). |
| Created At time | Shown relative ("just now", "5m ago", "2h ago", "yesterday", then a short date such as "Sep 12"). The full date and time appears on hover or focus in a `Tooltip`, and is exposed via `<time datetime>`. Relative times refresh every minute without re-rendering the whole list. |
| Toast | Error variant only, one message per failed action. It appears bottom-center below 640px and bottom-right above it. Auto-dismisses after 6 s, and can be dismissed by clicking or pressing Escape. It has no "Retry" action, because the user retries by doing the action again `[ASSUMPTION]`. Several failures stack, with at most 3 visible. |
| Character counter | Hidden below 450 characters. From 450 it shows "{n} / 500", and at 500 it turns destructive. It is announced politely to screen readers only when it first appears and when it reaches 500. |

## State Patterns

**List States (FR-3):**

| State | Trigger | Treatment |
|---|---|---|
| Loading | Initial fetch in progress | Nothing is shown for the first 300 ms. After that, 3–5 skeleton rows appear. The add row is visible but disabled until the data arrives `[ASSUMPTION]`. |
| Empty | The fetch succeeded with zero Todos | "Nothing here yet." / "Add your first todo above." The add row is enabled and focused (desktop). |
| Populated | The fetch succeeded with ≥ 1 Todo | Todos ordered newest first, with Completed Todos in place. |
| Error | The initial fetch failed or timed out (10 s) | "Couldn't load your todos." plus a "Try again" button. The add row is hidden, so work can't be entered into a list that failed to load. "Try again" goes back to Loading. |

**Row-level states:**

| State | Treatment |
|---|---|
| Pending (Optimistic Update not yet confirmed) | Looks exactly like the confirmed state. Later actions on the same Todo are queued in order (FR-10). |
| Failed create | The row is removed, the Description is put back in the add input with focus, and a toast appears. If the user has already typed something new, the failed text is **not** put back over it; the toast says "Couldn't add that todo." instead `[ASSUMPTION]`. |
| Failed toggle or delete | The row goes back to its last confirmed state and position, and a toast appears. |
| Failed edit | The row stays in or reopens edit mode with the attempted text, and a toast appears (FR-10). |
| Todo API validation error | The API's human-readable message is shown in the toast, and the row rolls back. |
| Long Description | Wraps in full, and unbroken strings break anywhere. There is no truncation and no "show more". |

## Interaction Primitives

**Keyboard.** Everything works without a mouse.

- **Tab order:** add input → Add button → then, for each row, checkbox → Edit → Delete. Timestamps are focusable only through their tooltip trigger `[ASSUMPTION: the timestamp is not a separate tab stop; the absolute time is also in the accessible name of the Description]`.
- **Enter** in the add input: submit. **Enter** or **Space** on a focused button activates it. **Space** on the checkbox toggles it.
- **Escape**: cancels an inline edit and returns focus to that row's Edit button. It also dismisses the newest toast.
- **Focus after delete:** moves to the next row's checkbox. If there is no next row, the previous row's checkbox. If the list is now empty, the add input.
- **Focus after a failed delete rolls back:** the restored row's checkbox.

**Pointer and touch.**

- On pointer devices that support hover (`@media (hover: hover)`), the Edit and Delete buttons stay hidden (opacity 0, but still in the tab order) until the row is hovered or has focus inside it. On touch devices they are always visible (FR-8).
- Double-clicking a Description opens inline edit on pointer devices. Touch devices use the Edit button, so an accidental tap never opens edit mode.
- There is no swipe-to-delete, no drag-to-reorder, and no long-press menu.

**Motion.** Rows appear and disappear with a 150 ms height and opacity transition, so the list doesn't jump (NFR-12). Checking a box has no animation beyond shadcn's default checkbox transition. With `prefers-reduced-motion: reduce`, all transitions are instant.

**Not allowed:** confirmation dialogs, modal overlays of any kind, celebration animations, infinite scroll, controls that appear only on hover on touch devices, and auto-sorting Completed Todos.

## Accessibility Floor

Behavioral rules. Visual contrast is in `DESIGN.md` → Colors. Target: WCAG 2.1 AA (NFR-4).

- **Landmarks:** a `<header>` with an `<h1>` of "Todos", and a `<main>` containing the add form (a `<form>` with a visually hidden label "New todo") and the list (`<ul aria-label="Todos">`).
- **Checkbox:** a real checkbox (shadcn/Radix), with its checked state exposed and an accessible name that includes the Description.
- **Announcements:** a polite `aria-live` region announces "Todo added", "Marked as done", "Marked as not done", "Todo deleted", and "Todo updated". Save failures are announced by the toast, which uses `role="status"`. It could use `alert`, but `status` avoids interrupting the user `[ASSUMPTION]`. The load error uses `role="alert"`.
- **Loading:** the list has `aria-busy="true"` while loading. The skeleton rows are `aria-hidden`.
- **Focus:** the focus ring is always visible (`{components.focus-ring}`), and focus is never lost or moved to `<body>` after any action (see Interaction Primitives).
- **Touch targets:** at least `{spacing.touch-target}` (44×44 px) for the checkbox, Edit, Delete, and Add.
- **Zoom:** usable at 200% browser zoom and at a 320px width with no horizontal scrolling.

## Responsive & Platform

| Width | Behavior |
|---|---|
| < 640px | `{spacing.gutter-mobile}` gutters. Edit and Delete are always visible. Toasts appear bottom-center. The add input is not auto-focused. |
| ≥ 640px | `{spacing.gutter-desktop}` gutters. The column is capped at `{spacing.content-max}` and centered. Toasts appear bottom-right. |

Whether Edit and Delete are visible depends on the device's hover capability, not on its width. A touch laptop with a mouse gets hover behavior. The same single column is used at every width. There is no PWA, no offline mode, and no native app (PRD §6.2). Supported browsers are listed in PRD NFR-5.

## Key Flows

UJ-4 (Sam, a developer, extends the app) has no UI and is handled by architecture and the README, so there is no flow for it here.

### Flow 1: Dana clears her morning in two minutes (UJ-1)

1. Dana, an internal operations analyst, opens her Todos URL on her laptop. The data arrives in under 300 ms, so no skeleton appears, and the add input is focused.
2. She types "Send Q3 access review reminder" and presses **Enter**. The Todo appears at the top at once, the input clears, and focus stays in it.
3. She double-clicks yesterday's "Book room for retor". The text becomes editable, with everything selected. She corrects it to "retro" and presses **Enter**. The row stays where it is.
4. She clicks the checkbox on "Reply to IT ticket". It fills with teal, and the text gets a line-through and turns muted.
5. **Climax:** she refreshes out of habit. Everything is exactly as she left it: the new Todo at the top, the fixed typo, and the Completed Todo still in place.
6. She hovers two old Completed Todos in turn and clicks Delete on each. They collapse smoothly, and focus moves to the next row.

**Failure:** the server is unreachable when she ticks a Todo. The checkbox fills, then un-fills within 10 s, and a toast says "Couldn't update that todo. Please try again." Nothing else on screen changes, so she ticks it again once she's back online.

### Flow 2: Dana checks her list from her phone (UJ-2)

1. Walking to a meeting, Dana opens Todos in her phone's browser. The list fits the screen width, and Edit and Delete are visible on every row.
2. She taps the checkbox on a finished Todo. It is marked as done at once.
3. She taps the add input, types "Follow up with facilities", and taps **Add**. The input doesn't zoom, and the new Todo appears at the top.
4. **Climax:** back at her laptop, she reloads Todos, and the Todo she added on her phone is there.

**Failure:** she taps Delete by mistake. There is no undo in v1, so she re-adds the Todo. `[NOTE FOR UX: if this happens often in practice, revisit PRD FR-8 (no confirmation, no undo)]`

### Flow 3: Priya opens her new Deployment for the first time (UJ-3)

1. Priya, a product designer, opens her new Todos URL.
2. For a moment nothing shows, then (if the data takes longer than 300 ms) skeleton rows appear.
3. The Empty state appears: "Nothing here yet." / "Add your first todo above." The add input is right above it, with its cursor ready.
4. **Climax:** she types "Draft onboarding sketches" and presses **Enter**. The Empty state is replaced by her first Todo, without any explanation needed.

**Failure:** the Todo API is down when she opens the page. She sees "Couldn't load your todos." with **Try again**, rather than an empty list that would suggest she has no data. She clicks Try again once the server is back, and the list loads.
