import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"

const [consent, casePath, output, binary] = process.argv.slice(2)
assert.equal(consent, "--live-local")
assert.ok(binary)
const bytes = readFileSync(casePath)
const scenario = JSON.parse(bytes)
assert.ok(scenario.max_profile && scenario.chats.length <= 3)
const fd = openSync(output, "wx", 0o600)
try {
  const rows = []
  for (const chat of scenario.chats) {
    const args = [
      scenario.max_profile,
      "messages",
      "sync",
      chat.id,
      "--since-time",
      scenario.since,
      "--limit",
      String(chat.limit),
      "--page-size",
      "30",
      "--pause",
      "5s",
      "--no-catch-up",
      "--trace",
      "--json",
    ]
    const start = performance.now()
    const child = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 240000 })
    const events = (child.stderr ?? "").split("\n").flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
    let value
    try {
      value = JSON.parse(child.stdout)
    } catch {
      value = {}
    }
    const summary = value.item ?? {}
    const numeric = Object.fromEntries(
      Object.entries(summary).filter(([, v]) => typeof v === "number" || typeof v === "boolean" || v === null),
    )
    const requestEvents = events.filter((e) => e.event === "request")
    const responseEvents = events.filter((e) => e.event === "response")
    const row = {
      chat: chat.id,
      args,
      exit_code: child.status,
      signal: child.signal,
      wall_ms: +(performance.now() - start).toFixed(2),
      summary_keys: Object.keys(summary),
      summary_numbers: numeric,
      requests: requestEvents.length,
      responses: responseEvents.length,
      request_operations: requestEvents.map((e) => e.operation ?? e.method ?? e.opcode ?? null),
      meta: value.meta ?? null,
      source_bodies_saved: false,
      errors: events.filter((e) => e.error).map((e) => ({ code: e.error?.code, reason: e.error?.reason })),
    }
    rows.push(row)
    process.stdout.write(`${JSON.stringify(row)}\n`)
    if (child.status !== 0) break
  }
  writeFileSync(
    fd,
    `${JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        case_sha256: createHash("sha256").update(bytes).digest("hex"),
        runner_sha256: createHash("sha256")
          .update(readFileSync(new URL(import.meta.url)))
          .digest("hex"),
        rows,
        qualification:
          "Bounded native read/import. Request count covers emitted trace request events, not independently observed network packets.",
      },
      null,
      2,
    )}\n`,
  )
} finally {
  closeSync(fd)
}
