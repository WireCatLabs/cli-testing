import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const printJson = (value) => process.stdout.write(`${value}\n`)

const [observationPath, judgmentPath] = process.argv.slice(2)
assert.ok(observationPath && judgmentPath)
const observationBytes = readFileSync(observationPath)
const judgmentBytes = readFileSync(judgmentPath)
const observation = JSON.parse(observationBytes)
const judgments = JSON.parse(judgmentBytes)
assert.equal(judgments.independent_human_judge, false)
const source = new Map(observation.rows.map((r) => [r.ref, r]))
assert.equal(source.size, observation.rows.length)
assert.equal(judgments.rows.length, source.size)
const seen = new Set()
for (const row of judgments.rows) {
  assert.ok(!seen.has(row.ref))
  seen.add(row.ref)
  const evidence = source.get(row.ref)
  assert.ok(evidence?.found && evidence.fingerprint_matches && evidence.excerpt_matches)
  assert.equal(row.fingerprint, evidence.expected_fingerprint)
  assert.equal(row.excerpt_sha256, evidence.expected_excerpt_sha256)
  assert.ok([0, 1, 2].includes(row.grade))
}
const gradeCounts = (rows) => Object.fromEntries([0, 1, 2].map((n) => [n, rows.filter((r) => r.grade === n).length]))
const sha = (b) => createHash("sha256").update(b).digest("hex")
printJson(
  JSON.stringify(
    {
      private_observation_sha256: sha(observationBytes),
      private_judgments_sha256: sha(judgmentBytes),
      reviewed: seen.size,
      candidates: observation.unique_refs,
      unreviewed: observation.unique_refs - seen.size,
      grades: gradeCounts(judgments.rows),
      by_cohort: Object.fromEntries(
        ["baseline", "added"].map((c) => [c, gradeCounts(judgments.rows.filter((r) => r.cohort === c))]),
      ),
      sample_evidence_cli_calls: observation.calls.length,
      sample_cli_wall_ms: +observation.calls.reduce((s, c) => s + c.wall_ms, 0).toFixed(2),
      original_refs_missing: observation.missing_original_refs,
      current_refs_added: observation.added_current_refs,
      sampled_evidence_unchanged: observation.rows.every((r) => r.fingerprint_matches && r.excerpt_matches),
      pagination_finished: observation.pagination_finished,
      independent_human_judge: false,
      population_precision: null,
      population_recall: null,
      qualification:
        "Single-agent, stratified excerpt review plus one diagnostic. Counts describe reviewed material, not independent accuracy or population estimates. Grade0 means visibly unrelated, grade1 contextual/weak, grade2 directly useful for orientation. No present-state validation.",
    },
    null,
    2,
  ),
)
