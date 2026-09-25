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
      testIgnore: DURABILITY,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: DURABILITY,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: DURABILITY,
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
      testIgnore: DURABILITY,
    },
    {
      // Restarts the stack, so it runs last, after every browser project.
      name: "durability",
      use: { ...devices["Desktop Chrome"] },
      testMatch: DURABILITY,
      dependencies: ["chromium", "firefox", "webkit", "mobile-chromium"],
    },
  ],
})
