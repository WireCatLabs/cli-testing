import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = mkdtempSync(join(tmpdir(), "question-score-"))
const secret = "PRIVATE_QUERY_NEVER_EXPORT"
const scenario = { k: 2, questions: [{ id: secret, query: secret, anchors: ["1", "2"] }] }
const lexical = {
  runs: ["literal_question", "curated_keywords", "lexical_discovery"].map((method) => ({
    question: secret,
    method,
    wall_ms: 10,
    rows:
      method === "literal_question"
        ? []
        : [{ rank: 1, ref: "msg:sample/1/1/1", excerpt_sha256: "h", excerpt_bytes: 10 }],
  })),
}
const meaning = {
  calls: [
    { operation: "search", wall_ms: 20 },
    { operation: "expand", wall_ms: 5 },
  ],
  expanded_conversations: 1,
  runs: [
    {
      question: secret,
      rows: [
        {
          rank: 1,
          conversation: "7",
          chunk_text_sha256: "h",
          chunk_text_bytes: 20,
          chunk_anchor_ids: ["1", "2"],
          by: ["meaning"],
          stale: false,
        },
      ],
    },
  ],
}
const judgments = {
  independent_human_judge: false,
  rows: [
    ...["curated_keywords", "lexical_discovery"].map((method) => ({
      method,
      question: secret,
      rank: 1,
      ref: "msg:sample/1/1/1",
      excerpt_sha256: "h",
      grade: 1,
    })),
    { method: "hybrid_e5", question: secret, rank: 1, conversation: "7", chunk_text_sha256: "h", grade: 2 },
  ],
}
const inputs = [scenario, lexical, meaning, judgments].map((x, i) => {
  const path = join(dir, `${i}.json`)
  writeFileSync(path, JSON.stringify(x))
  return path
})
const script = fileURLToPath(new URL("./score-questions.mjs", import.meta.url))
const invoke = () => spawnSync(process.execPath, [script, ...inputs], { encoding: "utf8" })
const out = invoke()
assert.equal(out.status, 0, out.stderr)
assert.ok(!out.stdout.includes(secret))
const result = JSON.parse(out.stdout)
assert.ok(result.scores.every((score) => !("per_question" in score)))
assert.equal(result.scores[1].provisional_answer_hit_at_k, 0)
assert.equal(result.scores[1].all_known_anchor_coverage, 0)
assert.equal(result.scores[3].provisional_answer_hit_at_k, 1)
assert.equal(result.scores[3].provisional_supported_precision_at_k, 0.5)
assert.equal(result.scores[3].all_known_anchor_coverage, 1)
judgments.rows.at(-1).chunk_text_sha256 = "changed"
writeFileSync(inputs[3], JSON.stringify(judgments))
assert.notEqual(invoke().status, 0)
process.stdout.write(
  `${JSON.stringify({
    pair_required: true,
    request_not_answer: true,
    stale_labels_refused: true,
    query_not_exported: true,
    denominator_includes_empty_slots: true,
    owner_archive_opened: false,
  })}\n`,
)
