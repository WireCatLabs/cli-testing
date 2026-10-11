/**
 * The second runtime, actually executed: `bun test` cannot run the Vitest suite, so this drives the
 * real exports with plain assertions under Bun.
 *
 *   bun run scripts/smoke.ts
 */
import { strict as assert } from "node:assert"
import {
  compareRuns,
  contractToolSnapshot,
  findLeaks,
  redactTranscript,
  runContracts,
  SUITE_GROUPS,
  scanLeaks,
} from "../src/index.ts"

assert.ok(SUITE_GROUPS.includes("security"))
const empty = { schema: 1 as const, suite: "security", complete: true, observations: [], known: [] }
assert.deepEqual(compareRuns("security", empty, empty), { new: [], fixed: [], cameBack: [], unchanged: [] })
assert.equal(redactTranscript("/synthetic-root/file", ["/synthetic-root"]), "[ROOT]/file")
assert.equal(contractToolSnapshot([]), "[]\n")
assert.equal(typeof runContracts, "function")
assert.deepEqual(findLeaks("ordinary diagnostic"), [])
assert.equal(typeof scanLeaks, "function")
console.log("smoke ok")
