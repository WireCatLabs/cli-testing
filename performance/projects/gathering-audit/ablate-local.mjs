import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

const [consent, input, output, binaryPath] = process.argv.slice(2)
assert.equal(consent, "--live-local")
assert.ok(binaryPath)
const bytes = readFileSync(input)
const scenario = JSON.parse(bytes)
assert.ok(Array.isArray(scenario.variants) && scenario.variants.length <= 10)
const binary = realpathSync(binaryPath)
const manifest = JSON.parse(readFileSync(resolve(dirname(binary), "../../package.json"), "utf8"))
assert.equal(manifest.version, "0.84.0")
assert.equal(manifest.dependencies["@wirecat/cli-core"], "0.377.0")
const sha = (x) => createHash("sha256").update(x).digest("hex")
const order = scenario.variants
  .map((variant, index) => ({ variant, index }))
  .sort((a, b) => sha(`${scenario.seed}:${a.index}`).localeCompare(sha(`${scenario.seed}:${b.index}`)))
const fd = openSync(output, "wx", 0o600)
try {
  const report = {
    started_at: new Date().toISOString(),
    case_sha256: sha(bytes),
    runner_sha256: sha(readFileSync(new URL(import.meta.url))),
    memo: manifest.version,
    core: manifest.dependencies["@wirecat/cli-core"],
    variants: [],
    source_bodies_saved: false,
    provider_http_calls_measured: null,
  }
  for (const { variant, index } of order) {
    const args = [
      "projects",
      "evidence",
      scenario.project,
      "--source",
      scenario.source,
      "--since-time",
      scenario.since_time,
      "--before-time",
      scenario.before_time,
      "--limit",
      String(scenario.limit),
      "--max-pages",
      String(scenario.max_pages),
      ...(variant.aliases ?? []).flatMap((s) => ["--alias", s]),
      ...(variant.contacts ?? []).flatMap((s) => ["--contact", s]),
      "--no-catch-up",
      "--json",
    ]
    const items = new Map()
    const calls = []
    let cursor
    for (let n = 0; n < scenario.max_invocations; n++) {
      const start = performance.now()
      let raw
      try {
        raw = execFileSync(binary, [...args, ...(cursor ? ["--cursor", cursor] : [])], {
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
          timeout: 60000,
          stdio: ["ignore", "pipe", "pipe"],
        })
      } catch (error) {
        throw new Error(`Memo failed: ${error.status ?? "unknown"}; source output withheld`)
      }
      const envelope = JSON.parse(raw)
      const value = envelope.item
      calls.push({
        wall_ms: +(performance.now() - start).toFixed(2),
        usage: value.usage,
        run_id: envelope.meta.run_id,
        complete: value.complete,
        completeness: value.completeness,
        stdout_bytes: Buffer.byteLength(raw),
        source_count: value.scope.sources.length,
        oversized: value.oversized?.map((i) => i.ref) ?? [],
      })
      for (const item of value.items)
        items.set(item.ref, {
          ref: item.ref,
          fingerprint: item.fingerprint,
          excerpt_sha256: sha(item.text ?? ""),
          kind: item.kind,
        })
      cursor = value.checkpoint
      if (!cursor) break
    }
    const result = { variant_index: index, args, calls, pagination_finished: !cursor, items: [...items.values()] }
    report.variants.push(result)
    process.stdout.write(`variant ${index}: ${items.size} refs, ${calls.length} commands\n`)
  }
  report.finished_at = new Date().toISOString()
  writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`)
} finally {
  closeSync(fd)
}
