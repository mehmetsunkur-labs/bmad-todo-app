- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-skeleton.md`
  summary: Add an automated smoke test that requests `/api/v1/health` through the Vite dev proxy (and later the nginx proxy) and expects `{"status":"ok"}` with the path unchanged.
  evidence: The proxy config in `apps/web/vite.config.ts` is only verified by manual curl; no test starts Vite, and `test:e2e` is an Epic 3 stub (verification-gap review, Story 1.1).
