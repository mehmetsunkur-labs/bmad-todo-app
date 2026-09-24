---
name: Todos
description: A calm, minimal personal todo list. Built with shadcn/ui and Tailwind; this DESIGN.md specifies only the brand-layer changes on top of the shadcn defaults.
status: draft
sources:
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Todo-App-2026-09-24/addendum.md
created: 2026-09-24
updated: 2026-09-24
colors:
  # Brand overrides on top of the shadcn "neutral" base theme. Every token
  # not listed here inherits from shadcn: background, foreground, muted,
  # muted-foreground, border, input, card, popover, secondary, destructive.
  # Light and dark values are paired; dark applies under prefers-color-scheme: dark.
  primary: '#2F6F6A'
  primary-foreground: '#FFFFFF'
  primary-dark: '#5FB3AA'
  primary-foreground-dark: '#0A0A0A'
  ring: '#2F6F6A'
  ring-dark: '#5FB3AA'
typography:
  # Body, label and small text inherit shadcn's default sans stack.
  # Only the roles Todos relies on are named here.
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
  # Inherits the shadcn --radius scale unchanged.
spacing:
  # Tailwind's 4-based scale is inherited. Named layout tokens:
  content-max: 576px
  gutter-mobile: 16px
  gutter-desktop: 24px
  page-top-mobile: 24px
  page-top-desktop: 64px
  row-padding-y: 12px
  touch-target: 44px
components:
  add-input:
    fontSize: '{typography.todo-description.fontSize}'
    height: '{spacing.touch-target}'
  add-button:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    height: '{spacing.touch-target}'
  todo-row:
    background: 'transparent'
    divider: 'shadcn border token, 1px, bottom only'
    paddingY: '{spacing.row-padding-y}'
    minHeight: '{spacing.touch-target}'
  todo-checkbox-checked:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
  todo-description-completed:
    color: 'shadcn muted-foreground'
    textDecoration: 'line-through'
  todo-meta:
    typography: '{typography.meta}'
    color: 'shadcn muted-foreground'
  row-icon-button:
    size: '{spacing.touch-target}'
    color: 'shadcn muted-foreground'
    hoverColor: 'shadcn foreground'
  row-icon-button-delete-hover:
    color: 'shadcn destructive'
  char-counter:
    typography: '{typography.meta}'
    color: 'shadcn muted-foreground'
    atLimitColor: 'shadcn destructive'
  focus-ring:
    color: '{colors.ring}'
    width: 2px
    offset: 2px
---

## Brand & Style

Todos is a personal list that gets out of the way. The aesthetic is **calm and minimal**: a neutral canvas, generous whitespace, one column of content, and a single quiet accent color. Nothing competes with the user's own words. The Todo Description is the content, and everything else is chrome that should fade into the background.

Todos inherits the shadcn/ui defaults (neutral base theme). This DESIGN.md specifies only the brand layer: one accent color, a small type ramp, layout tokens, and the look of the few components that are specific to Todos. All other shadcn components (Button, Input, Checkbox, Skeleton, Sonner toast, Tooltip) keep their shadcn visual specs.

## Colors

One brand color, plus shadcn neutrals for everything else.

- **Quiet Teal (`#2F6F6A` light / `#5FB3AA` dark)** is the only brand color `[ASSUMPTION: hue chosen by facilitator on the Fast path; any calm, low-saturation accent that passes the contrast checks below may replace it]`. It is used for the checked state of the completion checkbox, the Add button, and the focus ring. It is never used for decoration, backgrounds, or text blocks.
- **Neutrals** (`background`, `foreground`, `muted-foreground`, `border`, `input`) come from the shadcn neutral theme. A Completed Todo's Description uses `muted-foreground`.
- **Destructive** is inherited from shadcn. It appears only on the delete icon when hovered or focused, and on the character counter at the 500-character limit. Error toasts use the shadcn Sonner error style.

**Contrast targets (WCAG 2.1 AA):**

| Pair | Mode | Target |
|---|---|---|
| `{colors.primary-foreground}` on `{colors.primary}` (Add button) | light | ≥ 4.5:1 (about 5.8:1) |
| `{colors.primary-foreground-dark}` on `{colors.primary-dark}` | dark | ≥ 4.5:1 (about 8:1) |
| `muted-foreground` on `background` (Completed Todo text, meta) | both | ≥ 4.5:1 (holds for shadcn neutral defaults) |
| `{colors.ring}` against `background` | both | ≥ 3:1 (non-text contrast) |

Avoid: gradients, colored surfaces, per-state color coding beyond the checked checkbox, and a second accent color.

## Typography

shadcn's default sans stack is inherited. Todos uses four roles:

- **`app-title`** (24px, 600): the product name "Todos" in the header. It appears exactly once per page.
- **`todo-description`** (16px, 400, line-height 1.5): every Todo Description and the add input. At 16px, iOS Safari doesn't zoom when the input is focused.
- **`meta`** (12px): the Created At time and the character counter.
- **`empty-title`** (18px, 500): the headline of the Empty and Error states.

Long Descriptions wrap onto several lines and never truncate. Unbroken strings such as URLs break anywhere (`overflow-wrap: anywhere`) so they can't cause horizontal scrolling.

## Layout & Spacing

The layout is a single centered column, at most `{spacing.content-max}` (576px) wide. The side gutters are `{spacing.gutter-mobile}` below 640px and `{spacing.gutter-desktop}` above it. There is `{spacing.page-top-mobile}` / `{spacing.page-top-desktop}` of space above the header. From top to bottom: the header (the product name), the add row (input and Add button), then the Todo List. There is no sidebar, no footer, and no second column at any width.

Todo rows have `{spacing.row-padding-y}` of vertical padding and a minimum height of `{spacing.touch-target}`. Everything else uses the inherited Tailwind 4-based scale.

## Elevation & Depth

The design is flat. Todo rows have no shadows and no card surfaces. Rows are separated only by a 1px `border` divider. The only raised element is the shadcn Sonner toast, which keeps its default shadow.

## Shapes

The shadcn `--radius` scale is inherited unchanged: inputs, buttons, and the checkbox use shadcn's defaults. No pills, and no custom shapes.

## Components

These shadcn components are used unchanged: `Input`, `Button` (ghost variant for row icons), `Checkbox`, `Skeleton`, `Sonner` (toast), `Tooltip`.

Brand-layer and Todos-specific components:

- **Add input + Add button:** a full-width `Input` at `{typography.todo-description.fontSize}`, with a primary `Button` ("Add") on the right. Both are `{spacing.touch-target}` tall. The **character counter** (`{components.char-counter}`) sits under the input on the right. It appears only once the Description reaches 450 characters, and turns destructive at 500.
- **Todo row:** from left to right: the completion `Checkbox`, then the Description (`todo-description`) with the Created At time (`meta`, `muted-foreground`) on the line below it, then the row actions (Edit and Delete icon buttons). The row has a transparent background and a bottom divider.
- **Completed Todo row:** the checkbox is checked and filled with `{colors.primary}`. The Description has a line-through and uses `muted-foreground`. That is two visual cues, so the status never relies on color alone. The row stays in place.
- **Row icon buttons (Edit, Delete):** ghost buttons with a `{spacing.touch-target}` hit area, using `lucide` `Pencil` and `Trash2` icons at 16px in `muted-foreground`. On hover or focus, Edit changes to `foreground` and Delete to `destructive`.
- **Inline edit field:** replaces the Description text in place. It is an `Input` (or an auto-growing textarea for long text) at `todo-description` size, with the same left edge as the Description, so the row doesn't shift sideways.
- **Pending row:** a Todo with an unconfirmed change looks exactly like a confirmed one. There is no spinner and no dimming, because optimistic updates should feel instant.
- **Empty state:** a centered block in the list area, with `empty-title` and one line of `muted-foreground` body text. No illustration `[ASSUMPTION: no illustration, to keep it calm and minimal]`.
- **Load error state:** the same layout as the Empty state, plus a secondary `Button` ("Try again").
- **Loading state:** three to five shadcn `Skeleton` rows shaped like Todo rows (a checkbox square and one or two text bars).
- **Toast:** shadcn Sonner with the error variant, for failed saves.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep one centered column at every width | Add sidebars, cards, or a second column |
| Use `{colors.primary}` only for the checked checkbox, the Add button, and the focus ring | Tint backgrounds or rows with the accent |
| Show Completed status with a check, a line-through, and muted text together | Rely on color alone, or hide Completed Todos |
| Inherit shadcn defaults for everything outside the brand layer | Restyle shadcn primitives to "make them pop" |
| Let Descriptions wrap in full | Truncate Descriptions with ellipses |
| Add and remove rows with a subtle height and opacity transition | Use bouncy, celebratory, or confetti animations |
