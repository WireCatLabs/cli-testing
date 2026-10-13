import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [dist, runsDir, perDayArg = "200"] = process.argv.slice(2)
const { startRun } = await import(pathToFileURL(join(resolve(dist), "cli/runs/run.js")).href)

let seed = 42
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
const pick = (list) => list[Math.floor(random() * list.length)]

const COMMANDS = [
  "chats list",
  "messages list",
  "messages send",
  "messages search",
  "messages download",
  "store fetch",
  "mcp tool",
]
const OPERATIONS = ["chats.list", "messages.list", "messages.send", "messages.search", "messages.download", "users.get"]
const CODES = ["timeout", "rate_limited", "provider_error", "not_found", "network_error"]
const perDay = Number(perDayArg)
const end = Date.parse("2026-10-13T00:00:00Z")
const DAY = 24 * 60 * 60 * 1000

for (let d = 29; d >= 0; d--) {
  for (let i = 0; i < perDay; i++) {
    let at = end - d * DAY + Math.floor((i / perDay) * DAY)
    const now = () => {
      at += 37
      return new Date(at)
    }
    const run = startRun({
      runsDir,
      command: pick(COMMANDS),
      profile: pick(["work", "personal"]),
      cliVersion: "1.0.0",
      now,
      keepDays: 31,
    })
    const events = 5 + Math.floor(random() * 55)
    for (let e = 0; e < events; e++) {
      const operation = pick(OPERATIONS)
      const seq = e
      run.logger.info({ event: "request", operation, opcode: 64, seq, ids: { chat: String(1000 + e) } })
      const failed = random() < 0.03
      run.logger.info({
        event: "response",
        operation,
        opcode: 64,
        seq,
        durationMs: Math.floor(random() * 400),
        bytes: Math.floor(random() * 20000),
        counts: { messages: Math.floor(random() * 50) },
        outcome: failed ? "error" : "ok",
        ...(failed ? { errorCode: pick(CODES) } : {}),
      })
    }
    const failed = random() < 0.1
    await run.finish(failed ? "failed" : "success", { requests: events, ...(failed ? { errorCode: pick(CODES) } : {}) })
  }
}
process.stdout.write(`generated ${30 * perDay} runs in ${runsDir}` + "\n")
