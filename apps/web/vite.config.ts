/// <reference types="vitest/config" />
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { parseAllowedHosts } from "./vite-allowed-hosts"

const apiProxyTarget = process.env.API_PROXY_TARGET || "http://localhost:3000"
// Extra dev host names (for LAN testing by name), from .env; never committed.
const allowedHosts = parseAllowedHosts(process.env.DEV_ALLOWED_HOSTS)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
    // Same-origin API: forward /api unchanged (no rewrite); CORS stays off.
    proxy: {
      "/api/": { target: apiProxyTarget },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
})
