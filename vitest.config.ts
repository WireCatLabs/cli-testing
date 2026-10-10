import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Agents run suites side by side on 24 cores; one worker per core ran the machine out of memory (2026-10-11).
    maxWorkers: 4,
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
    setupFiles: ["test/sandbox.ts"],
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
