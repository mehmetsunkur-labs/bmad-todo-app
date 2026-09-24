---
id: SPEC-todo-app
companions:
  - ../../planning-artifacts/prds/prd-Todo-App-2026-09-24/prd.md
  - ../../planning-artifacts/architecture/architecture-Todo-App-2026-09-24/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/EXPERIENCE.md
  - ../../planning-artifacts/ux-designs/ux-Todo-App-2026-09-24/DESIGN.md
sources:
  - ../../planning-artifacts/prds/prd-Todo-App-2026-09-24/input-original-brief.md
  - ../../planning-artifacts/prds/prd-Todo-App-2026-09-24/addendum.md
---

> **Canonical contract.** This SPEC and the files listed in `companions:` are the complete contract for what to build, test, and validate. The files in `sources:` are for traceability only.

# Todos v1

## Why

This is a **vision to realize**: a deliberately minimal personal todo list that people trust. Each Deployment is one person's list. They open it, act on it at once, and never lose work. It is also a clean, full-stack foundation that a new developer can run, understand, and extend (for example with accounts or new fields) without a rewrite. Trust and clarity matter more than breadth.

## Capabilities

Each capability's full testable consequences are in the PRD FRs it cites. Its behavior and copy are in `EXPERIENCE.md`, and its implementation invariants are in `ARCHITECTURE-SPINE.md`.

- **CAP-1**
  - **intent:** Opening the app shows the user's Todo List right away. The List States show clearly, and Completed Todos are easy to tell apart from Active ones (FR-1, FR-2, FR-3).
  - **success:** When the app URL opens, all Todos appear, newest first, with no onboarding. A Completed Todo differs from an Active one by at least two visual cues. The loading indicator appears only if data takes more than 300 ms. With no Todos, the Empty state shows and invites the first add. If the fetch fails, the Load error state shows with "Try again"; it never shows as an empty list.
- **CAP-2**
  - **intent:** The user can add a Todo by typing a Description (FR-4, FR-5).
  - **success:** A valid Description appears at the top within 100 ms, and the input clears and keeps focus. The Todo is still there after a reload. A whitespace-only Description does nothing. Input stops at 500 characters, and the API independently rejects anything invalid.
- **CAP-3**
  - **intent:** The user can edit the Description of any Todo inline (FR-6).
  - **success:** Enter or blur saves, and Escape restores the original. Empty or unchanged text cancels the edit, never deletes. The same validation as adding applies. `updatedAt` changes, while `createdAt` and the Todo's position stay the same.
- **CAP-4**
  - **intent:** The user can mark a Todo as Completed or back to Active (FR-7).
  - **success:** One click, tap, or Space toggles it within 100 ms. The Todo keeps its position, and the state survives a reload.
- **CAP-5**
  - **intent:** The user can delete any Todo (FR-8).
  - **success:** The Todo disappears within 100 ms, with no confirmation, and does not come back after a reload. Focus moves to the next row's checkbox, or the previous row's, or the add input.
- **CAP-6**
  - **intent:** Todos are stored durably on the server (FR-9, NFR-3).
  - **success:** Todos survive a browser refresh, a browser restart, access from a second device, an API restart, and `docker compose down` followed by `up`. No change the server has acknowledged is ever lost (SM-2 target: 0).
- **CAP-7**
  - **intent:** A change that fails to save returns to the last confirmed state and tells the user once, without losing what they typed (FR-10).
  - **success:** Across create, edit, toggle, and delete failures (network error, 10 s timeout, server error, or validation error):
    - the affected Todo returns to its confirmed state;
    - exactly one non-blocking message appears, using the copy in `EXPERIENCE.md`;
    - typed text is either restored or kept in a Retry toast that reuses the original id;
    - changes queued after a failure are dropped without being sent.
- **CAP-8**
  - **intent:** Developers and the frontend can rely on a consistent, documented Todo API (FR-11).
  - **success:** The API offers list, create, update, delete, and health operations under `/api/v1`. Every error uses a single envelope with a closed set of codes, and an API test covers each code. Unknown ids return `NOT_FOUND`. There are no partial writes. The OpenAPI snapshot is committed at `docs/api/openapi.json`, and a new developer can run the app and explain its data flow within 15 minutes (SM-5).
- **CAP-9**
  - **intent:** One responsive, accessible screen that looks and feels finished (FR-12, NFR-4, NFR-12).
  - **success:** The screen meets these checks:
    - no horizontal scrolling from 320 px to 1920 px wide, with touch targets of at least 44×44 px;
    - every action can be done by keyboard alone;
    - WCAG 2.1 AA contrast in both light and dark mode;
    - the tab title is "Todos" and the app has a favicon;
    - no layout jumps and no console errors;
    - 5 of 5 unguided testers, at least 2 of them on a phone, complete every core action (SM-1).
- **CAP-10**
  - **intent:** The whole system starts from a single documented command as containers, both for development and in a production-like setup (NFR-7).
  - **success:** `docker compose up` starts the development stack, with hot reload and a debugger port. `docker compose -f compose.yaml up -d` starts the production-like stack, which other devices on the network can reach. All configuration comes from environment settings. The README covers running the app, deploying it on one host, where the data lives, and the `down -v` data-loss warning.

## Constraints

- There is one personal Todo List per Deployment, with no authentication. Anyone who can reach the URL can read and change the list; this is an accepted risk.
- Adding an owner or authentication later, or new Todo fields, must not break existing endpoints or clients, and must not lose data (NFR-8, AD-2, AD-8).
- The system has exactly three parts: the web frontend, the Todo API, and PostgreSQL. There are no caches, queues, or third-party backends (NFR-11).
- UI actions show within 100 ms (Optimistic Update). API p95 latency is 300 ms or less. The design must cope with up to 1,000 Todos (NFR-1, NFR-2).
- A Description is 1–500 UTF-16 code units long, after line breaks are turned into spaces and the text is trimmed. It is always rendered as plain text (AD-3, NFR-10).
- Every request times out after 10 s. Timestamps are owned by the server, and concurrent writes resolve as last-write-wins (AD-3, AD-6, NFR-3).
- Logs never contain request or response bodies (NFR-9, AD-11).
- Supported browsers are the latest two versions of Chrome, Edge, Firefox, and desktop Safari, plus iOS Safari and Android Chrome (NFR-5).
- The frontend uses shadcn/ui (Radix) and Tailwind, and its color mode follows the operating system setting (`DESIGN.md`).
- Architecture decisions AD-1 to AD-12 are binding. The Stack table in `ARCHITECTURE-SPINE.md` gives the pinned versions.

## Non-goals

- User accounts, per-user lists, access control, collaboration, sharing, or assignment.
- Priorities, due dates, reminders, notifications, tags, several lists, search, filters, or manual reordering.
- Bulk actions, undo, confirming deletes, or archiving.
- Offline mode, a PWA, native apps, or real-time sync between sessions.
- Production hardening: TLS, public hosting, CI/CD, backups, monitoring, or more than one API replica.
- An in-app theme toggle, illustrations, or celebration animations.

## Success signal

- Five colleagues who have never seen Todos add, edit, complete, un-complete, and delete Todos without help, and at least two of them do it on a phone.
- A scripted run covering refresh, a second device, an API restart, and a container restart, plus a simulated API outage, ends with zero lost Todos. Every failed action is rolled back and reported.

## Assumptions

- The ten PRD §9 assumptions and the UX Fast-path assumptions (the teal accent, auto-focus only on pointer devices, no linkification, toasts announced as status) were accepted by the product owner and are treated as decisions.
