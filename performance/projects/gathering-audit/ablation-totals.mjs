import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const [input] = process.argv.slice(2)
const bytes = readFileSync(input)
const report = JSON.parse(bytes)
assert.equal(report.memo, "0.84.0")
assert.equal(report.core, "0.377.0")
const baseline = report.variants.find((v) => v.variant_index === 0)
assert.ok(baseline)
const base = new Set(baseline.items.map((i) => i.ref))
const variants = [...report.variants]
  .sort((a, b) => a.variant_index - b.variant_index)
  .map((v) => {
    const refs = new Set(v.items.map((i) => i.ref))
    return {
      variant: v.variant_index,
      direct_refs: refs.size,
      message_refs: v.items.filter((i) => i.kind === "message").length,
      document_refs: v.items.filter((i) => i.kind === "document").length,
      aliases: v.args.filter((x) => x === "--alias").length,
      contacts: v.args.filter((x) => x === "--contact").length,
      added_over_baseline: [...refs].filter((ref) => !base.has(ref)).length,
      lost_from_baseline: [...base].filter((ref) => !refs.has(ref)).length,
      cli_calls: v.calls.length,
      wall_ms: +v.calls.reduce((sum, c) => sum + c.wall_ms, 0).toFixed(2),
      local_reads: v.calls.reduce((sum, c) => sum + c.usage.reads, 0),
      oversized_refs: new Set(v.calls.flatMap((c) => c.oversized)).size,
      pagination_finished: v.pagination_finished,
    }
  })
const observed = new Map()
let changed = 0
for (const variant of report.variants)
  for (const item of variant.items) {
    if (observed.has(item.ref) && observed.get(item.ref) !== item.fingerprint) changed++
    observed.set(item.ref, item.fingerprint)
  }
process.stdout.write(
  `${JSON.stringify(
    {
      private_input_sha256: createHash("sha256").update(bytes).digest("hex"),
      memo: report.memo,
      core: report.core,
      variants,
      executed_order: report.variants.map((v) => v.variant_index),
      cli_calls: variants.reduce((s, v) => s + v.cli_calls, 0),
      evidence_wall_ms: +variants.reduce((s, v) => s + v.wall_ms, 0).toFixed(2),
      retrieved_source_fingerprint_changes: changed,
      provider_http_calls_measured: null,
      app_model_calls: 0,
      qualification:
        "One randomized-order round against a mutable local archive and fixed past window. Counts measure candidate contribution, not relevance, recall, causal production latency or a blind benchmark.",
    },
    null,
    2,
  )}\n`,
)
