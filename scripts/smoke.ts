/**
 * The second runtime, actually executed: `bun test` cannot run the Vitest suite, so this drives the
 * real exports with plain assertions under Bun.
 *
 *   bun run scripts/smoke.ts
 */
import { strict as assert } from "node:assert"
import { SUITE_GROUPS } from "../src/index.ts"

assert.ok(SUITE_GROUPS.includes("security"))
console.log("smoke ok")
