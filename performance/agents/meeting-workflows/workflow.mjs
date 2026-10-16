import assert from "node:assert/strict"
import { queries } from "./fixture.mjs"
import { digest, selectors } from "./runtime.mjs"

const searchArgs = (query, cursor) => [
  query,
  "--limit",
  "3",
  "--max-read-bytes",
  "524288",
  ...(cursor ? ["--cursor", cursor] : []),
]
export const passageRequest = (ref, id) => ({
  id,
  command: ["meetings", "passage"],
  args: [ref, "--before-n", "1", "--after-n", "1", "--bytes", "8192", "--max-read-bytes", "65536"],
})
export function workflow(tool, mode, oracle) {
  const start = performance.now()
  const compact = mode.endsWith("compact")
  const hits = new Map()
  const found = new Map(queries.map((q) => [q, new Set()]))
  const cursors = new Map(queries.map((q) => [q, new Set()]))
  let active = queries.map((query, index) => ({ query, id: `q${index}`, cursor: null }))
  let waves = 0
  while (active.length) {
    assert.ok(++waves <= 32, "pagination did not terminate")
    const requests = active.map((q) => ({
      id: q.id,
      command: ["search", "meetings"],
      args: searchArgs(q.query, q.cursor),
    }))
    const envelope = tool.requests(requests, mode, { selector: compact ? selectors.search : undefined })
    assert.equal(envelope.meta.complete, true)
    const next = []
    for (let index = 0; index < envelope.items.length; index++) {
      const result = envelope.items[index],
        query = active[index]
      assert.equal(result.id, query.id)
      assert.equal(result.status, "ok")
      assert.equal(result.complete, true)
      const answer = result.answer
      assert.equal(answer.meta.complete, true)
      for (const hit of answer.items) {
        assert.ok(oracle.hits[hit.ref], `unexpected hit ${hit.ref}`)
        assert.ok(!hit.ref.startsWith(`${oracle.foreign_meeting}/`), "foreign account leaked")
        assert.deepEqual(
          { title: hit.source.title, started_at: hit.source.started_at, url: hit.source.url },
          oracle.hits[hit.ref],
        )
        assert.ok(!found.get(query.query).has(hit.ref), "search continuation repeated a hit")
        found.get(query.query).add(hit.ref)
        hits.set(hit.ref, hit)
      }
      if (answer.page.has_more) {
        assert.equal(typeof answer.page.next_cursor, "string")
        assert.ok(!cursors.get(query.query).has(answer.page.next_cursor), "cursor repeated")
        cursors.get(query.query).add(answer.page.next_cursor)
        next.push({ ...query, cursor: answer.page.next_cursor })
      }
    }
    active = next
  }
  for (const query of queries)
    assert.deepEqual(
      [...found.get(query)].sort(),
      [...oracle.queries[query]].sort(),
      `missed search evidence for ${query}`,
    )
  const requests = [...hits.keys()].sort().map((ref, index) => passageRequest(ref, `p${index}`))
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const contexts = new Map(),
    fingerprints = {}
  for (let i = 0; i < requests.length; i += 32) {
    const envelope = tool.requests(requests.slice(i, i + 32), mode, {
      selector: compact ? selectors.passage : undefined,
    })
    assert.equal(envelope.meta.complete, true)
    for (const result of envelope.items) {
      assert.equal(result.status, "ok")
      assert.equal(result.complete, true)
      assert.equal(result.answer.meta.complete, true)
      const passage = result.answer.item
      assert.equal(passage.target_ref, requestById.get(result.id).args[0])
      assert.equal(passage.coverage.truncated_by, null)
      assert.equal(passage.coverage.archive_completeness, "unknown")
      assert.equal(typeof passage.target_fingerprint, "string")
      fingerprints[passage.target_ref] = passage.target_fingerprint
      for (const cue of passage.items) {
        assert.deepEqual(
          { text: cue.text, start_ms: cue.start_ms, speaker_name: cue.speaker_name },
          oracle.contexts[cue.ref],
        )
        contexts.set(cue.ref, { ref: cue.ref, text: cue.text, start_ms: cue.start_ms, speaker_name: cue.speaker_name })
      }
    }
  }
  assert.deepEqual([...contexts.keys()].sort(), Object.keys(oracle.contexts).sort(), "missed neighboring context")
  const evidence = {
    queries: Object.fromEntries([...found].map(([q, refs]) => [q, [...refs].sort()])),
    contexts: [...contexts.values()].sort((a, b) => a.ref.localeCompare(b.ref)),
    sources: [...hits]
      .map(([ref, hit]) => ({ ref, ...oracle.hits[hit.ref] }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
  }
  const sum = (field) => tool.calls.reduce((total, call) => total + call[field], 0)
  return {
    mode,
    wall_ms: performance.now() - start,
    calls: tool.calls.length,
    process_ms: sum("elapsed_ms"),
    stdout_bytes: sum("stdout_bytes"),
    input_bytes: sum("stdin_bytes") + sum("argv_bytes"),
    search_waves: waves,
    unique_hits: hits.size,
    context_cues: contexts.size,
    decision_context_retained: oracle.decision_context.every((ref) => contexts.has(ref)),
    foreign_hits: 0,
    evidence_sha256: digest(evidence),
    fingerprints,
    evidence,
    trace: tool.calls,
  }
}
export function qualityProbes(tool, oracle) {
  const refs = Object.keys(oracle.hits).sort()
  const valid = passageRequest(refs[0], "valid")
  const stale = {
    ...passageRequest(refs[1], "stale"),
    args: [...passageRequest(refs[1], "stale").args, "--expected-fingerprint", "0".repeat(64)],
  }
  const missing = passageRequest(refs[0].replace(/\d+$/, "999999"), "missing")
  const mixed = tool.requests([missing, valid, stale], "batch-compact", { selector: selectors.passage })
  assert.equal(mixed.meta.complete, false)
  assert.deepEqual(
    mixed.items.map((item) => item.status),
    ["error", "ok", "error"],
  )
  assert.equal(mixed.items[1].answer.item.target_ref, refs[0])
  const first = passageRequest(refs[0], "first"),
    second = passageRequest(refs[1], "second")
  const bounded = tool.requests([first, second], "batch-compact", { selector: selectors.passage, budget: 65536 })
  assert.equal(bounded.meta.complete, false)
  assert.deepEqual(
    bounded.items.map((item) => item.status),
    ["ok", "not_run"],
  )
  const unresolved = bounded.items
    .filter((item) => item.status === "not_run")
    .map((item) => [first, second].find((request) => request.id === item.id))
  const retried = tool.requests(unresolved, "batch-compact", { selector: selectors.passage })
  assert.equal(retried.meta.complete, true)
  assert.equal(retried.items[0].status, "ok")
  const combined = [...bounded.items.filter((item) => item.status === "ok"), ...retried.items]
  assert.deepEqual(combined.map((item) => item.answer.item.target_ref).sort(), refs.slice(0, 2))
  return {
    mixed_statuses: mixed.items.map((item) => ({ id: item.id, status: item.status, error: item.error?.reason })),
    mixed_complete: mixed.meta.complete,
    budget_statuses: bounded.items.map((item) => ({ id: item.id, status: item.status })),
    budget_complete: bounded.meta.complete,
    retried_ids: unresolved.map((item) => item.id),
    retry_complete: retried.meta.complete,
    calls: tool.calls.length,
  }
}
