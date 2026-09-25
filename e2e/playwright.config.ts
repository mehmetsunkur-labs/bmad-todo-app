import { defineConfig, devices } from "@playwright/test"

// Run through `pnpm test:e2e` (scripts/run-e2e.mjs), which brings up the
// isolated `todos-e2e` stack and the containerised Playwright run-server and
// sets these variables.
const baseURL = process.env.E2E_BASE_URL
const wsEndpoint = process.env.E2E_WS_ENDPOINT

if (!baseURL || !wsEndpoint) {
  throw new Error(
    "E2E_BASE_URL and E2E_WS_ENDPOINT are unset: run the suite via pnpm test:e2e"
  )
}

const DURABILITY = /durability\.spec\.ts$/
// Story 3.4's accessibility, responsive, performance and finish checks.
const QUALITY = /quality\/.*\.spec\.ts$/

export default defineConfig({
  testDir: "tests",
  // One database for every test, and the durability project restarts the
  // stack: tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    connectOptions: { wsEndpoint },
    // Row entrance and exit motion are skipped, so assertions never race it.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [DURABILITY, QUALITY],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: [DURABILITY, QUALITY],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: [DURABILITY, QUALITY],
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
      testIgnore: [DURABILITY, QUALITY],
    },
    {
      // Desktop Chromium only: CDP network throttling is Chromium-only, and
      // axe results don't depend on the engine. Tests set their own viewport,
      // touch and colour scheme where a check needs one.
      name: "quality",
      use: { ...devices["Desktop Chrome"] },
      testMatch: QUALITY,
    },
    {
      // Restarts the stack, so it runs last, after every other project.
      name: "durability",
      use: { ...devices["Desktop Chrome"] },
      testMatch: DURABILITY,
      dependencies: [
        "chromium",
        "firefox",
        "webkit",
        "mobile-chromium",
        "quality",
      ],
    },
  ],
})
