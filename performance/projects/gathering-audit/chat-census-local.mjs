import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"

const [consent, casePath, output, binary] = process.argv.slice(2)
assert.equal(consent, "--live-local")
assert.ok(binary)
const source = readFileSync(casePath)
const scenario = JSON.parse(source)
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const calls = []
const messages = new Map()
const fd = openSync(output, "wx", 0o600)
const read = (after, before) => {
  assert.ok(calls.length < 64, "census command budget exhausted")
  const query = `chat:"${scenario.scope.chat}" date:["${new Date(after).toISOString()}" TO "${new Date(before).toISOString()}"]`
  const start = performance.now()
  let raw
  try {
    raw = execFileSync(
      binary,
      [
        ...(scenario.max_profile ? [scenario.max_profile] : []),
        "search",
        "messages",
        query,
        "--exact",
        "--limit",
        "100",
        "--timezone",
        "UTC",
        "--json",
        ...(scenario.max_profile ? ["--backend", "archive", "--offline", "--context", "0"] : []),
      ],
      {
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
  } catch (error) {
    throw new Error(`census failed ${error.status ?? "unknown"}; output withheld`)
  }
  const response = JSON.parse(raw)
  calls.push({
    after,
    before,
    wall_ms: +(performance.now() - start).toFixed(2),
    items: response.items.length,
    has_more: response.page.has_more,
    run_id: response.meta.run_id,
  })
  if (response.page.has_more) {
    assert.ok(before - after > 1, "too many messages at one timestamp")
    const middle = Math.floor((after + before) / 2)
    read(after, middle)
    read(middle + 1, before)
  } else
    for (const item of response.items) {
      assert.ok(item.ref.startsWith(`msg:${scenario.scope.expected_account.replace(":", "/")}/${scenario.scope.chat}/`))
      messages.set(item.ref, {
        ref: item.ref,
        timestamp: item.timestamp,
        excerpt_sha256: sha(item.excerpt ?? ""),
        excerpt_bytes: Buffer.byteLength(item.excerpt ?? ""),
      })
    }
}
try {
  read(Date.parse(scenario.scope.since), Date.parse(scenario.scope.before) - 1)
  writeFileSync(
    fd,
    `${JSON.stringify(
      {
        created_at: new Date().toISOString(),
        case_sha256: sha(source),
        runner_sha256: sha(readFileSync(new URL(import.meta.url))),
        calls,
        messages: [...messages.values()],
        unique_messages: messages.size,
        remote_completeness: "unknown",
        raw_text_saved: false,
      },
      null,
      2,
    )}\n`,
  )
  process.stdout.write(
    `${JSON.stringify({
      unique_messages: messages.size,
      cli_calls: calls.length,
      wall_ms: +calls.reduce((s, c) => s + c.wall_ms, 0).toFixed(2),
      remote_completeness: "unknown",
    })}\n`,
  )
} finally {
  closeSync(fd)
}
