# Reconciliation: input-original-brief.md → prd.md (+ addendum.md)

Date: 2026-09-24. Sources: `input-original-brief.md`, `prd.md`, `addendum.md`, `.memlog.md` (logged decisions).

Status key: **captured** = explicit and testable in the PRD; **weak** = present but vague, partial, or untestable; **missing** = not in the PRD; **intentional divergence** = differs from the brief, and `.memlog.md` records it as a user decision.

## Sentence-by-sentence extract

| # | Brief item | PRD location | Status | Notes |
|---|---|---|---|---|
| P1.1 | Simple full-stack Todo application | §1 Vision ("deliberately small, full-stack web application") | captured | |
| P1.2 | For **individual** users to manage **personal** tasks | §1, §2.1 JTBD; §3 "Todo List" (one per Deployment); §2.2; UJ-1 ("the team's Todo-App deployment"); NFR-2 ("used by a handful of people at once") | weak / partial contradiction | Memlog logs "one list per deployment" and "open access accepted", but it doesn't log that the list is **shared by a team**. UJ-1 and NFR-2 describe several people using one shared list, and §2.2 treats "privacy from other people using the same deployment" as a non-need. That drifts from "personal tasks" without a logged reason. |
| P1.3 | Clear, reliable, and intuitive | §1 ("trust and clarity"), §4.6, SM-1, SM-2 | captured | "Intuitive" is covered only through SM-1 (unguided completion). |
| P1.4 | Focus on clarity and ease of use; avoid unnecessary features or complexity | §6.2, SM-C1 | captured | SM-C1 covers the UI surface only (see P4.1 for system simplicity). |
| P1.5 | Solid technical foundation that can be extended in the future | §1 ("clean foundation"), NFR-6, NFR-8, UJ-4 | captured | |
| P2.1 | Create, view, complete, and delete todos | FR-1, FR-4, FR-7, FR-8 | captured | |
| P2.1a | (PRD adds) Inline edit | FR-6, §4.3 | intentional divergence | Logged: "v1 includes inline editing". |
| P2.1b | (PRD adds) Un-complete (a two-way toggle) | FR-7, §3 Completion Status | weak (unlogged extension) | This is a harmless, sensible addition, but it isn't in the brief or the memlog. |
| P2.2 | Each todo is a single task with a short text description | §3 Todo / Description, FR-5 (1–500 chars) | captured | The 500-character cap is an accepted assumption. It's generous for a "short" description, but the user accepted it. |
| P2.3 | Completion status | §3 Completion Status, FR-2, FR-7 | captured | |
| P2.4 | Basic metadata such as creation time | §3 Timestamps, FR-1 (Created At shown), FR-4 | captured | |
| P2.5 | See the list immediately on opening | FR-1, NFR-1 (interactive within 2 s) | captured | |
| P2.6 | Interact without any onboarding or explanation | FR-1 (no onboarding), UJ-3, SM-1 | captured | |
| P3.1 | Frontend fast and responsive | NFR-1, NFR-2 | captured | |
| P3.2 | Updates reflected instantly on add or complete | FR-4, FR-7, FR-8 (100 ms, Optimistic Update), NFR-1 | captured | FR-6 (edit) has no 100 ms / optimistic consequence of its own. It's covered only through NFR-1, which is minor. |
| P3.3 | Completed tasks visually distinguishable at a glance | FR-2 | captured | |
| P3.4 | Works well across desktop and mobile | FR-12, NFR-5, UJ-2, §2.1 contextual JTBD | captured | Form factor is logged (responsive web, no PWA or native). |
| P3.5 | Sensible empty, loading, and error states | FR-3, FR-10, §3 List States | captured | |
| P3.6 | "…to maintain a **polished** user experience" | not stated as a requirement; implied by FR-3 and delegated to `bmad-ux` | weak | No requirement or quality bar describes polish: visual consistency, no layout shift or jank on add/remove, and designed (not default-browser) controls and states. |
| P4.1 | Backend exposes a **small, well-defined** API | FR-11 | captured | "Well-defined" means documented, consistent shapes and error codes. "Small" is implicit. |
| P4.2 | Persist and retrieve todo data | FR-9, FR-11 | captured | |
| P4.3 | Supports basic CRUD | FR-11 | captured | |
| P4.4 | Data consistency and durability across user sessions | FR-9, FR-11 (atomic), NFR-3, SM-2 | captured | |
| P4.5 | Auth and multi-user not required in v1 | §6.2 | captured | |
| P4.6 | Architecture must not prevent auth and multi-user later | NFR-8, UJ-4 | captured | |
| P5.1 | Prioritize **simplicity**, performance, maintainability | Performance: NFR-1/2. Maintainability: NFR-6. Simplicity: SM-C1 (UI only) | weak (simplicity) | Nothing constrains technical or system simplicity, such as the number of moving parts, dependencies, or components. §0 defers technology to architecture, but there is no guardrail that architecture must respect. |
| P5.2 | Interactions feel instantaneous under normal conditions | NFR-1, SM-3 | captured | |
| P5.3 | Easy to **understand** for future developers | NFR-6, FR-11 (API docs), SM-5, UJ-4 | captured | |
| P5.4 | Easy to **deploy** | NFR-7 (local Compose only), addendum; §6.2 excludes production hardening | intentional divergence, but weak on what remains | Memlog: "product owner deploys manually", with production concerns out of scope. Still, no requirement makes that manual deployment easy. NFR-7 is framed as "for development and debugging" only, and the README isn't required to cover running the stack on a host. |
| P5.5 | Easy to **extend** | NFR-8, UJ-4 | captured (for auth and owner only) | See P6.2. |
| P5.6 | Basic error handling on the client | FR-3 (Error state), FR-10 | captured | |
| P5.7 | Basic error handling on the server | FR-11 (error structure, not-found, validation), FR-5, NFR-9 | weak | Nothing says an unhandled error in one request must not crash or take down the API. NFR-3 mentions "no crashes" only for concurrent edits. |
| P5.8 | Handle failures gracefully without disrupting the user flow | FR-10 (non-blocking, no reload, other Todos usable, input restored), UJ-1 edge case, SM-4, SM-C2 | captured | |
| P6.1 | v1 excludes accounts, collaboration, prioritization, deadlines, notifications | §6.2, §2.2 | captured | |
| P6.2 | These may be considered in future iterations | §1 ("nothing in it should stop those from being added later"); NFR-8 covers owner and auth only | weak | The Vision promises extensibility for priorities, due dates, and similar features, but no NFR binds it. NFR-8 names only owner and auth. |
| P6.3 | Initial delivery stays focused on a clean, reliable core experience | §6.1, SM-C1 | captured | |
| P7.1 | Success: a user completes all core actions **without guidance** | SM-1 (5 of 5 unguided colleagues) | captured | SM-1 doesn't require any participant to use a phone, although mobile is a stated target (P3.4). |
| P7.2 | Success: stability across refreshes and sessions | SM-2, FR-9 | captured | |
| P7.3 | Success: **clarity** of the overall user experience | SM-1 (completion only), SM-4 (failure clarity, scripted) | weak | Task completion is measured, but perceived clarity isn't. For example, nothing checks that users can read status at a glance, understand an error message, or rate the experience as easy. |
| P7.4 | The final result should **feel like a complete, usable product** despite minimal scope | none | missing | No product-completeness bar exists. The product name is still unconfirmed ("Working title. Confirm the name."). There is no requirement for a page title or favicon, a finished visual design for all states, no leftover placeholder or dev artifacts, or no console errors. |

## Contradictions without a logged reason

1. **Personal list vs. shared team list** (P1.2). The brief says "individual users… personal tasks". UJ-1 places Dana in "the team's Todo-App deployment", and NFR-2 sizes for "a handful of people at once". Taken together, a team shares and edits one list. The memlog logs one list per deployment and open access, but not the use model of a team sharing one list. That use model is also at odds with FR-8 (instant delete with no confirm and no undo), because in a shared list one person can delete another person's items.
2. **Un-complete** (P2.1b). This is a minor, unlogged addition. It's benign, and it can be kept as is if it's recorded.

## Gaps and suggested fixes

1. **"Feel like a complete, usable product" is missing (P7.4).** Add a short §4.8 or an NFR-11 "Product finish" with testable consequences:
   - the product name is confirmed and shown in the UI header and the browser tab title, and a favicon is present
   - every List State and the error toast follow a single UX-specified visual design, with no unstyled default browser controls
   - no placeholder or lorem text, debug output, or browser-console errors in normal use
   - adding or removing a Todo causes no layout jump in unrelated rows

   Resolve the "Working title" note in the PRD header.
2. **The PRD drifts from a personal list to a shared team list without a logged reason (P1.2).** Pick one and log it. Either (a) reframe UJ-1 as Dana running or using *her own* deployment, and state in §2.2/§6.1 that v1 assumes one person per deployment, or (b) log in the memlog and §6.2 that a team sharing one list is an accepted v1 use. With (b), revisit FR-8's no-confirm, no-undo assumption, because one person could delete another's items.
3. **"Polished" and "clarity" have no quality bar (P3.6, P7.3).** Extend SM-1 so that participants also (i) correctly identify which items are completed in a mixed list, (ii) explain in their own words what happened after a simulated failed save, and (iii) give a mean ease rating of at least 6 out of 7 (Single Ease Question). Also require at least 2 of the 5 participants to use a phone.
4. **"Easy to deploy" is reduced to local dev only (P5.4).** Production hardening is an intentional divergence, but the brief's ease-of-deploy intent can still be kept. Add to NFR-7: "The README documents how the product owner runs the same container composition on a single host (required environment settings, data-volume location, how to upgrade without losing data). A first manual deployment takes 30 minutes or less by following it."
5. **Weak NFRs for simplicity, server robustness, and extensibility (P5.1, P5.7, P6.2).**
   - Add NFR-12 "Simplicity": no components beyond frontend, Todo API, and store; no message queues, caches, or extra services in v1 without a recorded reason in the architecture document.
   - Add to FR-11 or NFR-3: "An unhandled error while processing one request returns the standard error structure and does not stop the Todo API from serving later requests."
   - Widen NFR-8: "Adding optional Todo fields later (for example, priority or due date) must be possible as additive, backward-compatible API and schema changes."

Minor: record un-complete (FR-7 two-way toggle) as a deliberate extension. Optionally, add an explicit "reflected within 100 ms (Optimistic Update)" consequence to FR-6 so that it matches FR-4, FR-7, and FR-8.
