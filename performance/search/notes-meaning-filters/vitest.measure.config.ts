import { defineConfig } from "vitest/config"
export default defineConfig({
  tsconfig: "./node_modules/@wirecat/cli-base/config/tsconfig.base.json",
  test: {
    include: [process.env.MEASURE_FILE ?? ".measure/notes.test.ts"],
    testTimeout: 900_000,
    deps: {
      optimizer: {
        ssr: { enabled: true, include: ["drizzle-orm", "drizzle-orm/sqlite-core", "drizzle-orm/node-sqlite"] },
      },
    },
  },
})
