import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

const printJson = (value) => process.stdout.write(`${value}\n`)

const [consent, baselinePath, expandedPath, output, binaryPath] = process.argv.slice(2)
assert.equal(consent, "--live-local")
assert.ok(binaryPath, "baseline expanded new-private-output installed-binary are required")
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
const expandedBytes = readFileSync(expandedPath)
const expanded = JSON.parse(expandedBytes)
const binary = realpathSync(binaryPath)
const manifest = JSON.parse(readFileSync(resolve(dirname(binary), "../../package.json"), "utf8"))
assert.equal(manifest.version, "0.84.0")
assert.equal(manifest.dependencies["@wirecat/cli-core"], "0.377.0")
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const seed = "gathering-audit-2026-10-21-v1"
const original = new Map(expanded.runs[0].items.map((i) => [i.ref, i]))
const base = new Set(baseline.runs[0].items.map((i) => i.ref))
const samples = new Map()
for (const membership of [true, false]) {
  const docs = [...original.values()]
    .filter((i) => i.kind === "document" && base.has(i.ref) === membership)
    .sort((a, b) => sha(`${seed}:${a.ref}`).localeCompare(sha(`${seed}:${b.ref}`)))
  for (const item of docs.slice(0, 10)) samples.set(item.ref, "hash_sample_document")
}
for (const item of original.values()) if (item.kind === "message") samples.set(item.ref, "message_census")
for (const item of original.values()) {
  if (item.context === "person-only") samples.set(item.ref, "diagnostic_person_only")
}
// A private case can request previously known counterexamples without publishing their identities.
for (const ref of expanded.request.diagnostic_refs ?? []) {
  assert.ok(original.has(ref))
  samples.set(ref, "diagnostic_case")
}
const fd = openSync(output, "wx", 0o600)
try {
  const scenario = expanded.request
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
    ...(scenario.aliases ?? []).flatMap((s) => ["--alias", s]),
    ...(scenario.contacts ?? []).flatMap((s) => ["--contact", s]),
    "--no-catch-up",
    "--json",
  ]
  const calls = []
  const retrieved = new Map()
  let cursor
  for (let n = 0; n < scenario.max_invocations; n++) {
    const started = performance.now()
    let raw
    try {
      raw = execFileSync(binary, [...args, ...(cursor ? ["--cursor", cursor] : [])], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 60000,
        stdio: ["ignore", "pipe", "pipe"],
      })
    } catch (error) {
      throw new Error(`Memo failed: exit ${error.status ?? "unknown"}; captured output withheld`)
    }
    const envelope = JSON.parse(raw)
    const value = envelope.item
    assert.ok(value && envelope.meta)
    calls.push({
      wall_ms: +(performance.now() - started).toFixed(2),
      usage: value.usage,
      complete: value.complete,
      stopped: value.stopped,
      items: value.items.length,
      stdout_bytes: Buffer.byteLength(raw),
      run_id: envelope.meta.run_id,
    })
    for (const item of value.items) retrieved.set(item.ref, item)
    cursor = value.checkpoint
    if (!cursor) break
  }
  const rows = [...samples].map(([ref, selection]) => {
    const item = retrieved.get(ref)
    const old = original.get(ref)
    return {
      ref,
      selection,
      cohort: base.has(ref) ? "baseline" : "added",
      kind: old.kind,
      expected_fingerprint: old.fingerprint,
      expected_excerpt_sha256: old.text_sha256,
      found: !!item,
      fingerprint_matches: item?.fingerprint === old.fingerprint,
      excerpt_matches: !!item && sha(item.text ?? "") === old.text_sha256,
      context: item?.context,
      text_truncated: item?.text_truncated,
      excerpt_bytes: item ? Buffer.byteLength(item.text ?? "") : 0,
    }
  })
  writeFileSync(
    fd,
    `${JSON.stringify(
      {
        seed,
        measured_at: new Date().toISOString(),
        input_sha256: sha(expandedBytes),
        runner_sha256: sha(readFileSync(new URL(import.meta.url))),
        memo: manifest.version,
        core: manifest.dependencies["@wirecat/cli-core"],
        calls,
        pagination_finished: !cursor,
        unique_refs: retrieved.size,
        missing_original_refs: [...original.keys()].filter((ref) => !retrieved.has(ref)).length,
        added_current_refs: [...retrieved.keys()].filter((ref) => !original.has(ref)).length,
        rows,
        labels: "pending_single_agent_excerpt_review",
        source_bodies_saved: false,
      },
      null,
      2,
    )}\n`,
  )
  for (const row of rows) {
    const item = retrieved.get(row.ref)
    printJson(
      JSON.stringify({
        ...row,
        excerpt: item?.text,
        around: (item?.around ?? []).slice(0, 2).map((i) => ({ ref: i.ref, excerpt: i.text?.slice(0, 300) })),
      }),
    )
  }
} finally {
  closeSync(fd)
}
