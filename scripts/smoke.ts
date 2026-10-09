/**
 * The second runtime, actually executed: `bun test` cannot run the Vitest suite, so this drives the
 * real exports with plain assertions under Bun.
 *
 *   bun run scripts/smoke.ts
 */
import { strict as assert } from "node:assert"
import { compareRuns, redactTranscript, SUITE_GROUPS } from "../src/index.ts"

assert.ok(SUITE_GROUPS.includes("security"))
const empty = { schema: 1 as const, suite: "security", complete: true, observations: [], known: [] }
assert.deepEqual(compareRuns("security", empty, empty), { new: [], fixed: [], cameBack: [], unchanged: [] })
assert.equal(redactTranscript("/synthetic-root/file", ["/synthetic-root"]), "[ROOT]/file")
console.log("smoke ok")
