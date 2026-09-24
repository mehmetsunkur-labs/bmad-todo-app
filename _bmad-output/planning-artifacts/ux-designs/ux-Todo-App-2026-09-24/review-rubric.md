# Spine Pair Review — Todos

## Overall verdict

The pair makes a lean, well-shaped contract. A consumer can pull tokens, copy, states, keyboard rules and flows out cleanly. Every `{path.to.token}` reference resolves, the light/dark brand pairs are complete, and the stated contrast figures check out (5.83:1 light, 8.03:1 dark). Naming shadcn-inherited tokens (`shadcn muted-foreground`) is clear enough for a shadcn "neutral" base.

Two decisions are still open or self-contradictory and would make two implementers diverge:
- Whether the inline edit field is an `Input` or a textarea.
- Whether the Created At timestamp is keyboard-focusable.

A few mediums sit where the spines disagree with each other or with PRD FR-5, FR-6 and FR-10: edit-field length limit, failed-create text loss, focus on async rollback, keying on hover vs width, and API error copy. Fix those before story breakdown. Nothing is critical for an internal tool.

## 1. Flow coverage — strong

What was checked: I extracted UJ-1 to UJ-4 from PRD §2.3. UJ-1, UJ-2 and UJ-3 each have a Key Flow with a named protagonist, numbered steps, a marked **Climax** and a **Failure** path. UJ-4 is excluded with a stated reason (it has no UI). Flow names match the PRD word for word. The UJ-1 edge case (a failed toggle rolls back and shows a toast) is carried into Flow 1's failure path.

### Findings
- **low** Flow 3 step 3 says the add input has "its cursor ready", but autofocus is desktop-only (EXPERIENCE Component Patterns → Add row) and Priya's device is never stated (EXPERIENCE Key Flows → Flow 3, step 1). *Fix:* say "on her laptop" in step 1.

## 2. Token completeness — adequate

What was checked:
- **Frontmatter tokens:** 6 color tokens (3 light/dark pairs: `primary`, `primary-foreground`, `ring`), 4 typography roles, 7 spacing tokens and 11 component entries.
- **References:** every `{colors.*}`, `{typography.*}`, `{spacing.*}` and `{components.*}` reference in both spines resolves.
- **Hex and pairs:** every brand color has a hex value and a dark pair.
- **Inherited tokens:** named, not restated, which fits the shadcn inheritance pattern.
- **Contrast table:** covers the Add button in both modes, muted text, and the focus ring. I recomputed the figures and they are accurate (shadcn neutral `muted-foreground` is about 4.74:1 light and 7.66:1 dark).

### Findings
- **medium** The completion checkbox has no hit-area token. shadcn's `Checkbox` is 16px, but EXPERIENCE requires a 44×44 target for it (EXPERIENCE Accessibility Floor → Touch targets). DESIGN only gives checked colors (`todo-checkbox-checked`) and a row `minHeight`, so the horizontal hit area is unspecified (DESIGN frontmatter `components`; Components → Todo row). *Fix:* add `todo-checkbox: { size: 16px, hitArea: '{spacing.touch-target}' }` and one prose line saying the label or padding wrapper provides the 44px target.
- **low** `rounded:` contains only a comment, so it parses as YAML `null` (DESIGN frontmatter, line 41). *Fix:* use `rounded: {}  # inherits shadcn --radius` or remove the key and keep the prose.
- **low** Component tokens only reference the light names (`{colors.primary}`, `{colors.ring}`). The mode-swap rule lives in a YAML comment. Also, shadcn's inherited dark palette is keyed to a `.dark` class, not `prefers-color-scheme`. *Fix:* add one prose sentence under Colors: "`X-dark` replaces `X` in dark mode; component refs resolve per mode. Dark mode follows the system setting (media-query variant, or a `.dark` class set from `matchMedia`)."
- **low** "shadcn's default sans stack" is ambiguous, because shadcn ships no font. Depending on the template it becomes Geist or Tailwind's `font-sans` system stack (DESIGN frontmatter `typography` comment; Typography). *Fix:* name the stack, e.g. "Tailwind `font-sans` system stack; no webfont".
- **low** The contrast table leaves out two pairs: `destructive` text at 12px (the character counter at its limit) and the checked checkbox fill against `background` (a 3:1 non-text target). Both pass with the current values (DESIGN Colors → Contrast targets). *Fix:* add both rows.

## 3. Component coverage — adequate

What was checked: I extracted every component named in either spine:
- Add input, Add button, Add row, character counter
- Todo row and Completed Todo row
- Completion checkbox
- Row icon buttons: Edit and Delete
- Inline edit field
- Created At time and Tooltip
- Pending row
- Empty, Loading and Error states
- Toast
- Focus ring
- Header / app title

Each has a DESIGN visual rule and an EXPERIENCE behavioral rule, directly or through State Patterns, with two exceptions noted below: the header/app title and the favicon.

### Findings
- **high** The inline edit field is left undecided: "an `Input` (or an auto-growing textarea for long text)" (DESIGN Components → Inline edit field). The choice drives the Enter and Shift+Enter handling, and whether a Description of up to 500 characters wraps while editing (FR-12). It also decides whether the row reflows. *Fix:* commit to one. The likely choice is an auto-growing `textarea` with Enter bound to save and newlines blocked. State it in DESIGN and in the EXPERIENCE Inline edit field row.
- **high** The Created At timestamp contradicts itself. EXPERIENCE says the absolute time appears "on hover or focus in a Tooltip" (Component Patterns → Created At time). It also says timestamps are "focusable only through their tooltip trigger" yet are "not a separate tab stop", with the absolute time "in the accessible name of the Description" (Interaction Primitives → Tab order). The Description is not interactive, so it has no accessible name. As written, keyboard users can never see the absolute time, which breaks the accepted PRD FR-1 assumption and NFR-4. *Fix:* pick one:
  - Make the `<time>` a focusable tooltip trigger and add it to the tab order after the checkbox.
  - Show the absolute time in the Edit button's tooltip or name, and drop the "on focus" claim.
- **medium** The edit field has no length limit or counter. FR-6 applies FR-5 validation, which requires input to stop at 500 characters with a visible limit. The spines give `maxlength` and the 450/500 counter only for the add input (EXPERIENCE Component Patterns → Add row, Inline edit field, Character counter; DESIGN Components → Add input). *Fix:* state that the inline edit field uses `maxlength=500` and the same counter rule.
- **medium** NFR-12 requires a favicon and "Todos" in the browser tab title. Neither spine specifies them (DESIGN Components; EXPERIENCE Foundation / Accessibility Floor). *Fix:* add a Favicon line to DESIGN Components (for example, a lucide `CheckSquare` in `{colors.primary}` with a dark variant) and set `<title>Todos</title>` in EXPERIENCE.
- **medium** The checkbox's accessible name changes with its state ("Mark as done: …" / "Mark as not done: …"), while its checked state is also exposed. Screen readers will read "Mark as not done: X, checkbox, checked", which is redundant and confusing (EXPERIENCE Voice and Tone → Checkbox label). *Fix:* use a stable name of `{Description}` (or "Done: {Description}"), let `aria-checked` carry the state, and keep the live-region announcements.

## 4. State coverage — adequate

What was checked:
- **Todo List view:** Loading (with the 300 ms delay), Empty, Populated, Error (with the 10 s timeout), and focus after each action.
- **Toast region:** stacking, dismissal and placement.
- **Add row:** disabled while loading, hidden on error, and the counter.
- **Row-level states:** pending, failed create, toggle, delete and edit, validation error, and long Description.
- **Offline:** correctly treated as an ordinary failure, since offline mode is out of scope in the PRD. Permission-denied does not apply.

### Findings
- **medium** On a failed create, if the user has already typed something new, the failed text is dropped and only a toast appears (EXPERIENCE State Patterns → Failed create). This breaks FR-10's consequence that "the typed Description is restored ... so the user doesn't lose it". It is tagged `[ASSUMPTION]`, but the text is still lost. *Fix:* keep it recoverable. Options: put the failed text in the toast ("Couldn't add 'Buy milk'.") with a copy affordance, or queue it back into the input once the input is empty. Otherwise, flag the deviation back to the PRD.
- **medium** Async rollbacks move focus without saying what happens if the user has moved on. A failed create "puts the Description back ... with focus". A failed edit "stays in or reopens edit mode". Yet only one row can be in edit mode, and opening another row commits the first (EXPERIENCE State Patterns → Failed create / Failed edit; Component Patterns → Inline edit field). If an edit fails after the user has started editing a second row, the spine can't tell you which row wins. *Fix:* add one rule. For example: "A rollback never steals focus from an active edit or a non-empty add input. A failed edit reopens only if no other row is in edit mode; otherwise the toast alone reports it."
- **medium** The copy for API validation errors is defined twice with different answers. The Voice table gives fixed copy ("That todo is too long. Keep it under 500 characters."). State Patterns says "the API's human-readable message is shown in the toast" (EXPERIENCE Voice and Tone; State Patterns → Todo API validation error). Also, "under 500" is off by one: the limit is 1–500 inclusive. *Fix:* map known API error codes to the Voice copy and fall back to the API message for unknown codes. Change the copy to "500 characters or fewer".
- **low** Escape both cancels an inline edit and dismisses the newest toast, with no precedence (EXPERIENCE Interaction Primitives → Escape; Component Patterns → Toast). *Fix:* "Escape in an edit field cancels the edit only."
- **low** The add input is auto-focused "on page load", but it is disabled during Loading (EXPERIENCE Component Patterns → Add row; State Patterns → Loading). *Fix:* "Focus the add input when Loading resolves to Empty or Populated (desktop)."
- **low** Some edges are unstated:
  - How relative time reads for dates in another year (EXPERIENCE Component Patterns → Created At time).
  - How a list at the 1,000-Todo NFR-1 bound is rendered (all rows, no pagination?).
  - Whether "Nothing is shown for the first 300 ms" covers the header and add row (EXPERIENCE State Patterns → Loading).

  *Fix:* add one line for each.

## 5. Visual reference coverage — strong

What was checked: `mockups/` and `wireframes/` do not exist, and `imports/` is empty. The spines contain no references to visual files, so there are no orphaned or vague references. A key-screen mock (`.working/key-screen-todo-list.html`) is being drafted and is not yet promoted, so it is not penalized.

### Findings
- **low** When the mock is promoted to `mockups/`, link it inline from DESIGN Layout & Spacing / Components and from EXPERIENCE Information Architecture, saying what it shows. Add the one-time statement "Spines win on conflict".

## 6. Bloat & overspecification — strong

What was checked: pixel values restated in prose, copies of source material, prose that should be a table, and unused sections. Both spines are lean. The FR/UJ "Need" table in the IA restates the PRD, but it earns its place as a traceability map for story-dev. EXPERIENCE prose has no editorial voice.

### Findings
- **low** DESIGN Typography and Layout & Spacing repeat values already in the frontmatter, e.g. "(24px, 600)" and "(576px)" (DESIGN Typography; Layout & Spacing). *Fix:* optional. Keep only the token references, so the values can't drift apart.

## 7. Inheritance discipline — adequate

What was checked:
- **Sources:** both spines list `prd.md` and `addendum.md` in `sources`, and both files resolve. The addendum is technical only and adds no UX content.
- **Journey names:** the UJ names match the PRD word for word.
- **Glossary:** the terms are used as defined, including the stated lowercase "todo" convention for UI copy.
- **Token references:** every EXPERIENCE token reference resolves to a DESIGN token.

### Findings
- **medium** The two spines key the same behavior on different things. The Responsive table puts "< 640px: Edit and Delete are always visible" and "add input not auto-focused" under viewport width. The paragraph right below it says visibility "depends on the device's hover capability, not on its width". The Add row rule says "desktop only" without defining desktop (EXPERIENCE Responsive & Platform; Component Patterns → Add row; Interaction Primitives → Pointer and touch). A narrow desktop window gets contradictory rules. *Fix:* remove the Edit/Delete visibility rule from the width table. Key autofocus on `(hover: hover) and (pointer: fine)` and say so once.
- **medium** Component names drift between the spines:
  - DESIGN "Add input + Add button" = EXPERIENCE "Add row"
  - DESIGN "Row icon buttons (Edit, Delete)" = EXPERIENCE "Delete button" (Edit has no row)
  - Frontmatter `todo-checkbox-checked` = EXPERIENCE "Completion checkbox"
  - Frontmatter `char-counter` = prose "character counter"

  An AI consumer searching by name will miss matches. *Fix:* use one name per component in both spines, e.g. "Add row (Add input, Add button, Character counter)", "Row actions (Edit button, Delete button)", "Completion checkbox". Add a matching frontmatter key where one exists.
- **low** The glossary List State is "Error", but DESIGN calls it the "Load error state". FR-3's action is "Retry", but the copy says "Try again" (DESIGN Components → Load error state; EXPERIENCE Voice and Tone). *Fix:* rename the DESIGN entry to "Error state" and add "(the FR-3 Retry action)" next to the copy.

## 8. Shape fit — strong

What was checked:
- **DESIGN sections:** all eight are present, in canonical order.
- **EXPERIENCE required defaults:** all eight are present, plus Responsive & Platform, which applies here because there are two breakpoints and both touch and pointer input.
- **Inspiration & Anti-patterns:** leaving it out is defensible. Neither the memlog nor the PRD names a reference product, and the rejections are captured in "Not allowed" and in Do's and Don'ts.
- **Invented sections:** none.

### Findings
- **low** There are 8 `[ASSUMPTION]` tags (DESIGN 2, EXPERIENCE 6) and one `[NOTE FOR UX]` (Flow 2 failure), with no index, and both spines are `status: draft`. Consumers can't tell which assumptions are accepted. *Fix:* on finalize, either confirm them in the memlog and strip the tags, or add a short Assumptions list to EXPERIENCE. Turn the NOTE into a plain "revisit if…" sentence.

## Mechanical notes

- **Frontmatter:** both spines have `name`, `status`, `sources`, `created` and `updated`. DESIGN also has `description`.
- **`rounded` parses as `null`:** see §2.
- **Token references:** all 15 distinct `{…}` references resolve (DESIGN 14, EXPERIENCE 5).
- **Copy placeholders:** EXPERIENCE copy uses `{n}` and `{Description}`, which use the same `{…}` syntax as token references. A naive resolver will treat them as unresolved tokens. *Fix:* optional. Write them as `<n>` / `<Description>`, or note once that `{Capitalized}` braces in copy are placeholders.
- **Cross-references:** "`DESIGN.md` → Components", "`DESIGN.md` → Colors", PRD §6.2, NFR-5, NFR-12, and FR-1 to FR-12 all resolve.
- **Mermaid:** none is used.
- **Contrast figures:** recomputed and accurate:

  | Pair | Ratio |
  |---|---|
  | `#FFFFFF` on `#2F6F6A` | 5.83:1 |
  | `#0A0A0A` on `#5FB3AA` | 8.03:1 |
  | ring `#2F6F6A` on white | 5.83:1 |
  | ring-dark `#5FB3AA` on `#0A0A0A` | 8.03:1 |
