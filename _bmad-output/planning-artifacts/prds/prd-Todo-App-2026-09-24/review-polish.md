# Review Polish Log — 2026-09-24

Source: `bmad-review` with `lenses=structure,prose` (structure first), style guide Microsoft Writing Style Guide, reader = humans. Meaning, IDs, numbers, thresholds, Glossary terms, `[ASSUMPTION: ...]` tags, and frontmatter were left unchanged.

## prd.md (21 edits)

Structure
- H1: added a blank line before the product-name subtitle.
- UJ-3: converted free text into the same labeled fields as the other journeys (Persona + context / Entry state / Path / Climax).
- §7: added blank lines after the Primary, Secondary, and Counter-metrics labels.
- §7 SM-3, SM-5: moved thresholds into an explicit "Target:" clause to match SM-1, SM-2, and SM-4 (same values).
- §9: removed a duplicate blank line.
- §9 FR-6 entry: aligned the interaction-pattern wording with FR-6 (desktop: double-click or Edit control; touch: Edit control).

Prose
- US spelling: "finalised" to "finalized" (x2), "behaviour" to "behavior".
- §4.6 heading: added the serial comma to match the rest of the document.
- Glossary Active/Completed Todo: added "respectively".
- FR-3 Loading and Error: replaced ambiguous "It" with explicit subjects and put the 300 ms rule in plain order.
- FR-5: "so it never relies" changed to "; it never relies" (removes a false causal link).
- FR-8: "On desktop, it may appear on hover or focus" (reordered to remove ambiguity).
- NFR-4: "can be done by keyboard alone" changed to "can be performed with the keyboard alone".
- NFR-9: rewrote the logging restriction as "must not log full request bodies; the only part of the Description it may log is its length".
- §6.2: made the "Bulk actions ... and undo" bold span consistent.
- SM-2: "no occurrences of lost or reverted Todos" changed to "count Todos lost or reverted" (target stays 0).

## addendum.md (3 edits)

- "**Docker Compose** is the standard way" changed to "**Docker Compose:** the standard way", matching the other bullet labels.
- "deletes it on purpose" changed to "deliberately deletes it" to remove ambiguity.
- "It's" changed to "It is" to match the PRD's register.

## Findings not applied (PM decision)

- **Product name vs. project name in prose:** §0, §1 (Vision), UJ-1, UJ-3, and the Glossary "Deployment" entry refer to the product as "Todo-App". The product name is "Todos". Changing this could affect how the Glossary defines Deployment, so it was left as is.
- **Uneven journey fields:** UJ-2 has no Edge case, UJ-3 has no Resolution, and UJ-4 has no Entry state or Resolution. Adding them would add content.
- **Heading case:** feature headings (§4.x) use title case and FR headings use sentence case. The two tiers are each consistent, so this was left alone.
- **§6.2 labels:** the first three items use "Label: explanation" and the rest are fully bold. Making them match would mean writing new labels or explanations.
- **Addendum duplication:** the `down -v` warning appears under both Persistence and README warning. It was kept because the second states a README requirement.
