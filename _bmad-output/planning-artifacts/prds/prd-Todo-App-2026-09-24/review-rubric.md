# PRD Quality Review — Todo-App

*Reviewed 2026-09-24 against `prd-validation-checklist.md`. Stakes: internal tool, about 5 pages, draft approved and all assumptions accepted. Production concerns are deliberately out of scope, so this review does not ask for them.*

## Overall verdict
For its stakes, this is a strong PRD. The thesis ("trust and clarity" plus a "clean foundation") is specific, and it runs through the FRs, NFRs, success metrics and counter-metrics. Almost every FR has concrete, testable consequences with numeric bounds, and the scope and assumptions are stated openly. The main risk is **who the list belongs to**. The Vision says it is a "personal list", UJ-1 puts Dana in "the team's Todo-App deployment", and NFR-2 sizes for "a handful of people at once". Architecture and UX need one answer to that. A smaller gap: the PRD never says what happens when several Optimistic Updates on the same Todo are in flight at once. Neither issue needs a rewrite. Both are one-paragraph fixes.

## Decision-readiness — strong
Decisions are stated as decisions and include what was given up. Examples: open access is "an accepted v1 risk; network placement is the deployer's responsibility" (§6.2). Delete has "no confirm and no undo in v1; revisit if accidental deletes are reported" (FR-8). Concurrency is "last-write-wins" (NFR-3). §8 records the three resolved questions with their answers rather than leaving rhetorical ones open. No `[NOTE FOR PM]` callouts remain. That fits an approved draft with no open decisions, except for the list-ownership contradiction below, which is a real tension that was never surfaced as one.

### Findings
- **high** Personal list or shared team list? (§1 Vision, §2.2, §2.3 UJ-1, NFR-2) — The Vision says "a personal list of tasks", and so does the brief ("individual users to manage personal tasks"). UJ-1 says Dana "keeps her day's small tasks in the team's Todo-App deployment". NFR-2 sizes for "a handful of people at once". §2.2 lists people who need "privacy from other people using the same deployment" as non-users. Read together, the PRD suggests several colleagues sharing one list, but it never says so as a decision. That changes the UX (does the list feel like "mine"?), the meaning of SM-1 (5 colleagues on one shared deployment), and how often NFR-3 last-write-wins actually matters. *Fix:* add one decision sentence to §6.1 or §2.2. Either "one Deployment per person; NFR-2's 'handful of people' means one person on several devices or tabs", or "a Deployment may be shared by a small team, who all see and edit one list". Then reword UJ-1's "team's Todo-App deployment" to match.

## Substance over theater — strong
Nothing here reads like furniture. Two personas (Dana, Sam), and each one drives requirements: Dana drives FR-1 to FR-12, and Sam drives FR-11, NFR-6 and NFR-8. The Vision could only belong to this product: "Every change shows on screen immediately, is saved reliably, and is still there after a refresh or a restart." There is no invented differentiation section. The NFRs carry thresholds (100 ms, 2 s at 1,000 Todos, p95 300 ms, WCAG 2.1 AA with 4.5:1 contrast, 15-minute onboarding). The exceptions are listed below.

### Findings
- **low** NFR-8 is a principle, not a check (§5 NFR-8) — "without rewriting existing endpoints or migrating in a way that loses data" gives architecture a direction but nothing to verify. At these stakes that is acceptable. *Fix (optional):* add one checkable proxy, e.g. "the Todo data model can take a nullable owner reference without changing existing request or response fields".
- **low** NFR-9 sentence is ambiguous (§5 NFR-9) — "There must be no logging of full request bodies beyond the Description length" is hard to parse. It could mean "log the Description length, never the Description text". *Fix:* "Logs record the Description's length, never its text or any full request body."

## Strategic coherence — strong
The thesis is explicit in §1: trust and clarity over breadth, plus a clean foundation. The features follow from it. §4.6 is described as "what makes users trust the app". SM-1 checks clarity, SM-2 and SM-4 check trust, and SM-5 checks the foundation. There are two counter-metrics, and they aim at the right temptations: adding UI surface, and hiding errors to seem faster. The MVP is clearly problem-solving scope: full CRUD, with filters, bulk actions and undo explicitly cut (§6.2).

### Findings
- **low** Three different onboarding bounds (UJ-4, NFR-6, SM-5) — UJ-4 says "within one working session". NFR-6 says "run it locally within 15 minutes". SM-5 says "runs it locally **and explains the data flow** within 15 minutes". *Fix:* pick one bound, for example NFR-6's 15-minute run plus an explanation within the session, and have UJ-4 and SM-5 reference it.

## Done-ness clarity — adequate
This is the PRD's strongest dimension on a per-FR basis. FR-3 (the 300 ms no-flicker rule, and "must never show an empty list as though there were no data"), FR-5, FR-6, FR-10 (restores the typed Description on a failed create) and FR-12 (320–1920 px, 44×44 px targets, unbroken URLs wrap) are all story-ready. The gaps sit in how the FRs interact, not inside any one FR. Downstream stories will hit these first.

### Findings
- **medium** No rule for several in-flight actions on the same Todo (FR-4, FR-7, FR-8, FR-10) — Each action is optimistic and rolls back on its own. The PRD doesn't say what happens when Dana creates a Todo and ticks or edits it before the create is confirmed, toggles it twice quickly, or deletes it while an edit is pending. It also doesn't say what "returns to its pre-action state" means when a later action has already changed that state. Without a rule, each story will pick its own behaviour. *Fix:* add one consequence to FR-10, e.g. "actions on a single Todo are applied in order; controls on a not-yet-confirmed new Todo are disabled until it is confirmed (or its actions are queued); a rollback restores the last confirmed state of that Todo".
- **medium** Failed edit loses the user's text (FR-6, FR-10) — FR-10 restores the typed Description for a failed create but says nothing for a failed edit. The Todo "returns to its pre-action state", so the corrected text is thrown away. This goes against the Vision's "never silently loses work". *Fix:* state the edit case in FR-10, either "on a failed edit, the Todo reverts and the message offers to re-open the edit with the attempted text" or "accepted: the edit text is discarded".
- **low** Initial-load timeout isn't specified (FR-3, FR-10) — The 10 s timeout in FR-10 covers changes only. FR-3's Error state doesn't say how long a hung initial fetch waits before it appears. *Fix:* "the same 10-second timeout applies to the initial fetch".
- **low** "Typical office broadband connection" is an adjective, not a bound (NFR-1) — *Fix:* name a reference profile (e.g. 20 Mbps, 50 ms RTT) or anchor the 2 s bound to a named test setup.
- **low** Pasting over-length text isn't covered (FR-5) — "prevented at input" doesn't say whether a paste longer than 500 characters is truncated or blocked. It also doesn't say whether the stored Description is the trimmed value (the Glossary implies it is). *Fix:* one clause for each.

## Scope honesty — strong
§6.2 is a real Non-Goals list that does work. It names the accepted access risk, lists production hardening item by item, and addresses the omissions a reader would otherwise infer: filters, real-time sync, offline. All ten `[ASSUMPTION]` tags are indexed. The open-items density is low (0 open questions, 10 accepted assumptions), which fits an approved internal tool.

### Findings
- **medium** "Local development only" vs. a phone-reachable deployment (§6.2 Production hardening, UJ-2, FR-9, NFR-5, SM-1) — §6.2 says "v1 targets containerized local development". UJ-2, FR-9 ("opening the app from a different device"), NFR-5 (iOS and Android browsers) and SM-1 (5 colleagues) all need a Deployment that other devices can reach over a network. §8.2 says the product owner deploys personally, so the intent is probably "a manual deployment, no production hardening". As written, though, architecture could reasonably build for localhost only. *Fix:* reword §6.2 to "v1 is delivered as containers that run locally for development and that the product owner can also run on a network-reachable host by hand; no production hardening beyond that". Also add a line to NFR-7 that the frontend must reach the Todo API from other devices (not only from `localhost`).

## Downstream usability — adequate
The Glossary is strong and mostly followed in the FRs. The FR, NFR, SM and UJ IDs are contiguous and unique, and every cross-reference resolves. The addendum correctly keeps Docker specifics out of the PRD body and gives them to architecture. Two things weaken clean extraction: the ownership ambiguity above, and the lighter wording discipline in the UJs (see Mechanical notes).

### Findings
- **low** FR-level UJ traceability is uneven (§4) — FR-1 to FR-4 and FR-11 say which UJ they realize. FR-5 to FR-10 and FR-12 inherit it only from their feature's Description. *Fix:* optional. Feature-level "Realizes" is enough for epics. Only add FR-level tags if story tooling needs them.

## Shape fit — strong
This is an internal tool, but the PRD sits at the top of a chain that feeds UX, architecture and stories. The UJ count fits that. There are four UJs: two carry the core experience and a mobile variant, one covers the empty state, and one covers the developer and foundation thesis. That isn't over-formalized. Keeping technology out of the body and putting it in `addendum.md` is the right shape for a chain-top PRD. §0 Document Purpose is a bit meta, but it is short and helps downstream skills.

## Mechanical notes
- **Glossary drift (UJs):** the UJs use lowercase "todo" ("the new todo appears", "add their first todo"), "item" ("ticks an item", "deletes two old completed items") and "server" (UJ-1 edge case). The Glossary terms are Todo, Completed Todo and Todo API. "Persistent store", "Todo List view", "app URL" and "Retry" are used as terms but aren't defined. They are understandable, but UX extraction works better with exact terms.
- **UJ protagonist:** UJ-3 has no named protagonist ("the user") and no Persona/Entry/Path structure, unlike UJ-1, UJ-2 and UJ-4. Give it one, e.g. the product owner on first deploy, or Dana on a fresh Deployment.
- **ID continuity:** FR-1..FR-12, NFR-1..NFR-10, SM-1..SM-5 plus SM-C1 and SM-C2, and UJ-1..UJ-4 are all contiguous and unique. No broken references.
- **Assumptions Index round-trip:** 10 inline tags, 10 index entries, all matching. One gap: the FR-10 inline tag is a bare `[ASSUMPTION]` with no text, while the index says "a request times out after 10 seconds". Add the text inline.
- **Tag not in the index:** NFR-4 and the Assumptions Index both call WCAG 2.1 AA an assumption, but NFR-5 (browser matrix) and NFR-2 (p95 300 ms) are just as inferred and aren't tagged. Minor, since the user accepted the draft.
- **Required sections:** all present for the stakes (Vision, Users/UJs, Glossary, FRs, NFRs, Scope, SMs with counter-metrics, Open Questions, Assumptions Index).
