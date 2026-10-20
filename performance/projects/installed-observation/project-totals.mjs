import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { lstatSync, readFileSync } from "node:fs"

const [input] = process.argv.slice(2)
assert.ok(input, "project-totals.mjs PRIVATE_MEASUREMENT_JSON")
const stat = lstatSync(input)
assert.ok(stat.isFile() && !stat.isSymbolicLink(), "measurement must be an ordinary file")
assert.ok(stat.size <= 4 * 1024 * 1024, "measurement exceeds 4 MiB")
const bytes = readFileSync(input)
const report = JSON.parse(bytes)
for (const version of [report.memo, report.dependencies?.core, report.dependencies?.base])
  assert.match(version, /^\d+\.\d+\.\d+$/)
assert.match(report.node, /^v\d+\.\d+\.\d+$/)
assert.ok(report.llm_tokens === null || (Number.isSafeInteger(report.llm_tokens) && report.llm_tokens >= 0))
assert.ok(Array.isArray(report.runs) && report.runs.length === 3)
const sum = (values, select) => values.reduce((total, value) => total + select(value), 0)
const number = (value) => {
  assert.ok(Number.isFinite(value) && value >= 0)
  return value
}
const phases = report.runs.map((run, index) => {
  const direct = new Set(run.items.map((item) => item.ref))
  const around = new Set(run.items.flatMap((item) => item.around.map((one) => one.ref)))
  const excerpts = new Map(
    run.items.flatMap((item) => item.around.map((one) => [`${one.ref}:${one.text_sha256}`, one])),
  )
  assert.equal(direct.size, run.unique_refs)
  return {
    phase: ["index_as_stored", "default_catch_up", "default_repeat"][index],
    invocations: run.pages.length,
    wall_ms: number(run.wall_ms),
    direct_references: direct.size,
    surrounding_references: around.size,
    combined_references: new Set([...direct, ...around]).size,
    direct_by_kind: Object.fromEntries(
      ["message", "document", "meeting"].map((kind) => [kind, run.items.filter((item) => item.kind === kind).length]),
    ),
    direct_excerpt_bytes: sum(run.items, (item) => number(item.text_utf8_bytes)),
    distinct_surrounding_excerpt_bytes: sum([...excerpts.values()], (item) => number(item.text_utf8_bytes)),
    distinct_surrounding_excerpts: excerpts.size,
    charged_read_budget_bytes: sum(run.pages, (page) => number(page.usage.read_bytes)),
    charged_surrounding_budget_bytes: sum(run.pages, (page) => number(page.usage.around_bytes)),
    pagination_finished: run.finished_pagination === true,
    no_progress_stop: run.stagnation_detected === true,
    oversized_references: new Set(run.pages.flatMap((page) => (page.oversized ?? []).map((item) => item.ref))).size,
    resolved_sources: run.pages[0].scope.sources.length,
  }
})
process.stdout.write(
  `${JSON.stringify(
    {
      memo: report.memo,
      core: report.dependencies.core,
      base: report.dependencies.base,
      node: report.node,
      private_measurement_sha256: createHash("sha256").update(bytes).digest("hex"),
      phases,
      app_model_calls: 0,
      model_tokens: report.llm_tokens,
      qualified_as:
        "Mutable local archive observation; not complete remote coverage, semantic recall, model quality, agent time, actual I/O or cold-cache speedup.",
    },
    null,
    2,
  )}\n`,
)
