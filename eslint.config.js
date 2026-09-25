import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

const API_TO_WEB_PATTERNS = [
  { group: ["@todos/web", "@todos/web/*"] },
  {
    // Also relative escapes such as ../../web/src/x or ../apps/web
    regex: "(^|/)apps/web(/|$)|(^|/)\\.\\./web(/|$)",
    message: "apps/api must not import apps/web.",
  },
]

const FETCH_MESSAGE =
  "Only apps/web/src/api/http.ts may call fetch; use request() or its wrappers."

export default defineConfig([
  globalIgnores([
    "**/dist",
    "**/node_modules",
    "**/coverage",
    "_bmad",
    "_bmad-output",
    ".claude",
    "e2e/test-results",
    "e2e/playwright-report",
  ]),
  {
    files: ["**/*.{ts,tsx,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // `_ctx`-style params keep the AD-8 signature where ctx is not used yet.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Playwright suite: runs in Node, with page.evaluate callbacks in the browser.
    files: ["e2e/**/*.{ts,mjs}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn-generated UI primitives export variants alongside components
    files: ["apps/web/src/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Import boundaries: web and api may only reach each other through @todos/shared
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@todos/api", "@todos/api/*"] },
            {
              // Also relative escapes such as ../../api/src/x or ../apps/api
              regex:
                "(^|/)apps/api(/|$)|(^|/)\\.\\./api/(src|test|drizzle)(/|$)",
              message: "apps/web may reach the API only over HTTP.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: API_TO_WEB_PATTERNS,
        },
      ],
    },
  },
  {
    // AD-7: only repositories and db/ import Drizzle. Flat config replaces the
    // rule for these files, so the api→web patterns are repeated.
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/repositories/**", "apps/api/src/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...API_TO_WEB_PATTERNS,
            {
              group: ["drizzle-orm", "drizzle-orm/*"],
              message:
                "Only apps/api/src/repositories and apps/api/src/db may import Drizzle.",
            },
          ],
        },
      ],
    },
  },
  {
    // AD-6: `http.ts` is the only `fetch` caller in the web app.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/api/http.ts", "**/*.test.*"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: FETCH_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: FETCH_MESSAGE },
        { object: "globalThis", property: "fetch", message: FETCH_MESSAGE },
        { object: "self", property: "fetch", message: FETCH_MESSAGE },
      ],
    },
  },
  {
    files: ["packages/shared/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Only zod and same-folder ./ paths: no ../ can leave the package.
              regex: "^(?!zod$|\\./).*",
              message:
                "@todos/shared may import only zod and its own ./ modules.",
            },
          ],
        },
      ],
    },
  },
])
