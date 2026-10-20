import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const printJson = (value) => process.stdout.write(`${value}\n`)

const paths = process.argv.slice(2)
assert.equal(paths.length, 2, "analyze.mjs PRIVATE_BASELINE PRIVATE_EXPANDED")
const sum = (rows, fn) => rows.reduce((s, row) => s + fn(row), 0)
const round = (n) => +n.toFixed(4)
const count = (rows, fn) =>
  Object.fromEntries([...new Set(rows.map(fn))].sort().map((k) => [k, rows.filter((r) => fn(r) === k).length]))
const sha = (x) => createHash("sha256").update(x).digest("hex")
const reports = paths.map((path) => {
  const bytes = readFileSync(path)
  assert.ok(bytes.length <= 4 * 1024 * 1024)
  const r = JSON.parse(bytes)
  assert.equal(r.runs.length, 3)
  for (const version of [r.memo, r.dependencies.core, r.dependencies.base]) assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.match(r.node, /^v\d+\.\d+\.\d+$/)
  return { r, digest: sha(bytes) }
})
const details = reports.map(({ r, digest }) => {
  const phases = r.runs.map((phase) => {
    const { items, pages } = phase
    for (const item of items) {
      assert.ok(["message", "document", "meeting", "mail"].includes(item.kind))
      if (item.kind === "message")
        assert.ok(
          ["max", "telegram", "whatsapp", "chat", "google-drive"].includes(item.ref.split(":")[1].split("/")[0]),
        )
      assert.ok(item.around_issue === null || item.around_issue === "read-bytes")
    }
    for (const page of pages) {
      assert.ok(["unknown", "complete", "partial"].includes(page.completeness))
      for (const unit of page.units)
        assert.ok(
          ["done", "unavailable", "failed", "read-limited", "pending", "ready", "active", "partial"].includes(
            unit.state,
          ),
        )
    }
    assert.equal(new Set(items.map((i) => i.ref)).size, phase.unique_refs)
    const direct = new Set(items.map((i) => i.ref))
    const around = new Set(items.flatMap((i) => i.around.map((a) => a.ref)))
    const units = pages.at(-1).units
    const oversized = new Set(pages.flatMap((p) => p.oversized.map((i) => i.ref)))
    const overlaps = [...oversized].filter((ref) => direct.has(ref)).length
    return {
      phase: ["index_as_is", "default_first", "default_repeat"][r.runs.indexOf(phase)],
      evidence_cli_calls: pages.length,
      wall_ms: phase.wall_ms,
      per_call_wall_ms: pages.map((p) => p.wall_ms),
      app_reported_service_ms: sum(pages, (p) => p.usage.elapsed_ms),
      process_and_other_ms: round(phase.wall_ms - sum(pages, (p) => p.usage.elapsed_ms)),
      local_reader_calls: sum(pages, (p) => p.usage.reads),
      charged_primary_bytes: sum(pages, (p) => p.usage.read_bytes),
      charged_around_bytes: sum(pages, (p) => p.usage.around_bytes),
      cli_json_bytes: sum(pages, (p) => p.stdout_utf8_bytes),
      direct_refs: direct.size,
      around_refs: around.size,
      around_only_refs: [...around].filter((ref) => !direct.has(ref)).length,
      combined_refs: new Set([...direct, ...around]).size,
      kinds: count(items, (i) => i.kind),
      message_providers: count(
        items.filter((i) => i.kind === "message"),
        (i) => i.ref.split(":")[1].split("/")[0],
      ),
      truncated: items.filter((i) => i.text_truncated).length,
      truncated_fraction: round(items.filter((i) => i.text_truncated).length / items.length),
      around_issues: count(
        items.filter((i) => i.around_issue),
        (i) => i.around_issue,
      ),
      around_issue_items: items.filter((i) => i.around_issue).length,
      oversized_refs: oversized.size,
      oversized_also_returned: overlaps,
      oversized_not_returned: oversized.size - overlaps,
      unit_states: count(units, (i) => i.state),
      resolved_sources: pages[0].scope.sources.length,
      unread_source_count: new Set(pages.flatMap((p) => p.unread_sources.map((i) => i.source))).size,
      pagination_finished: phase.finished_pagination,
      archive_completeness: pages.at(-1).completeness,
      duplicate_direct_refs: items.length - direct.size,
      excerpt_hashes_unique: new Set(items.map((i) => i.text_sha256)).size,
      reference_set_sha256: phase.ref_set_sha256,
      content_set_sha256: phase.content_set_sha256,
    }
  })
  const first = phases[0]
  const direct = r.runs[0].items
  const lanes = r.runs[0].pages[0].lanes.map((lane, index) => {
    for (const kind of lane.kinds)
      assert.ok(["project", "key", "alias", "keyword", "person", "linked-chat"].includes(kind))
    const found = new Set(direct.filter((i) => i.lanes.includes(lane.id)).map((i) => i.ref))
    for (const p of r.runs[0].pages)
      for (const i of p.matched_again ?? []) if (i.lanes.includes(lane.id)) found.add(i.ref)
    return {
      lane: `l${index + 1}`,
      kinds: lane.kinds,
      observed_refs: found.size,
      qualification: "Returned and matched-again metadata, not a rerun without this lane",
    }
  })
  const laneKinds = new Map(r.runs[0].pages[0].lanes.map((lane) => [lane.id, lane.kinds]))
  const effective = new Map(direct.map((item) => [item.ref, new Set(item.lanes)]))
  for (const page of r.runs[0].pages)
    for (const item of page.matched_again ?? []) {
      for (const lane of item.lanes) effective.get(item.ref)?.add(lane)
    }
  const finalContext = (item) => {
    const kinds = [...effective.get(item.ref)].flatMap((lane) => laneKinds.get(lane) ?? [])
    return kinds.some((kind) => kind !== "person" && kind !== "linked-chat")
      ? "project"
      : kinds.includes("linked-chat")
        ? "linked-chat"
        : "person-only"
  }
  return {
    first_emission_contexts: count(direct, (item) => item.context),
    reconciled_contexts: count(direct, finalContext),
    context_promotions_after_continuation: direct.filter((item) => item.context !== finalContext(item)).length,
    private_input_sha256: digest,
    versions: { memo: r.memo, ...r.dependencies, node: r.node },
    scope: "private-case identifiers and source bodies omitted",
    phases,
    evidence_cli_calls: sum(phases, (p) => p.evidence_cli_calls),
    context_cli_calls: 2,
    measured_evidence_wall_ms: round(sum(phases, (p) => p.wall_ms)),
    full_runner_elapsed_ms: Date.parse(r.finished_at) - Date.parse(r.started_at),
    cutoff_after_runner_start_ms: Date.parse(r.request.before_time) - Date.parse(r.started_at),
    duplicate_fraction: round((direct.length - first.direct_refs) / direct.length),
    stable_reference_sets: phases.every((p) => p.reference_set_sha256 === first.reference_set_sha256),
    stable_excerpt_sets: phases.every((p) => p.content_set_sha256 === first.content_set_sha256),
    project_review_view_unchanged: r.project_review_view_unchanged,
    lanes,
    provider_api_calls_measured: null,
    provider_fetch_commands_requested: r.remote_fetches_requested,
    app_model_calls: 0,
    agent_tokens_measured: null,
  }
})
const [a, b] = reports.map(({ r }) => new Map(r.runs[0].items.map((i) => [i.ref, i])))
const intersection = [...a.keys()].filter((ref) => b.has(ref))
printJson(
  JSON.stringify(
    {
      protocol: 1,
      baseline: details[0],
      expanded: details[1],
      comparison: {
        retained: intersection.length,
        added: b.size - intersection.length,
        lost: a.size - intersection.length,
        jaccard: round(intersection.length / new Set([...a.keys(), ...b.keys()]).size),
        result_increase_fraction: round((b.size - a.size) / a.size),
        common_changed_excerpt_hash: intersection.filter((ref) => a.get(ref).text_sha256 !== b.get(ref).text_sha256)
          .length,
        common_changed_context_label: intersection.filter((ref) => a.get(ref).context !== b.get(ref).context).length,
        qualification: "Request changed on a mutable archive; added results are not measured recall gain",
      },
      unknown: [
        "precision",
        "recall",
        "false_negative_rate",
        "nDCG",
        "independent_judge_agreement",
        "model_tokens",
        "provider_HTTP_counts",
        "cold_cache_latency",
        "human_review_time",
      ],
    },
    null,
    2,
  ),
)
