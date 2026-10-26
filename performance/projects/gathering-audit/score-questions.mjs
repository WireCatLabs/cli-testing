import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const paths = process.argv.slice(2)
assert.equal(paths.length, 4, "score-questions.mjs PRIVATE_CASE LEXICAL MEANING JUDGMENTS")
const bytes = paths.map((path) => readFileSync(path))
const [scenario, lexical, meaning, judgments] = bytes.map((b) => JSON.parse(b))
assert.equal(judgments.independent_human_judge, false)
const n = scenario.questions.length
const k = scenario.k
assert.ok(n > 0 && k > 0)
const round = (value) => +value.toFixed(4)
const scores = []
for (const method of ["literal_question", "curated_keywords", "lexical_discovery", "hybrid_e5"]) {
  const results = []
  for (const [index, question] of scenario.questions.entries()) {
    const run =
      method === "hybrid_e5"
        ? meaning.runs.find((r) => r.question === question.id)
        : lexical.runs.find((r) => r.question === question.id && r.method === method)
    assert.ok(run)
    const grades = run.rows.map((hit) => {
      const label = judgments.rows.find((r) => r.method === method && r.question === question.id && r.rank === hit.rank)
      assert.ok(label && [0, 1, 2].includes(label.grade))
      if (method === "hybrid_e5") {
        assert.equal(label.conversation, hit.conversation)
        assert.equal(label.chunk_text_sha256, hit.chunk_text_sha256)
      } else {
        assert.equal(label.ref, hit.ref)
        assert.equal(label.excerpt_sha256, hit.excerpt_sha256)
      }
      return label.grade
    })
    const anchorRanks =
      method === "hybrid_e5"
        ? run.rows.filter((r) => r.chunk_anchor_ids.length > 0).map((r) => r.rank)
        : run.rows.filter((r) => question.anchors.some((a) => r.ref.endsWith(`/${a}`))).map((r) => r.rank)
    const anchored = new Set(
      method === "hybrid_e5"
        ? run.rows.flatMap((r) => r.chunk_anchor_ids)
        : question.anchors.filter((a) => run.rows.some((r) => r.ref.endsWith(`/${a}`))),
    )
    results.push({
      question_index: index,
      returned: run.rows.length,
      supported_slots: grades.filter((g) => g === 2).length,
      contextual_slots: grades.filter((g) => g === 1).length,
      off_question_slots: grades.filter((g) => g === 0).length,
      first_supported_rank: grades.indexOf(2) < 0 ? null : grades.indexOf(2) + 1,
      first_known_anchor_rank: anchorRanks[0] ?? null,
      all_known_anchors: question.anchors.every((a) => anchored.has(a)),
      returned_text_bytes: run.rows.reduce((s, r) => s + (r.chunk_text_bytes ?? r.excerpt_bytes), 0),
    })
  }
  const searchCalls =
    method === "hybrid_e5"
      ? meaning.calls.filter((c) => c.operation === "search")
      : lexical.runs.filter((r) => r.method === method)
  scores.push({
    method,
    retrieval_unit: method === "hybrid_e5" ? "conversation_chunk" : "message_excerpt",
    questions: n,
    k,
    returned_slots: results.reduce((s, r) => s + r.returned, 0),
    supported_slots: results.reduce((s, r) => s + r.supported_slots, 0),
    contextual_slots: results.reduce((s, r) => s + r.contextual_slots, 0),
    off_question_slots: results.reduce((s, r) => s + r.off_question_slots, 0),
    empty_slots: n * k - results.reduce((s, r) => s + r.returned, 0),
    provisional_supported_precision_at_k: round(results.reduce((s, r) => s + r.supported_slots, 0) / (n * k)),
    provisional_answer_hit_at_k: round(results.filter((r) => r.supported_slots > 0).length / n),
    provisional_answer_mrr: round(
      results.reduce((s, r) => s + (r.first_supported_rank ? 1 / r.first_supported_rank : 0), 0) / n,
    ),
    known_anchor_hit_at_k: round(results.filter((r) => r.first_known_anchor_rank !== null).length / n),
    known_anchor_mrr: round(
      results.reduce((s, r) => s + (r.first_known_anchor_rank ? 1 / r.first_known_anchor_rank : 0), 0) / n,
    ),
    all_known_anchor_coverage: round(results.filter((r) => r.all_known_anchors).length / n),
    search_cli_calls: searchCalls.length,
    search_wall_ms: round(searchCalls.reduce((s, r) => s + r.wall_ms, 0)),
    returned_text_bytes: results.reduce((s, r) => s + r.returned_text_bytes, 0),
  })
}
process.stdout.write(
  `${JSON.stringify(
    {
      hashes: bytes.map((b) => createHash("sha256").update(b).digest("hex")),
      scores,
      expansion_cli_calls: meaning.calls.filter((c) => c.operation === "expand").length,
      expansion_wall_ms: round(
        meaning.calls.filter((c) => c.operation === "expand").reduce((s, r) => s + r.wall_ms, 0),
      ),
      distinct_expanded_conversations: meaning.expanded_conversations,
      meaning_tagged_hits: meaning.runs.flatMap((r) => r.rows).filter((r) => r.by.includes("meaning")).length,
      stale_meaning_hits: meaning.runs.flatMap((r) => r.rows).filter((r) => r.stale).length,
      qualification:
        "Six preselected known-anchor questions, provisional unblinded single-agent labels. Different retrieval units and byte budgets; not independent quality, population recall or a controlled estimate of embedding-only benefit.",
    },
    null,
    2,
  )}\n`,
)
