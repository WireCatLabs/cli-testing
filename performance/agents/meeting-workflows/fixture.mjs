import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { digest, runner } from "./runtime.mjs"
export const queries = ["Harbour Observatory", "HOB", "Пристань Обсерватория", "Absent Zephyr"]
function timestamp(second) {
  return `${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000`
}
function vtt(lines) {
  return `WEBVTT\n\n${lines.map((line, index) => `${timestamp(index)} --> ${timestamp(index + 1)}\n${line}\n`).join("\n")}`
}
export function seed(install, directory, { meetings, cues }) {
  const tool = runner(install, directory)
  const started = performance.now()
  const foreign = join(directory, "foreign")
  mkdirSync(foreign)
  writeFileSync(
    join(foreign, "2026-08-01_0900_foreign.vtt"),
    vtt(["Foreign Example: Harbour Observatory HOB Пристань Обсерватория outside selected account."]),
  )
  tool.invoke(["config", "set", "account.profile", "benchmark-foreign"])
  tool.invoke(["meetings", "import", foreign])
  const foreignMeeting = tool.invoke(["meetings", "list"]).items[0]
  tool.invoke(["config", "set", "account.profile", "benchmark"])
  const folder = join(directory, "input")
  mkdirSync(folder)
  const selected = new Set(Array.from({ length: 8 }, (_, i) => Math.floor((i * (meetings - 1)) / 7)))
  const expectedByTitle = new Map()
  const fixtureHashes = []
  for (let i = 0; i < meetings; i++) {
    const title = `workflow${String(i).padStart(4, "0")}`
    const lines = Array.from(
      { length: cues },
      (_, p) =>
        `Casey Example: Routine inventory record ${i} segment ${p}; this unrelated checklist records equipment status, ordinary maintenance and document filing.`,
    )
    const anchors = []
    if (selected.has(i)) {
      for (const [position, queryIndexes, anchor, context] of [
        [
          Math.floor(cues / 3),
          [0, 1],
          "Harbour Observatory HOB launch planning.",
          "The proposed launch remains unapproved; wait for safety review.",
        ],
        [
          Math.floor((2 * cues) / 3),
          [2],
          "Пристань Обсерватория budget review.",
          "Funds are capped at 12 units; the earlier 20-unit estimate was withdrawn.",
        ],
      ]) {
        lines[position - 1] = "Alex Example: This section records a provisional proposal, not a settled decision."
        lines[position] = `Alex Example: ${anchor}`
        lines[position + 1] = `Blaire Example: ${context}`
        anchors.push({ position, queryIndexes, decision: true })
      }
    }
    if (i === 0) {
      lines[10] = "Casey Example: HOB is an unrelated catalog code here."
      anchors.push({ position: 10, queryIndexes: [1], decision: false })
    }
    const text = vtt(lines)
    fixtureHashes.push(digest(text))
    writeFileSync(join(folder, `2026-09-${String((i % 28) + 1).padStart(2, "0")}_0900_${title}.vtt`), text)
    if (anchors.length) expectedByTitle.set(title, { lines, anchors })
  }
  const receipt = tool.invoke(["meetings", "import", folder])
  assert.equal(receipt.item.meetings, meetings)
  const listed = tool.invoke(["meetings", "list", "--limit", "1000"])
  assert.equal(listed.page.has_more, false)
  assert.equal(listed.items.length, meetings)
  const oracle = {
    queries: Object.fromEntries(queries.map((q) => [q, []])),
    hits: {},
    contexts: {},
    decision_context: [],
    foreign_meeting: foreignMeeting.ref,
  }
  for (const meeting of listed.items) {
    const expected = expectedByTitle.get(meeting.title)
    if (!expected) continue
    const transcript = tool.invoke(["meetings", "transcript", String(meeting.id)])
    assert.equal(transcript.page.has_more, false)
    assert.equal(transcript.items.length, 1)
    const stored = transcript.items[0]
    assert.equal(stored.lines.length, cues)
    for (const { position, queryIndexes, decision } of expected.anchors) {
      const ref = `${stored.ref}/${position}`
      const text = stored.lines.find((line) => line.position === position).text
      assert.equal(text, expected.lines[position].split(": ").slice(1).join(": "))
      oracle.hits[ref] = { title: meeting.title, started_at: meeting.started_at, url: meeting.url }
      for (const index of queryIndexes) oracle.queries[queries[index]].push(ref)
      for (const p of [position - 1, position, position + 1]) {
        const line = stored.lines.find((line) => line.position === p)
        assert.ok(line)
        const cue = `${stored.ref}/${p}`
        oracle.contexts[cue] = { text: line.text, start_ms: line.offset_ms, speaker_name: line.speaker }
        if (decision) oracle.decision_context.push(cue)
      }
    }
  }
  const warm = []
  for (let pass = 0; pass < 12; pass++) {
    const answers = queries.slice(0, 3).map((query) => tool.invoke(["search", "meetings", query, "--limit", "1000"]))
    warm.push(answers.map((answer) => ({ complete: answer.meta.complete, missing: answer.missing ?? [] })))
    if (
      answers.every(
        (answer, index) =>
          digest(answer.items.map((hit) => hit.ref).sort()) === digest([...oracle.queries[queries[index]]].sort()) &&
          answer.meta.complete,
      )
    )
      break
    assert.notEqual(pass, 11, "index did not reach fixture oracle")
  }
  assert.equal(Object.keys(oracle.hits).length, 17)
  assert.equal(Object.keys(oracle.contexts).length, 51)
  return {
    oracle,
    fixture: {
      meetings,
      cues_per_meeting: cues,
      total_cues: meetings * cues,
      sha256: digest(fixtureHashes),
      setup_ms: performance.now() - started,
      setup_calls: tool.calls.length,
      warm_index_passes: warm.length,
      source_urls: "null in local VTT imports",
      foreign_account_meetings: 1,
    },
    warm,
  }
}
