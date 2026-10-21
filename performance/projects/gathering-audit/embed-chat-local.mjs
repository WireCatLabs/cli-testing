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
assert.ok(scenario.profile && scenario.chat)
const fd = openSync(output, "wx", 0o600)
try {
  const args = [
    scenario.profile,
    "conversations",
    "embed",
    `--chat=${scenario.chat}`,
    "--provider",
    "local",
    "--model",
    scenario.model,
    "--threads",
    "2",
    "--max-chunks",
    "300",
    "--json",
    "--offline",
  ]
  const start = performance.now()
  const child = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 300000 })
  let answer
  try {
    answer = JSON.parse(child.stdout)
  } catch {
    answer = {}
  }
  const report = {
    args,
    case_sha256: createHash("sha256").update(bytes).digest("hex"),
    runner_sha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    exit: child.status,
    signal: child.signal,
    wall_ms: +(performance.now() - start).toFixed(2),
    answer,
    stderr_bytes: Buffer.byteLength(child.stderr ?? ""),
  }
  writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report)}\n`)
} finally {
  closeSync(fd)
}
