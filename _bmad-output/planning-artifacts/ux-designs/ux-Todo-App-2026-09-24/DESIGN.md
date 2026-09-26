---
name: Todos
description: A calm, minimal personal todo list, built on shadcn/ui and Tailwind. This DESIGN.md specifies only the brand-layer changes to shadcn's defaults.
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/addendum.md
created: 2026-09-24
updated: 2026-09-24
colors:
  # Brand overrides on top of the shadcn "neutral" base theme. Every token
  # not listed here comes from shadcn: background, foreground, muted,
  # muted-foreground, accent, border, input, card, popover, secondary, destructive.
  # Light and dark values are paired; the dark value applies under prefers-color-scheme: dark.
  primary: '#2F6F6A'
  primary-foreground: '#FFFFFF'
  primary-dark: '#5FB3AA'
  primary-foreground-dark: '#0A0A0A'
  ring: '#2F6F6A'
  ring-dark: '#5FB3AA'
typography:
  # Body, label and small text use shadcn's default sans stack: Geist Variable
  # (@fontsource-variable/geist), the final font (decided 2026-09-26, G-12 in deferred-work.md).
  # Only the roles Todos needs are named here.
  app-title:
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  todo-description:
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  meta:
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  empty-title:
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  # The shadcn --radius scale is used unchanged.
spacing:
  # Tailwind's 4-based scale is used unchanged. Named layout tokens:
  content-max: 576px
  gutter-mobile: 16px
  gutter-desktop: 24px
  page-top-mobile: 24px
  page-top-desktop: 64px
  header-gap: 24px
  list-gap: 16px
  counter-line: 16px
  row-padding-y: 12px
  touch-target: 44px
components:
  app-header:
    typography: '{typography.app-title}'
    align: 'left'
    marginBottom: '{spacing.header-gap}'
  add-row:
    inputFontSize: '{typography.todo-description.fontSize}'
    height: '{spacing.touch-target}'
    buttonBackground: '{colors.primary}'
    buttonForeground: '{colors.primary-foreground}'
    marginBottom: '{spacing.list-gap}'
  character-counter:
    typography: '{typography.meta}'
    color: 'shadcn muted-foreground'
    atLimitColor: 'shadcn destructive'
    reservedHeight: '{spacing.counter-line}'
  todo-row:
    background: 'transparent'
    hoverBackground: 'transparent'
    divider: 'shadcn border token, 1px, bottom only'
    paddingY: '{spacing.row-padding-y}'
    minHeight: '{spacing.touch-target}'
    controlAlign: 'top, aligned to the first line of the Description'
  completion-checkbox:
    visualSize: 16px
    hitArea: '{spacing.touch-target}'
    checkedBackground: '{colors.primary}'
    checkedForeground: '{colors.primary-foreground}'
  completed-description:
    color: 'shadcn muted-foreground'
    textDecoration: 'line-through'
  created-at-time:
    typography: '{typography.meta}'
    color: 'shadcn muted-foreground'
  row-actions:
    buttonSize: '{spacing.touch-target}'
    iconSize: 16px
    color: 'shadcn muted-foreground'
    editHoverColor: 'shadcn foreground'
    deleteHoverColor: 'shadcn destructive'
  inline-edit-field:
    element: 'auto-growing textarea'
    typography: '{typography.todo-description}'
  loading-skeleton:
    rows: 4
    color: 'shadcn Skeleton default (accent token)'
  toast:
    variant: 'Sonner default (neutral popover surface), not richColors'
    icon: 'lucide CircleX in shadcn destructive'
  focus-ring:
    color: '{colors.ring}'
    width: 2px
    offset: 2px
  favicon:
    shape: 'checkmark on a rounded square'
    fill: '{colors.primary}'
    mark: '{colors.primary-foreground}'
---

## Brand & Style

Todos is a personal list that stays out of the way. The aesthetic is **calm and minimal**: a neutral canvas, plenty of whitespace, one column of content, and a single quiet accent. Nothing competes with the user's own words. The Todo Description is the content, and all the chrome recedes.

Todos uses shadcn/ui's defaults, with the neutral base theme. This DESIGN.md specifies only the brand layer: one accent color, a small type ramp, layout tokens, and the look of the few components specific to Todos. Every other shadcn component (Button, Input, Textarea, Checkbox, Skeleton, Sonner, Tooltip) keeps its shadcn visual spec.

→ Visual reference: [`mockups/todo-list.html`](mockups/todo-list.html). It shows the populated list in light and dark mode, the mobile layout with inline editing, and the empty, loading, error, and toast states. **The spines win on any conflict with a mock.**

## Colors

There is one brand color. Everything else uses shadcn's neutrals.

- **Quiet Teal** (`#2F6F6A` light / `#5FB3AA` dark) is the brand color `[ASSUMPTION: the facilitator chose this hue on the Fast path; any calm, low-saturation accent that passes the contrast checks below can replace it]`. It is used for the checked Completion checkbox, the Add button, the focus ring, and the favicon. It is never used for decoration, backgrounds, or blocks of text.
- **Neutrals** (`background`, `foreground`, `muted-foreground`, `border`, `input`, `accent`) come from shadcn's neutral theme. A Completed Todo's Description uses `muted-foreground`.
- **Destructive**, also from shadcn, appears in only three places: the Delete button's icon on hover or `focus-visible`, the character counter at 500 characters, and the toast's error icon.

**Contrast targets (WCAG 2.1 AA, verified):**

| Pair | Mode | Target | Measured |
|---|---|---|---|
| `{colors.primary-foreground}` on `{colors.primary}` (Add button, check mark) | light | ≥ 4.5:1 | 5.83:1 |
| `{colors.primary-foreground-dark}` on `{colors.primary-dark}` | dark | ≥ 4.5:1 | 8.03:1 |
| `muted-foreground` on `background` (Completed Description, meta text) | light / dark | ≥ 4.5:1 | 4.74:1 / 7.66:1 |
| `{colors.ring}` against `background` | light / dark | ≥ 3:1 | 5.83:1 / 8.03:1 |

Avoid gradients, colored surfaces, color-coding by state beyond the checked Completion checkbox, and any second accent.

## Typography

Todos uses shadcn's default sans stack, Geist Variable (shadcn's current preset). Geist is the final font (decided 2026-09-26, G-12 in `deferred-work.md`); the mockup's system UI stack is superseded. It has four named roles:

- **`app-title`** (24px, 600): the product name "Todos", left-aligned in the App header, once per page.
- **`todo-description`** (16px, 400, line height 1.5): every Todo Description, the Add row input, and the Inline edit field. At 16px, iOS Safari does not zoom the page when an input is focused.
- **`meta`** (12px): the Created At time and the character counter.
- **`empty-title`** (18px, 500): the headline of the Empty and Load error states.

Long Descriptions wrap onto as many lines as they need and are never truncated. Unbroken strings such as URLs wrap too (`overflow-wrap: anywhere`), so they never cause horizontal scrolling.

## Layout & Spacing

The layout is one centered column, no wider than `{spacing.content-max}` (576px). Side gutters are `{spacing.gutter-mobile}` below 640px and `{spacing.gutter-desktop}` from 640px up. The space above the App header is `{spacing.page-top-mobile}` on mobile and `{spacing.page-top-desktop}` on desktop. Top to bottom, the column holds:

1. The App header, followed by `{spacing.header-gap}` of space.
2. The Add row, including a `{spacing.counter-line}` line reserved for the character counter, followed by `{spacing.list-gap}` of space.
3. The Todo List.

There is no sidebar, no footer, and no second column at any width.

Todo rows have `{spacing.row-padding-y}` of vertical padding and are at least `{spacing.touch-target}` tall. The Completion checkbox and Row actions align with the **first line** of the Description, so a long Description wraps below them while they stay at the top. Everything else uses Tailwind's standard 4-based spacing scale.

## Elevation & Depth

The design is flat. Todo rows have no shadow, no card surface, and no background on hover. They are separated only by a 1px `border` divider. The only element with elevation is the Sonner toast, which keeps its default shadow.

## Shapes

The shadcn `--radius` scale is used unchanged. The checkbox, inputs, buttons, and toast take shadcn's default corner radii. There are no pill shapes and no custom shapes.

## Components

These shadcn components are used unchanged: `Input`, `Textarea`, `Button` (the ghost variant for Row actions, the secondary variant for "Try again"), `Checkbox`, `Skeleton`, `Sonner`, `Tooltip`.

Todos-specific components and brand-layer overrides:

- **App header:** "Todos" in `app-title`, left-aligned.
- **Add row:** a full-width `Input` in `todo-description` style, with a primary `Button` labeled "Add" on the right. Both are `{spacing.touch-target}` tall. The **character counter** (`{components.character-counter}`) sits under the input, right-aligned to the input rather than the button. Its line is always reserved, so the counter never pushes the layout down. It is visible only from 450 characters and turns destructive at 500. When disabled (in the Loading and Load error states), the whole row uses shadcn's disabled style (50% opacity).
- **Todo row:** left to right, the Completion checkbox, then the Description (`todo-description`), then the Row actions. The Created At time (`meta`, `muted-foreground`) sits on its own line below them, starting under the Description and spanning the Description and Row actions columns. That gives "Created {full date and time}" room to stay on one line down to 320px. The row is transparent with a bottom divider and has no hover background.
- **Completion checkbox:** shadcn `Checkbox` with a 16px visual size, centered in a `{spacing.touch-target}` hit area that overlaps the row padding. The hit area is pulled 14px left, so the box lines up with the Add row input's left edge. It has a 16px right margin, so the open Inline edit field (pulled left by its own padding) never covers it, and the Description starts 50px in. The Row actions are pulled 12px right, so the Delete icon ends near the column's edge. Where the mock places the Description closer (34px), the 44×44 hit area wins. When checked, it is filled with `{colors.primary}` and shows a `{colors.primary-foreground}` check mark.
- **Completed Todo row:** the Completion checkbox is checked, and the Description uses line-through and `muted-foreground`. With three cues, status never relies on color alone. The row keeps its place in the list.
- **Row actions (Edit button, Delete button):** ghost `Button`s with a `{spacing.touch-target}` hit area, showing lucide `Pencil` and `Trash2` icons at 16px in `muted-foreground`. On hover or `focus-visible`, the Edit button turns `foreground` and the Delete button turns `destructive`.
- **Inline edit field:** an auto-growing `Textarea` that replaces the Description text in place, in `todo-description` style, with its text starting at the same left edge as the Description. While editing, the Created At time and the Row actions stay visible. A character counter (same spec as in the Add row) sits under the field. Its line is always reserved while the field is open, and it is visible from 450 characters. With the field's own padding, this makes the row about 22px taller once, when editing starts. That is intended (decided 2026-09-26, G-13 in `deferred-work.md`): reserving the line up front means the counter appearing at 450 characters causes no layout jump (NFR-12).
- **Created At time:** in `meta` style. It shows a relative time by default, and switches to the full date and time while anything in its row has focus (see EXPERIENCE.md).
- **Empty state:** a centered block in the list area. It has an `empty-title` headline and one line of 14px body text (Tailwind `text-sm`) in `muted-foreground`. No illustration `[ASSUMPTION: no illustration, to stay calm and minimal]`.
- **Load error state:** the same layout as the Empty state, plus a secondary `Button` labeled "Try again".
- **Loading skeleton:** four shadcn `Skeleton` rows shaped like Todo rows: a 16px square, one text bar, and a short meta bar.
- **Toast:** Sonner in its default style (neutral popover surface, not `richColors`), with a lucide `CircleX` icon in `destructive`. An optional text action ("Retry") uses shadcn's action-button style.
- **Favicon:** a white check mark (`{colors.primary-foreground}`) on a rounded `{colors.primary}` square. It reads well on both light and dark browser tabs. The browser tab title is "Todos".

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep one centered column at every width | Add sidebars, cards, or a second column |
| Use `{colors.primary}` only for the checked Completion checkbox, the Add button, the focus ring, and the favicon | Tint rows or backgrounds with the accent |
| Show Completed status with a check, line-through, and muted text together | Rely on color alone, or hide Completed Todos |
| Use shadcn defaults for everything outside the brand layer | Restyle shadcn primitives to "make them pop" |
| Let Descriptions wrap in full | Truncate Descriptions with an ellipsis |
| Reserve space for elements that appear conditionally, like the counter | Let a newly shown element push the list down |
| Use short, quiet opacity and height transitions | Use bouncy, celebratory, or confetti animations |
