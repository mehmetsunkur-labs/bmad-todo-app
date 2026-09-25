import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores([
    "**/dist",
    "**/node_modules",
    "**/coverage",
    "_bmad",
    "_bmad-output",
    ".claude",
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
          patterns: [
            { group: ["@todos/web", "@todos/web/*"] },
            {
              // Also relative escapes such as ../../web/src/x or ../apps/web
              regex: "(^|/)apps/web(/|$)|(^|/)\\.\\./web(/|$)",
              message: "apps/api must not import apps/web.",
            },
          ],
        },
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
