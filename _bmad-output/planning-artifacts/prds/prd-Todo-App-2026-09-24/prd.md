---
title: Todos PRD
status: final
created: 2026-09-24
updated: 2026-09-24
---

# PRD: Todos

*Product name: **Todos**. Project and repository name: Todo-App.*

## 0. Document Purpose

This PRD defines **what** v1 of Todos must do and how well it must do it. It is written for the product owner, the developers who build and maintain the app, and the downstream BMad workflows: UX (`bmad-ux`), architecture (`bmad-architecture`), and epics and stories (`bmad-create-epics-and-stories`). It builds on the original project brief (`input-original-brief.md` in this folder).

Terms are defined once in §3 Glossary and used exactly as written everywhere else. §4 groups the requirements into features and gives each a stable global ID (FR-N). Inferred decisions carry an inline `[ASSUMPTION]` tag, and §9 lists them all. Technology choices are deliberately left out; they belong to architecture.

## 1. Vision

Todos is a deliberately small, full-stack web application for keeping a personal list of tasks. You open it, see your list, and act on it straight away: add a task, fix a typo, tick it off, or remove it. There is no sign-up, no onboarding, and nothing to configure.

Its value is **trust and clarity** rather than breadth. Every change shows on screen immediately, is saved reliably, and is still there after a refresh or a restart. A completed task looks different from an active one at a glance. When something goes wrong, the app says so plainly and never silently loses work.

It is also meant to be a **clean foundation**. The codebase and API should be easy for a new developer to understand, run, deploy, and extend. v1 includes no user accounts, collaboration, priorities, due dates, or notifications, but nothing in it should stop those from being added later.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** capture a task the moment it comes to mind, and see at a glance what is still left to do.
- **Functional:** mark progress by completing tasks, and tidy the list by editing or deleting items.
- **Emotional:** trust that the list is accurate and saved, and not worry that a refresh wiped it.
- **Contextual:** use it from a desktop browser at work or a phone browser on the go, without a separate app.
- **Builder / maintainer:** a developer can read, run, and extend the codebase without a guided tour.

### 2.2 Non-Users (v1)

- Teams that need to assign, share, or discuss tasks. There is no collaboration model.
- People who want to share one list with others. In v1, each Deployment is one person's personal list (see §6.1).
- Users who need several separate lists.
- Power users who need priorities, due dates, reminders, tags, or search.

### 2.3 Key User Journeys

- **UJ-1. Dana clears her morning in two minutes.**
  - **Persona + context:** Dana, an internal operations analyst, keeps her day's small tasks in her own Todos Deployment, which she can reach from her laptop and her phone.
  - **Entry state:** she opens the app URL in a desktop browser. There is no login.
  - **Path:** the list loads, with a short loading indicator on a slow connection. She types "Send Q3 access review reminder" in the input and presses Enter, and the new Todo appears at once. She notices a typo in yesterday's "Book room for retor", clicks it, corrects it to "retro", and presses Enter. She ticks "Reply to IT ticket", which is now visibly marked as completed.
  - **Climax:** she refreshes the page out of habit and everything is exactly as she left it.
  - **Resolution:** her list shows what remains active and what is done. She deletes two old Completed Todos to tidy up.
  - **Edge case:** the server is unreachable when she ticks a Todo. The Todo briefly shows as completed, reverts, and a non-blocking message tells her the change could not be saved and she should try again. Nothing else on screen is lost.

- **UJ-2. Dana checks her list from her phone.**
  - **Persona + context:** the same Dana, walking to a meeting, wants to check what is left.
  - **Entry state:** mobile browser, portrait orientation.
  - **Path:** the list fits the narrow screen without horizontal scrolling. She can easily tap to complete a Todo, and adds "Follow up with facilities" using the on-screen keyboard.
  - **Climax:** back at her laptop, the Todo she added on her phone is there.
  - **Resolution:** the same list, in sync after a reload.

- **UJ-3. Priya opens her new Deployment for the first time.**
  - **Persona + context:** Priya, a product designer, has just set up her own Todos Deployment.
  - **Entry state:** she opens the URL for the first time.
  - **Path:** instead of a blank page, she sees a friendly empty state that invites her to add her first Todo, with the input already visible.
  - **Climax:** she adds one without needing any explanation.

- **UJ-4. Sam, a developer, extends the app.**
  - **Persona + context:** Sam joins the team and is asked to evaluate adding user accounts.
  - **Path:** Sam clones the repository, follows the README to run it locally, reads the API description, and identifies where ownership of a Todo would be introduced.
  - **Climax:** Sam has the app running and understands the data flow within one working session, without asking the original authors.

## 3. Glossary

- **Todo:** a single task the user wants to track. It has exactly one **Description**, one **Completion Status**, and **Timestamps**. It belongs to exactly one **Todo List**.
- **Description:** the short, user-entered text of a Todo. Plain text, 1–500 characters after trimming leading and trailing whitespace. `[ASSUMPTION: 500-character cap]`
- **Completion Status:** whether a Todo is **Active** (not yet done) or **Completed** (done). A Todo can move between the two states in either direction.
- **Active Todo / Completed Todo:** a Todo whose Completion Status is Active or Completed, respectively.
- **Timestamps:** system-managed metadata on each Todo: **Created At** (set once, when the Todo is created) and **Updated At** (changes whenever the Description or Completion Status changes).
- **Todo List:** the full, ordered collection of Todos in one **Deployment**. In v1 there is exactly one Todo List per Deployment.
- **Deployment:** one running instance of Todos (frontend, API, and persistent store) at one URL. In v1, each Deployment belongs to one person.
- **Todo API:** the backend interface through which the frontend (and future clients) create, read, update, and delete Todos.
- **Optimistic Update:** the UI shows the result of a user action immediately, before the Todo API confirms it, and reverts it if the Todo API reports failure.
- **List States:** the four presentation states of the Todo List view: **Loading**, **Empty**, **Populated**, and **Error**.

## 4. Features

### 4.1 View the Todo List

**Description:** when the app opens, the user sees the Todo List immediately, with no onboarding, sign-in, or navigation. Todos appear newest first `[ASSUMPTION: newest-first ordering, fixed; no user reordering]`. Completed Todos stay in their position and are styled so they are easy to tell apart from Active Todos. The view always shows exactly one of the List States. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-1: Show the Todo List on open

A user who opens the app URL sees the Todo List without any intermediate screen. Realizes UJ-1.

**Consequences (testable):**
- The first screen rendered at the app URL is the Todo List view. There is no login, splash, or onboarding.
- Every Todo stored in the Deployment is shown, ordered by Created At, newest first.
- Each Todo shows its Description, its Completion Status, and its Created At time. `[ASSUMPTION: shown in a subtle relative format, e.g. "2h ago", with the absolute time on hover or focus]`

#### FR-2: Distinguish Completed Todos visually

The user can tell Active Todos from Completed Todos at a glance. Realizes UJ-1.

**Consequences (testable):**
- A Completed Todo differs from an Active Todo in at least two visual properties (for example, a checked control plus strikethrough or dimmed text), so the status is never conveyed by color alone.
- The Completion Status is also exposed to assistive technology (for example, a checkbox's checked state).

#### FR-3: Show Loading, Empty, and Error states

The Todo List view shows a clear state while it is loading, when there are no Todos, and when loading fails. Realizes UJ-3.

**Consequences (testable):**
- **Loading:** while the initial fetch is in progress, a loading indicator appears. To avoid flicker, no loading indicator appears if the data arrives within 300 ms.
- **Empty:** when the Todo List has zero Todos, an empty-state message invites the user to add their first Todo, and the add input is visible and usable.
- **Error:** if the initial fetch fails, an error message explains that the list could not be loaded and offers a **Retry** action. The view must never show an empty list as though there were no data.

### 4.2 Create a Todo

**Description:** a single, always-visible input at the top of the list lets the user add a Todo by typing a Description and pressing Enter (or activating an Add button). The new Todo appears at once. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-4: Add a Todo

The user can create a Todo by entering a Description. Realizes UJ-1.

**Consequences (testable):**
- Submitting a valid Description adds a new Active Todo at the top of the list within 100 ms of submission (Optimistic Update), then clears the input and keeps focus in it for rapid entry.
- The Todo API assigns Created At and Updated At. The client does not supply them.
- After a page reload, the new Todo is still present.

#### FR-5: Validate the Description on create

The system rejects Descriptions that are empty or too long.

**Consequences (testable):**
- A Description that is empty or whitespace-only cannot be submitted. The Add action does nothing, and no error toast appears.
- A Description longer than 500 characters is prevented at input, with a visible character limit near the cap.
- The Todo API independently rejects invalid Descriptions with a validation error; it never relies on client-side validation alone.

### 4.3 Edit a Todo

**Description:** the user can correct or reword a Todo's Description inline, without leaving the list. Realizes UJ-1.

**Functional Requirements:**

#### FR-6: Edit a Description inline

The user can change the Description of an existing Todo, whether it is Active or Completed.

**Consequences (testable):**
- Activating edit mode (double-click or an Edit control on desktop, or an Edit control on touch devices `[ASSUMPTION: interaction pattern to be finalized in UX]`) turns the Description into an editable field that is pre-filled and focused.
- Enter or blur saves the change. Escape cancels it and restores the original Description.
- The same validation as FR-5 applies. Saving an empty Description is not allowed and does not delete the Todo `[ASSUMPTION: empty-on-edit cancels rather than deletes]`.
- A successful save updates Updated At and leaves Created At and the Todo's position unchanged.

### 4.4 Complete and Un-complete a Todo

**Description:** a single control on each Todo toggles its Completion Status. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-7: Toggle Completion Status

The user can mark an Active Todo as Completed, and a Completed Todo as Active.

**Consequences (testable):**
- One click or tap on the Todo's completion control toggles its Completion Status. The visual change (FR-2) appears within 100 ms (Optimistic Update).
- The Todo keeps its position in the list.
- The change persists across a page reload.

### 4.5 Delete a Todo

**Description:** the user can permanently remove a Todo from the list. Realizes UJ-1.

**Functional Requirements:**

#### FR-8: Delete a Todo

The user can delete any Todo, whether it is Active or Completed.

**Consequences (testable):**
- Each Todo has a Delete control that is visible on touch devices and reachable by keyboard. On desktop, it may appear on hover or focus.
- Deletion takes effect immediately, with no confirmation dialog `[ASSUMPTION: no confirm and no undo in v1; revisit if accidental deletes are reported]`. The Todo disappears within 100 ms (Optimistic Update).
- After a page reload, the deleted Todo does not reappear.

**Out of Scope:**
- Bulk delete ("clear completed"), undo, and trash or archive.

### 4.6 Persistence, Feedback, and Failure Handling

**Description:** this feature is what makes users trust the app. Every change is saved durably, and every failure is visible and recoverable. It applies to FR-4, FR-6, FR-7, and FR-8. Realizes UJ-1 (edge case) and UJ-2.

**Functional Requirements:**

#### FR-9: Durable persistence

All Todo changes are saved by the Todo API to a persistent store.

**Consequences (testable):**
- Todos survive a browser refresh, closing and reopening the browser, opening the app from a different device, and a restart of the Todo API server or of the whole containerized stack (as long as its data volume is not deliberately removed).
- The browser does not act as the store. Clearing browser storage does not affect the Todo List.

#### FR-10: Roll back and notify on failed changes

When the Todo API rejects or fails to complete a change, the UI returns to the true state and tells the user.

**Consequences (testable):**
- If a create, edit, toggle, or delete fails (a network error, a timeout after 10 seconds `[ASSUMPTION: 10-second request timeout]`, or a server error), the affected Todo returns to its pre-action state. For a failed create, the typed Description is restored to the input so the user doesn't lose it. For a failed edit, the Todo stays in edit mode with the attempted Description, so the user can retry or cancel.
- A non-blocking message (for example, a toast or inline notice) states that the change could not be saved. It does not require a page reload, and other Todos remain usable.
- Validation errors from the Todo API are shown as a human-readable message, not as raw error codes.
- When several changes to the same Todo are pending (for example, toggling a Todo whose create has not yet been confirmed, a rapid double toggle, or deleting during a pending edit), they are applied in the order the user made them. If one fails, the Todo is restored to its last state confirmed by the Todo API, and no later change is applied on top of a failed one.

#### FR-11: Consistent Todo API

The Todo API offers create, read (list), update (Description and/or Completion Status), and delete operations on Todos with predictable, documented behavior. Realizes UJ-4.

**Consequences (testable):**
- Each operation returns a consistent response shape. Errors use a consistent error structure that includes a machine-readable code and a human-readable message.
- Operations on a Todo that does not exist return a "not found" error. They do not fail silently or create the Todo.
- Invalid input returns a validation error, and nothing is written.
- Each operation either takes full effect or none: there are no partially saved Todos.
- The Todo API is documented (endpoints or operations, fields, and error codes) in the repository.

### 4.7 Responsive Web Experience

**Description:** one web app serves both desktop and mobile browsers. Realizes UJ-2.

**Functional Requirements:**

#### FR-12: Responsive layout

The Todo List view works from 320 px to at least 1920 px viewport width.

**Consequences (testable):**
- The layout never scrolls horizontally, at any width in that range.
- Interactive controls have touch targets of at least 44×44 px on touch devices.
- Long Descriptions (up to 500 characters, including unbroken strings such as URLs) wrap within their row without breaking the layout.

## 5. Cross-Cutting Non-Functional Requirements

- **NFR-1 Perceived performance:** user actions (FR-4, FR-6, FR-7, FR-8) are reflected in the UI within 100 ms. The initial list is interactive within 2 s on a typical office broadband connection, with a list of up to 1,000 Todos `[ASSUMPTION: 1,000 Todos is the upper bound for v1 sizing]`.
- **NFR-2 API responsiveness:** under normal load (a single user, possibly with a few open tabs or devices), 95% of Todo API requests complete within 300 ms, measured at the server.
- **NFR-3 Reliability and integrity:** no acknowledged change is ever lost. A server restart must not lose or corrupt Todos. Concurrent edits from two browser tabs resolve as last-write-wins, with no crashes or corrupted records `[ASSUMPTION: last-write-wins is acceptable for v1]`.
- **NFR-4 Accessibility:** WCAG 2.1 AA for the Todo List view. All actions can be performed with the keyboard alone, focus is visible, labels are accessible, and color contrast is at least 4.5:1 for text `[ASSUMPTION: AA target for an internal tool]`.
- **NFR-5 Browser support:** the latest two versions of Chrome, Edge, Firefox, and Safari (desktop), plus Safari on iOS and Chrome on Android.
- **NFR-6 Maintainability:** a developer new to the project can run it locally within 15 minutes by following the README. The codebase includes automated tests covering every FR's consequences at the API level, plus the core UI flows (add, edit, toggle, delete, and the failure rollback).
- **NFR-7 Containerized delivery:** the whole application (frontend, Todo API, and persistent store) is containerized and starts locally with a single documented command via a container composition, for development and debugging. Configuration (for example, ports and store location) comes from environment settings rather than code edits. Persistent data lives in a named volume, so it survives container restarts and rebuilds. The same container setup can be run manually on one host so the Deployment is reachable over the network from other devices, such as a phone. The README explains how to do this, which settings to provide, where the data lives, and how to upgrade without losing data.
- **NFR-8 Extensibility:** the Todo data model and Todo API must allow a Todo owner (user), authentication, and new Todo fields (for example, priority or due date) to be added later without rewriting existing endpoints, breaking existing clients, or migrating in a way that loses data. This is a design constraint for architecture. It is not a v1 feature.
- **NFR-9 Observability (basic):** the Todo API logs every request with a timestamp, operation, outcome, and latency, and logs unhandled errors with enough context to diagnose them. The Todo API must not log full request bodies; the only part of the Description it may log is its length.
- **NFR-10 Input safety:** Descriptions are stored and rendered as plain text. Any HTML or script content is displayed literally and never executed.
- **NFR-11 Simplicity and robustness:** the system has exactly three parts: the frontend, the Todo API, and the persistent store. There are no extra services, such as caches, queues, or third-party backends. A failed or malformed request must never stop the Todo API from serving later requests.
- **NFR-12 Product finish:** v1 must feel like a finished product, not a demo. The product name, **Todos**, appears in the page header and the browser tab title, and the app has a favicon. All List States share one consistent visual design. There is no placeholder text, no errors in the browser console during normal use, and no layout jumps when Todos are added, completed, or removed.

## 6. MVP Scope

### 6.1 In Scope

- One personal Todo List per Deployment, used by one person, with no accounts.
- A containerized Deployment that the owner runs manually on one host and can reach over the network from their other devices (NFR-7).
- Viewing, creating, inline editing, completing and un-completing, and deleting Todos (FR-1 to FR-8).
- Loading, Empty, and Error List States (FR-3).
- Optimistic Updates with rollback and a non-blocking error message (FR-10).
- Durable server-side persistence and a documented Todo API (FR-9, FR-11).
- A responsive web UI for desktop and mobile browsers (FR-12).

### 6.2 Out of Scope for MVP

- **User accounts, authentication, and per-user lists:** deferred to a later version. The architecture must keep this possible (NFR-8).
- **Access control on the Deployment:** anyone who can reach the Deployment's URL can read and change the Todo List. This is an accepted v1 risk; network placement is the deployer's responsibility.
- **Production hardening:** production hosting, TLS, scaling or high availability, monitoring and alerting, backups and restore, and a CI/CD pipeline are all out of scope for v1. v1 is deployed manually on one host and is reachable over the network, with none of the hardening listed here.
- **Collaboration, sharing, and assignment.**
- **Priorities, due dates, reminders, and notifications.**
- **Tags, categories, multiple lists, search, filters (All / Active / Completed), and manual reordering.**
- **Bulk actions (clear completed, select many) and undo.**
- **Offline mode, PWA installation, and native mobile apps.**
- **Real-time sync between open sessions.** Other tabs or devices see changes when they reload.

## 7. Success Metrics

**Primary**

- **SM-1: Unguided task completion.** In a hallway test with at least 5 internal colleagues who have never seen the app, each completes add, edit, complete, un-complete, and delete without help or explanation. Each tester can also say which Todos are completed, and can explain what happened after a simulated failed save. At least 2 of the testers use a phone. Target: 5 out of 5, with an average ease rating of at least 6 out of 7. Validates FR-1, FR-2, FR-4, FR-6, FR-7, FR-8, FR-10, FR-12, NFR-12.
- **SM-2: Zero data loss.** Across the scripted refresh, reopen, second-device, server-restart, and container-restart checks, count Todos lost or reverted after an acknowledged save. Target: 0. Validates FR-9, NFR-3.

**Secondary**

- **SM-3: Perceived speed.** Measured in automated UI tests. Target: the UI reflects 95% of actions within 100 ms. Validates NFR-1.
- **SM-4: Failure clarity.** In a simulated API outage, every failed action rolls back and shows a message, and no Todo is left in an incorrect state. Target: 100% of scripted failure cases. Validates FR-3, FR-10.
- **SM-5: Developer onboarding.** A developer who did not build the app runs it locally and explains the data flow using only the README and API docs. Target: within 15 minutes. Validates FR-11, NFR-6.

**Counter-metrics (do not optimize)**

- **SM-C1: Feature count and UI surface.** Do not add controls, settings, or screens to "improve" the metrics. Clarity comes from minimalism. Counterbalances SM-1.
- **SM-C2: Apparent speed at the expense of honesty.** Do not hide or delay error messages to make the app feel faster, and never leave an Optimistic Update showing after a failure. Counterbalances SM-3.

## 8. Open Questions

None open. Resolved on 2026-09-24:

1. **Deployment access:** there is no authentication and no access restriction in v1. Anyone who can reach the URL can read and change the Todo List. This is an accepted risk.
2. **Deployment ownership:** there is no deployment team. The product owner deploys it personally. v1 ships as containers, with a container composition for local development and debugging (NFR-7).
3. **Backups:** none are expected. Production concerns are out of scope for v1 (§6.2).
4. **Personal or shared list:** personal. Each Deployment is one person's Todo List, as in the original brief.
5. **Reachability:** the Deployment runs manually on one host and is reachable over the network from other devices, with no production hardening.

## 9. Assumptions Index

The product owner reviewed and accepted all of these on 2026-09-24. They stand as v1 decisions unless UX or architecture work turns up a reason to revisit them.

- §3 Glossary: the Description is capped at 500 characters.
- §4.1 FR-1: fixed newest-first ordering, with no manual reordering.
- §4.1 FR-1: Created At is shown in a relative format, with the absolute time on hover or focus.
- §4.3 FR-6: the edit interaction pattern (double-click or an Edit control on desktop, an Edit control on touch) will be finalized in UX.
- §4.3 FR-6: saving an empty Description while editing cancels the edit and does not delete the Todo.
- §4.5 FR-8: delete has no confirmation dialog and no undo in v1.
- §4.6 FR-10: a request times out after 10 seconds.
- §5 NFR-1: up to 1,000 Todos is the v1 sizing bound.
- §5 NFR-3: last-write-wins is acceptable for concurrent edits.
- §5 NFR-4: the accessibility target is WCAG 2.1 AA.
