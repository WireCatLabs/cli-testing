import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const printJson = (value) => process.stdout.write(`${value}\n`)

const dir = mkdtempSync(join(tmpdir(), "gathering-audit-"))
const sentinel = "PRIVATE_QUERY_OR_SOURCE_BODY_NEVER_PUBLISH"
const item = {
  ref: "document:1",
  kind: "document",
  context: "person-only",
  lanes: ["p"],
  text_sha256: "synthetic",
  text_truncated: true,
  around_issue: "read-bytes",
  around: [],
}
const page = {
  wall_ms: 10,
  stdout_utf8_bytes: 20,
  usage: { elapsed_ms: 6, reads: 2, read_bytes: 3, around_bytes: 1 },
  units: [{ state: "done", secret: sentinel }],
  completeness: "unknown",
  oversized: [{ ref: "document:2" }],
  unread_sources: [{ source: sentinel }],
  matched_again: [{ ref: "document:1", lanes: ["project"] }],
  scope: { sources: [{ secret: sentinel }] },
  lanes: [
    { id: "p", kinds: ["person"], query: sentinel },
    { id: "project", kinds: ["project"], query: sentinel },
  ],
}
const run = {
  name: sentinel,
  items: [item],
  pages: [page],
  unique_refs: 1,
  wall_ms: 10,
  finished_pagination: true,
  ref_set_sha256: "hash",
  content_set_sha256: "hash",
}
const report = {
  memo: "0.84.0",
  dependencies: { core: "0.377.0", base: "0.47.4" },
  node: "v24.19.0",
  started_at: "2026-01-01T00:00:00Z",
  finished_at: "2026-01-01T00:00:01Z",
  remote_fetches_requested: 0,
  request: { before_time: "2025-12-31T23:00:00Z", project: sentinel },
  runs: [run, run, run],
}
const a = join(dir, "a.json")
const b = join(dir, "b.json")
const save = (path, value) => writeFileSync(path, JSON.stringify(value))
save(a, report)
save(b, report)
const script = fileURLToPath(new URL("./analyze.mjs", import.meta.url))
const invoke = () => spawnSync(process.execPath, [script, a, b], { encoding: "utf8" })
const output = invoke()
assert.equal(output.status, 0, output.stderr)
assert.ok(!output.stdout.includes(sentinel))
const result = JSON.parse(output.stdout)
assert.equal(result.baseline.evidence_cli_calls, 3)
assert.equal(result.baseline.phases[0].local_reader_calls, 2)
assert.equal(result.baseline.phases[0].oversized_not_returned, 1)
assert.equal(result.baseline.context_promotions_after_continuation, 1)
assert.deepEqual(result.baseline.reconciled_contexts, { project: 1 })
assert.equal(result.comparison.jaccard, 1)
const malformed = structuredClone(report)
malformed.memo = sentinel
save(b, malformed)
assert.notEqual(invoke().status, 0)
const duplicate = structuredClone(report)
duplicate.runs[0].items.push(item)
save(b, duplicate)
assert.equal(JSON.parse(invoke().stdout).expanded.phases[0].duplicate_direct_refs, 1)
printJson(
  JSON.stringify({
    privacy_sentinel_omitted: true,
    lane_promotion_reconciled: true,
    oversized_exclusion_counted: true,
    known_costs_checked: true,
    bad_version_refused: true,
    duplicate_ref_detected: true,
    real_archive_opened: false,
  }),
)
