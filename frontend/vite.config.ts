import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the Go service runs separately; same-origin in Docker, so no CORS either way.
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8080" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/test-setup.ts", "src/**/*.test.*"],
      reporter: [["text", { skipFull: false }], "html"],
    },
  },
})
