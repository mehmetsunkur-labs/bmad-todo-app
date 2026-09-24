# Review Polish — Change Log

Date: 2026-09-24. Source: `bmad-review` with the structure and prose lenses (structure ran first), style guide Microsoft Writing Style Guide, reader type humans. Frontmatter, tokens, thresholds, Voice and Tone copy strings, component names, Glossary terms, FR/NFR/UJ IDs, and `[ASSUMPTION]`/`[NOTE FOR UX]` tags are unchanged. Status remains `draft`.

Starting read: the spines tell implementers and story writers how Todos looks (DESIGN) and behaves (EXPERIENCE). They follow a reference model and were already well structured, so there are no cuts or section moves.

## DESIGN.md (4 edits, body only)

| Pass | Location | Change |
|---|---|---|
| structure | Colors → Quiet Teal | "is the only brand color" became "is the brand color", because the section's first sentence already says there is only one. |
| structure | Layout & Spacing | Added a blank line before the numbered list so it renders the same way everywhere. |
| prose | Components → Add row | Rewrote the counter sentence so "under the input" appears once: "The **character counter** (…) sits under the input, right-aligned to the input rather than the button." |
| prose | Components → Completed Todo row; Empty state | "That is three cues, so…" became "With three cues, …". Rewrote the sentence fragment "An `empty-title` headline, plus…" as "It has an `empty-title` headline and…". |

## EXPERIENCE.md (12 edits)

| Pass | Location | Change |
|---|---|---|
| structure | Component Patterns → Row actions | Merged two pointers to Interaction Primitives into one sentence. |
| structure | Interaction Primitives → Motion | Added a blank line before the list so it matches the Keyboard and Pointer lists. |
| prose | Voice and Tone intro (not the table) | "UI text writes 'todo' in lowercase…" became "UI text uses lowercase 'todo'…". |
| prose | Component Patterns → Add row | Shortened the autofocus rule from two sentences to one. The `[ASSUMPTION]` tag stays. |
| prose | Component Patterns → Todo row | Split the run-on sentence about double-clicking and added the scope that Inline edit field and Interaction Primitives already give ("hover-capable pointer devices only"). Changed "markdown" to "Markdown". |
| prose | Component Patterns → Inline edit field | Changed "cancelled" to "canceled" (US spelling) and tightened "The same … as the Add row apply" to "The Add row's … apply". |
| prose | Component Patterns → Created At time, Toast | "When the pointer hovers it" became "On pointer hover". "in the bottom-center … the bottom-right" became "at bottom-center … bottom-right". |
| prose | State Patterns → Failed create, input empty | The toast is now quoted in full from Voice and Tone. The old text quoted only its second half. |
| prose | Interaction Primitives → Hover-capable pointers | "has focus within it" became "contains focus". |
| prose | Accessibility Floor → Landmarks and labels | Split a garden-path sentence (a `<main>` containing a `<form>` whose input…) into two. |
| prose | Responsive & Platform | Made a non-parallel list parallel: "Row actions visibility, double-click editing, and page-load focus". |
| prose | Flow 1, step 6 | "fades at once and collapses smoothly" became "fades instantly, then collapses smoothly", which matches the Motion order. |

## Not applied (would change meaning)

- **Focus rule conflict:** Accessibility Floor says focus is "never moved by a background rollback". State Patterns allows two moves: focus goes back to the restored row after a failed delete, and focus moves when the focused element disappears. Owner: UX. The fix is to reword the floor rule as "…except as State Patterns specifies".
- **Flow 3 device:** Flow 3 step 3 ("with the cursor ready") implies autofocus, but step 1 never says Priya is on a hover-capable device. The review rubric suggests adding "on her laptop", which would be new content.
- **Repeated tab title:** The browser tab title "Todos" is stated three times: EXPERIENCE Foundation, the EXPERIENCE Favicon row, and DESIGN Favicon. I kept all three because each component row needs to stand on its own.
