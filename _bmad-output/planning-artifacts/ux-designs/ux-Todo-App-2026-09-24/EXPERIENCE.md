---
name: Todos
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/addendum.md
created: 2026-09-24
updated: 2026-09-24
---

# Todos — Experience Spine

## Foundation

Todos is a responsive web app with a single screen, for desktop and mobile browsers from 320px to 1920px wide. It is built with shadcn/ui and Tailwind CSS, and this spine specifies only the behavior that differs from shadcn's defaults. `DESIGN.md` is the visual reference; component names here match its Components section exactly. Domain terms (Todo, Description, Completion Status, Active Todo, Completed Todo, Created At, Todo List, Optimistic Update, List States) are used exactly as the PRD Glossary defines them.

There is one personal Todo List per Deployment, with no sign-in. The color mode follows the operating system's light or dark setting; there is no in-app toggle. The browser tab title is "Todos", and the favicon is the one specified in `DESIGN.md` (NFR-12).

→ Composition reference: [`mockups/todo-list.html`](mockups/todo-list.html). **The spines win on any conflict with the mock.**

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Todo List view | Opening the app URL | The only screen: the App header, the Add row, and the Todo List in one of its List States. |
| Toast region | Appears over the Todo List view | Non-blocking messages when a change fails to save (FR-10). |

There are no routes, navigation, dialogs, or settings. Every PRD capability lands on the Todo List view:

| Need | Delivered by | Journey |
|---|---|---|
| See the list when the app opens (FR-1, FR-3) | Todo List view, List States | UJ-1, UJ-3 |
| Add a Todo (FR-4, FR-5) | Add row | UJ-1, UJ-2, UJ-3 |
| Edit a Todo (FR-6) | Inline edit field | UJ-1 |
| Complete or un-complete a Todo (FR-2, FR-7) | Completion checkbox | UJ-1, UJ-2 |
| Delete a Todo (FR-8) | Delete button (Row actions) | UJ-1 |
| Get feedback when a change fails (FR-10) | Toast, plus the row rolling back | UJ-1 (edge case) |

## Voice and Tone

The voice is plain and friendly: short, human, and direct. No jokes, no exclamation marks, no emoji. Buttons are labeled with verbs. Error messages say what happened and what to do next, and never show error codes. UI text uses lowercase "todo"; the capitalized Glossary term appears only in specs.

The app maps every error the Todo API returns to the copy below. It never displays raw API text.

| Moment | Copy |
|---|---|
| Add row placeholder | "Add a todo…" |
| Add button | "Add" |
| Empty state | **"Nothing here yet."** / "Add your first todo above." |
| Load error state | **"Couldn't load your todos."** / "Check your connection and try again." Button: "Try again" |
| Add failed, text restored to the input | "Couldn't add that todo. Your text is back in the box." |
| Add failed, input already has new text | "Couldn't add “{quote}”." Action: "Retry". {quote} is the Description as-is at 40 characters or fewer, otherwise its first 40 characters and "…". |
| Toggle failed | "Couldn't update that todo. Please try again." |
| Edit failed, edit mode reopened | "Couldn't save your edit. Please try again." |
| Edit failed, another Todo is being edited | "Couldn't save your edit to “{quote}”." Action: "Retry". {quote} is the Description as-is at 40 characters or fewer, otherwise its first 40 characters and "…". |
| Delete failed | "Couldn't delete that todo. Please try again." |
| Description too long (Todo API validation error) | "That todo is too long. The limit is 500 characters." |
| Any other Todo API error | The failure copy for that action (above) |
| Character counter | "{n} / 500" |
| Completion checkbox accessible name | "{Description}". Its checked state conveys done / not done. |
| Edit button accessible name | "Edit todo: {Description}" |
| Delete button accessible name | "Delete todo: {Description}" |
| Created At time while its row has focus | "Created {full date and time}", e.g. "Created Sep 24, 2026, 9:14 AM" |

| Do | Don't |
|---|---|
| "Couldn't save your edit. Please try again." | "Error 500: Internal Server Error" |
| "Nothing here yet." | "You're all caught up! 🎉" |
| "Add" | "Submit" / "Create new item" |

## Component Patterns

This section covers behavior only. Visual specs are in `DESIGN.md` → Components. "Instant" means the change is visible within **100 ms** of the user's action (FR-4, FR-7, FR-8, NFR-1).

| Component | Behavioral rules |
|---|---|
| App header | Static. Contains an `<h1>` of "Todos". |
| Add row | **Enter** or **Add** submits. Leading and trailing whitespace is trimmed. An empty or whitespace-only Description does nothing: no error, and focus stays in the input (FR-5). On a valid submit, the new Todo appears instantly at the top of the list, the input clears, and focus stays in it (FR-4). Typing stops at 500 characters (`maxlength`). The character counter shows from 450 characters. The input is focused on page load only on hover-capable pointer devices, so the on-screen keyboard doesn't pop up on touch devices `[ASSUMPTION]`. The row is disabled in the Loading and Load error states. |
| Todo row | Contains the Completion checkbox, the Description, the Created At time, and the Row actions. The row itself isn't clickable; only its controls respond. Double-clicking the Description opens the Inline edit field (hover-capable pointer devices only). The Description is rendered as plain text: HTML and Markdown are shown literally, and URLs are not turned into links (NFR-10) `[ASSUMPTION: no linkification in v1]`. |
| Completion checkbox | One click, tap, or **Space** toggles the Completion Status instantly (Optimistic Update). The row keeps its position (FR-7). |
| Row actions (Edit button, Delete button) | **Edit button:** opens the Inline edit field. **Delete button:** deletes the Todo instantly, with no confirmation (FR-8). Focus after a delete and Row actions visibility are in Interaction Primitives. |
| Inline edit field | Opens from the Edit button (any device) or by double-clicking the Description (hover-capable pointer devices only). It opens pre-filled with the Description, all text selected, and grows to fit its content. **Enter** or blur saves; after Enter, focus returns to that row's Edit button, and after a blur it stays where it went. Switching away from the browser window (for example alt-tab) is not a blur save: the field stays open. **Escape** cancels and restores the original text. New lines can't be entered: Enter always saves, and pasted line breaks become spaces. The Add row's 500-character cap and 450/500 character counter apply (FR-6 via FR-5). The edit field's counter line is always reserved, so the row grows once when editing starts (intended, 2026-09-26, G-13) and does not jump at 450 characters. If the text is empty after trimming, or unchanged, the edit is canceled and nothing is saved or deleted. Only one Todo can be edited at a time; opening another first commits the open one (saved if changed, as its blur would), even if its field doesn't have focus. |
| Created At time | A `<time datetime>` element. It shows relative time: "just now", "5m ago", "2h ago", "yesterday", then a short date such as "Sep 12". On pointer hover, a `Tooltip` shows the full date and time. **While any control in its row has focus** (`:focus-within`), it shows "Created {full date and time}" in place of the relative text, so keyboard users can see it without an extra tab stop. Relative times refresh every minute, without re-rendering the whole list. |
| Toast | Error toasts only, one per failed action, at bottom-center below 640px and bottom-right from 640px up. Plain failure toasts auto-dismiss after 8 s, and the timer pauses on hover or focus. **Toasts whose text can't be recovered anywhere else** (they carry a "Retry" action) **stay until the user acts on them or dismisses them.** "Retry" resubmits the failed change. Up to 3 toasts are visible at once; older ones collapse into Sonner's stack. |
| Favicon | Static. The browser tab title is always "Todos". |

**Scale:** The list renders every Todo without virtualization or pagination. NFR-1 sets the upper bound at 1,000 Todos.

## State Patterns

**List States (FR-3):**

| State | Trigger | Treatment |
|---|---|---|
| Loading | The initial fetch is in progress | Nothing is shown for the first 300 ms. After that, the Loading skeleton appears and the list has `aria-busy="true"`. The Add row is visible but disabled. |
| Empty | The fetch succeeded with no Todos | The Empty state. The Add row is enabled, and focused on hover-capable pointer devices. |
| Populated | The fetch succeeded with at least one Todo | Todos appear newest first. Completed Todos stay in place. |
| Load error | The initial fetch failed or took longer than 10 s | The Load error state with "Try again". The Add row stays visible but **disabled**, so the layout doesn't jump and nothing can be added to a list that failed to load. "Try again" returns to Loading. |

**Row-level states (FR-10).** When a change fails, the UI returns to the **last state the Todo API confirmed**. It never keeps showing the unconfirmed change. Rolling back never moves keyboard focus unless the focused element has disappeared.

| State | Treatment |
|---|---|
| Pending (an Optimistic Update the API hasn't confirmed yet) | Looks exactly like a confirmed Todo. Further actions on the same Todo are queued and applied in the order the user made them. If one fails, the queued actions after it are dropped. |
| Failed create, input empty | The row is removed, and its Description is put back into the Add row input. Focus goes there only if focus is currently on `<body>` or the Add row. A toast says "Couldn't add that todo. Your text is back in the box." |
| Failed create, input has new text | The row is removed, and the new text in the input is left alone. A persistent toast quotes the failed Description and offers "Retry", so the text is never lost. |
| Failed toggle | The Completion checkbox returns to its confirmed state. A toast appears. |
| Failed delete | The row reappears in its original position. If focus is still where the delete moved it, or is on `<body>` or blank list space, it goes back to the restored row's Completion checkbox. If the user has since moved focus elsewhere (for example, into the Add row), it stays there. A toast appears. |
| Failed edit, no other edit open | The row reopens the Inline edit field with the attempted text. It takes focus only if focus is on `<body>`, on blank list space, or on that row. A toast appears. |
| Failed edit, another Todo is being edited | Also applies when the user has already reopened this row's own edit field, so the text being typed is never overwritten. The row shows its confirmed Description. A persistent toast quotes the attempted text and offers "Retry", which resends the same change and announces "Todo updated". |
| Todo API validation error | Handled as a failure for that action. The toast shows the matching copy from Voice and Tone. |
| Long Description | Wraps in full, with unbroken strings wrapping too. No truncation and no "show more". |

## Interaction Primitives

**Keyboard.** Everything works without a mouse.

- **Tab order:** Add row input → Add button → then, for each Todo row, Completion checkbox → Edit button → Delete button.
- **Enter** in the Add row input submits. **Enter** or **Space** on a focused button activates it. **Space** on the Completion checkbox toggles it.
- **Escape**, in priority order:
  1. If the Inline edit field is open, cancel the edit and return focus to that row's Edit button.
  2. Otherwise, dismiss the newest toast.
- **Focus after a delete:** the next row's Completion checkbox. If there is no next row, the previous row's. If the list is now empty, the Add row input.

**Pointer and touch.** Visibility and gestures depend on **input capability, not screen width**:

- **Hover-capable pointers** (`@media (hover: hover) and (pointer: fine)`): the Row actions are hidden (opacity 0, still in the tab order) until the row is hovered or contains focus. Double-clicking the Description opens the Inline edit field. The Add row input is focused on page load.
- **Everything else** (touch and coarse pointers): the Row actions are always visible (FR-8). Double-click editing is off, so a stray tap never opens edit mode. The Add row input is not focused on page load.
- Not supported: swipe-to-delete, drag-to-reorder, long-press menus.

**Motion.**

- **Adding:** the row appears at full opacity instantly. Its height then expands over 150 ms.
- **Deleting:** the row fades to transparent within 100 ms, which is what makes the delete feel instant (FR-8). Its height then collapses over 150 ms, so the list doesn't jump (NFR-12).
- **Checking:** the Completion checkbox uses shadcn's default transition, with no extra animation.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, all transitions are instant.

**Not allowed:** confirmation dialogs, modal overlays of any kind, celebratory animations, infinite scroll, controls that appear only on hover on touch devices, and automatically moving Completed Todos to the bottom.

## Accessibility Floor

This section covers behavior only. Visual contrast is in `DESIGN.md` → Colors. The target is WCAG 2.1 AA (NFR-4).

- **Landmarks and labels:** a `<header>` contains the `<h1>` "Todos". A `<main>` contains the Add row and the list. The Add row is a `<form>` whose input has the visually hidden label "New todo"; the list is a `<ul aria-label="Todos">`.
- **Completion checkbox:** a real checkbox (shadcn/Radix). Its accessible name is the Description, and its checked state is exposed. The name doesn't change when the box is toggled.
- **Announcements:** a polite `aria-live` region announces "Todo added", "Marked as done", "Marked as not done", "Todo deleted", and "Todo updated". Failure toasts use `role="status"` so they don't interrupt `[ASSUMPTION]`. The Load error state uses `role="alert"`. The character counter is announced politely when it first appears and when it reaches 500.
- **Loading:** the list has `aria-busy="true"`, and the Loading skeleton is `aria-hidden`.
- **Focus:** the focus ring (`{components.focus-ring}`) is always visible. Focus is never lost to `<body>` after any action, and a background rollback moves it only in the cases State Patterns specifies (the focused element disappeared, or a failed delete restores the row it had moved away from).
- **Touch targets:** the Completion checkbox (`{components.completion-checkbox.hitArea}`), the Row actions, and the Add button are all at least `{spacing.touch-target}` (44×44 px).
- **Timing:** any toast whose content can't be recovered elsewhere stays until the user dismisses it. Other toasts pause while hovered or focused.
- **Zoom:** the app is usable at 200% browser zoom and at 320px width, with no horizontal scrolling.

## Responsive & Platform

| Width | Behavior |
|---|---|
| < 640px | `{spacing.gutter-mobile}` gutters and `{spacing.page-top-mobile}` top spacing. Toasts appear bottom-center. |
| ≥ 640px | `{spacing.gutter-desktop}` gutters and `{spacing.page-top-desktop}` top spacing. The column is capped at `{spacing.content-max}` and centered. Toasts appear bottom-right. |

Width controls only spacing and toast position. Row actions visibility, double-click editing, and page-load focus all depend on input capability (see Interaction Primitives). A narrow desktop window behaves like desktop, and a large tablet behaves like touch. The layout is the same single column at every width. There is no PWA, no offline mode, and no native app (PRD §6.2). Supported browsers are listed in PRD NFR-5.

## Key Flows

UJ-4 (Sam, a developer, extends the app) has no UI and is covered by the architecture and the README, so there is no flow for it here.

### Flow 1: Dana clears her morning in two minutes (UJ-1)

1. Dana, an internal operations analyst, opens her Todos URL on her laptop. The data arrives in under 300 ms, so no skeleton shows, and the Add row input already has focus.
2. She types "Send Q3 access review reminder" and presses **Enter**. The Todo appears at the top instantly, the input clears, and focus stays in it.
3. She double-clicks yesterday's "Book room for retor". The Inline edit field opens with all the text selected. She corrects it to "retro" and presses **Enter**. The row stays where it is.
4. She clicks the Completion checkbox on "Reply to IT ticket". The box fills teal, and the Description gets a line-through and turns muted.
5. **Climax:** out of habit, she refreshes. Everything is exactly as she left it: the new Todo at the top, the fixed typo, and the Completed Todo still in place.
6. She hovers over two old Completed Todos in turn and clicks Delete on each. Each one fades instantly, then collapses smoothly.

**Failure:** the server is unreachable when she ticks a Todo. The box fills, then clears again once the request fails or times out (after up to 10 s). A toast says "Couldn't update that todo. Please try again." Nothing else on screen changes, and focus stays where she left it. She ticks it again once she's back online.

### Flow 2: Dana checks her list from her phone (UJ-2)

1. Walking to a meeting, Dana opens Todos in her phone's browser. The list fits the screen width, and every row shows Edit and Delete.
2. She taps the Completion checkbox on a finished Todo, and it is marked done instantly.
3. She taps the Add row input, types "Follow up with facilities", and taps **Add**. The page doesn't zoom, and the new Todo appears at the top.
4. **Climax:** back at her laptop, she reloads Todos, and the Todo she added on her phone is there.

**Failure:** she taps Delete by mistake. v1 has no undo, so she adds the Todo again. `[NOTE FOR UX: if this happens often in practice, revisit PRD FR-8 (no confirmation, no undo)]`

### Flow 3: Priya opens her new Deployment for the first time (UJ-3)

1. Priya, a product designer, opens her new Todos URL on her laptop.
2. For a moment, nothing shows. If loading takes longer than 300 ms, the Loading skeleton appears under a disabled Add row.
3. The Empty state appears: "Nothing here yet." / "Add your first todo above." The Add row above it is enabled, with the cursor ready.
4. **Climax:** she types "Draft onboarding sketches" and presses **Enter**. Her first Todo replaces the Empty state, and nothing needed explaining.

**Failure:** the Todo API is down when she opens the page. Instead of an empty list that suggests she has no data, she sees "Couldn't load your todos." with **Try again**. Once the server is back, she clicks Try again and the list loads.
