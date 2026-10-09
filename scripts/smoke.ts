/**
 * The second runtime, actually executed: `bun test` cannot run the Vitest suite, so this drives the
 * real exports with plain assertions under Bun.
 *
 *   bun run scripts/smoke.ts
 */
import { strict as assert } from "node:assert"
import { createTaskService } from "../src/index.ts"
import { memoryTaskStore } from "../src/testing/index.ts"

const tasks = createTaskService({ store: memoryTaskStore() })
const input = {
  source: "msg:1",
  sourceKind: "message",
  account: "tg:1",
  group: "chat:1",
  kind: "question",
  origin: "rule",
} as const
const { task } = await tasks.add(input)
assert.equal((await tasks.add(input)).created, false)
await tasks.close(task.id, { as: "dismissed", by: "owner", reason: "no-reply-needed" })
assert.equal((await tasks.add(input)).task.state, "dismissed")
assert.equal((await tasks.stats())[0]?.open, 0)
console.log("smoke: ok")
