import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      // A little under what the suite reaches (2026-10-04), so coverage can rise and not fall.
      thresholds: {
        lines: 98,
        statements: 97,
        functions: 95,
        branches: 94,
        perFile: { lines: 50 },
      },
    },
  },
})
