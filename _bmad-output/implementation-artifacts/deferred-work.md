- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-skeleton.md`
  summary: Add an automated smoke test that requests `/api/v1/health` through the Vite dev proxy (and later the nginx proxy) and expects `{"status":"ok"}` with the path unchanged.
  evidence: The proxy config in `apps/web/vite.config.ts` is only verified by manual curl; no test starts Vite, and `test:e2e` is an Epic 3 stub (verification-gap review, Story 1.1).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-complete-and-un-complete-a-todo.md`
  summary: When a toggle's PATCH `404` removes a focused row, focus falls to `<body>`; reuse Story 2.3's focus-after-removal rule (next row's checkbox, else the previous row's, else the Add input).
  evidence: EXPERIENCE.md says focus is never lost to `<body>`. Story 2.2's `404` rollback removes the row with no focus handling, and Story 2.3 (`spec-2-3-delete-a-todo.md`) explicitly left that path out of scope.
