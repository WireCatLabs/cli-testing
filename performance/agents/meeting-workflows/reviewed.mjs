import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { digest, runner } from "./runtime.mjs"

const args = process.argv.slice(2)
assert.equal(args.length, 4, "usage: reviewed.mjs --install <directory> --output <new directory>")
assert.equal(args[0], "--install")
assert.equal(args[2], "--output")
const install = resolve(args[1])
const output = resolve(args[3])
assert.equal(existsSync(output), false, "output must be a new directory")
mkdirSync(output, { recursive: true })
const lock = JSON.parse(readFileSync(join(install, "package-lock.json"), "utf8"))
const packages = Object.fromEntries(
  Object.entries(lock.packages)
    .filter(([name]) => /node_modules\/@wirecat\//.test(name))
    .map(([name, item]) => [name, { version: item.version, integrity: item.integrity }]),
)
assert.equal(packages["node_modules/@wirecat/zoom-cli"].version, "0.23.1")
assert.equal(packages["node_modules/@wirecat/cli-memo"].version, "0.59.0")
const directory = join(output, "fixture")
const tool = runner(install, directory)
const trace = []
const invoke = (args, options = {}) => {
  const answer = tool.invoke(args, options)
  trace.push({ args, tool: options.tool ?? "zoom", agent: options.agent ?? false, answer })
  return answer
}
const memo = (args, options = {}) => invoke(args, { ...options, tool: "memo" })
const checks = []
const checked = (name) => checks.push(name)
const profile = "reviewed-workflow"
const scope = ["--provider", "zoom", "--account", `zm-profile:${profile}`]
const project = memo(["projects", "add", "Harbour Observatory", "--key", "HOB"]).item
for (const alias of ["Harbour Research", "Пристань Обсерватория"]) {
  const vocabulary = memo(["vocabulary", "show", "HOB"]).item
  memo(["vocabulary", "aliases", "add", project.ref, alias, "--fingerprint", vocabulary.fingerprint])
}
const vocabulary = memo(["vocabulary", "show", "HOB"]).item
assert.equal(vocabulary.matches.length, 1)
assert.equal(vocabulary.matches[0].aliases.length, 2)
checked("canonical project resolved with two explicit aliases")
const fixtures = [
  { title: "confirmed", text: "Alex Example: Harbour Observatory keeps its twelve-unit budget." },
  {
    title: "earlier",
    text: "Alex Example: Harbour Research is our Harbour Observatory project.\n\n00:01.000 --> 00:02.000\nCasey Example: Пристань Обсерватория budget is capped at twelve units.\n\n00:02.000 --> 00:03.000\nCasey Example: Prepare the safety checklist.\n\n00:03.000 --> 00:04.000\nAlex Example: A twenty-unit expansion is only a proposal and remains unapproved.",
  },
]
const sourceHashes = []
function importFixture(folder, entries) {
  mkdirSync(folder)
  for (const { title, text } of entries) {
    const vtt = `WEBVTT\n\n00:00.000 --> 00:01.000\n${text}\n`
    sourceHashes.push(digest(vtt))
    writeFileSync(join(folder, `2026-10-01_0900_${title}.vtt`), vtt)
  }
  invoke(["meetings", "import", folder])
}
invoke(["config", "set", "account.profile", "foreign"])
importFixture(join(directory, "foreign-input"), [
  { title: "foreign", text: "Alex Example: Harbour Research Пристань Обсерватория foreign evidence." },
])
const foreign = invoke(["meetings", "list"]).items[0]
invoke(["config", "set", "account.profile", profile])
importFixture(join(directory, "input"), fixtures)
const meetings = invoke(["meetings", "list"]).items
assert.equal(meetings.length, 2)
const confirmed = meetings.find((meeting) => meeting.title === "confirmed")
const earlier = meetings.find((meeting) => meeting.title === "earlier")
assert.ok(confirmed && earlier)
memo(["projects", "meetings", "link", project.ref, confirmed.id, ...scope])
const memberships = () => memo(["projects", "meetings", "list", project.ref, ...scope]).items
assert.deepEqual(
  memberships().map((item) => item.meeting),
  [confirmed.ref],
)
// Word search prepares the index; project evidence intentionally never refreshes it.
invoke(["search", "meetings", "Harbour", "--limit", "20"])
let cursor
const pages = []
for (let index = 0; index < 8; index++) {
  const args = ["meetings", "projects", "evidence", project.key, "--limit", "2", "--max-read-bytes", "65536"]
  if (cursor) args.push("--cursor", cursor)
  const page = invoke(args).item
  pages.push(page)
  assert.equal(page.association, "unconfirmed-word-evidence")
  assert.equal(page.coverage.archive_completeness, "unknown")
  assert.equal(page.coverage.index_completeness, "unknown")
  assert.ok(page.hits.every((hit) => hit.meeting !== foreign.ref))
  if (!page.page.has_more) break
  cursor = page.page.next_cursor
  assert.ok(cursor)
  assert.notEqual(index, 7, "project discovery did not exhaust fixture")
}
assert.ok(pages.some((page) => page.term.kind === "alias" && page.hits.some((hit) => hit.meeting === earlier.ref)))
for (const alias of vocabulary.matches[0].aliases) {
  assert.ok(pages.some((page) => page.term.name === alias.name && page.hits.some((hit) => hit.meeting === earlier.ref)))
}
assert.ok(pages.some((page) => page.hits.length === 0 && page.page.has_more))
for (const page of pages) {
  for (const hit of page.hits) {
    const source = meetings.find((meeting) => meeting.ref === hit.meeting)
    assert.ok(source)
    assert.equal(hit.source.title, source.title)
    assert.equal(hit.source.started_at, source.started_at)
    assert.equal(hit.source.url, null)
  }
}
assert.deepEqual(
  memberships().map((item) => item.meeting),
  [confirmed.ref],
)
checked("paged alias discovery retains unknown coverage, excludes foreign account and creates no membership")
const evidence = invoke(["meetings", "evidence", earlier.ref, "--max-read-bytes", "65536"]).item
assert.equal(evidence.coverage.archive_completeness, "unknown")
assert.equal(evidence.items.length, 4)
const citation = (position) => ({
  reference: evidence.items[position].reference,
  fingerprint: evidence.items[position].fingerprint,
})
const passage = invoke(["meetings", "passage", citation(1).reference, "--before-n", "1", "--after-n", "2"]).item
assert.equal(passage.items.length, 4)
assert.ok(passage.items.some((cue) => cue.text.includes("remains unapproved")))
checked("nearby cues preserve the unapproved-expansion qualification and exact fingerprints")
const input = {
  schema_version: 1,
  key: "reviewed-workflow",
  extractor: "synthetic-workflow-v1",
  findings: [
    {
      id: "budget",
      kind: "fact",
      project: project.ref,
      evidence: [citation(1)],
      type: "decision",
      statement: "Budget is capped at twelve units.",
    },
    {
      id: "checklist",
      kind: "task",
      project: project.ref,
      evidence: [citation(2)],
      type: "chore",
      title: "Prepare the safety checklist",
      reason: "The call explicitly requests the checklist.",
      commitment: "explicit",
    },
    {
      id: "expansion",
      kind: "fact",
      project: project.ref,
      evidence: [citation(3)],
      type: "decision",
      statement: "A twenty-unit expansion is approved.",
    },
  ],
}
const stage = (input, options = {}) =>
  memo(["meetings", "actions", "add", "-", ...scope], { agent: true, input: JSON.stringify(input), ...options })
const unlinked = stage(input, { status: 2 })
assert.match(unlinked.error.message, /confirm|project/i)
checked("findings refuse unconfirmed meeting membership")
memo([
  "projects",
  "meetings",
  "link",
  project.ref,
  earlier.id,
  ...scope,
  "--reason",
  "Synthetic owner reviewed the explicit project-name cue.",
])
const batch = stage(input).item
assert.equal(batch.status, "proposed")
assert.equal(batch.receipt, null)
const facts = () => memo(["facts", "list"]).items
const tasks = () => memo(["tasks", "list", "project:HOB"]).items
assert.deepEqual(facts(), [])
assert.deepEqual(tasks(), [])
const review = [
  "meetings",
  "actions",
  "confirm",
  batch.id,
  "budget",
  "checklist",
  ...scope,
  "--fingerprint",
  batch.fingerprint,
]
const refused = memo(review, { agent: true, status: 2 })
assert.match(refused.error.message, /owner/)
assert.deepEqual(facts(), [])
assert.deepEqual(tasks(), [])
checked("staging and refused agent review create no accepted facts or tasks")
const stale = memo(
  review.map((arg) => (arg === batch.fingerprint ? "0".repeat(64) : arg)),
  { status: 2 },
)
assert.match(stale.error.message, /fingerprint|changed|preview/i)
checked("stale preview cannot be reviewed")
// This fixture models a separate owner terminal; it is never an agent escalation path.
const reviewed = memo(review).item
assert.equal(reviewed.status, "reviewed")
assert.deepEqual(reviewed.receipt.accepted, ["budget", "checklist"])
const decisions = Object.fromEntries(reviewed.receipt.items.map((item) => [item.id, item]))
assert.equal(decisions.expansion.status, "rejected")
assert.equal(decisions.expansion.reference, null)
assert.equal(facts().length, 1)
assert.equal(tasks().length, 1)
checked("synthetic owner accepts supported fact/task and rejects unsupported expansion")
const second = runner(install, directory)
const fresh = (args) => {
  const answer = second.invoke(args, { tool: "memo" })
  trace.push({ args, tool: "memo", agent: false, answer })
  return answer
}
const show = fresh(["meetings", "actions", "show", batch.id, ...scope]).item
assert.deepEqual(show.receipt, reviewed.receipt)
const fact = fresh(["facts", "show", decisions.budget.reference]).item
assert.deepEqual(fact.evidence, [citation(1).reference])
const task = fresh(["tasks", "list", "project:HOB"]).items[0]
assert.equal(task.ref, decisions.checklist.reference)
assert.equal(task.title, "Prepare the safety checklist")
assert.deepEqual(show.input.findings.find((finding) => finding.id === "checklist").evidence, [citation(2)])
checked("fresh processes retrieve the accepted references and their exact receipt citations")
assert.deepEqual(memo(review).item.receipt, reviewed.receipt)
assert.equal(stage(input).item.id, batch.id)
const duplicate = stage({ ...input, key: "reviewed-workflow-again" }).item
assert.equal(duplicate.previous.length, 3)
assert.ok(duplicate.previous.filter((item) => item.status === "accepted").every((item) => item.reused))
assert.equal(facts().length, 1)
assert.equal(tasks().length, 1)
checked("review replay, staging replay and another batch preserve one fact/task and prior rejection")
const reportValue = (value, field) => {
  if ((field === "cursor" || field === "next_cursor") && typeof value === "string")
    return { sha256: digest(value), normalized: "ephemeral fixture cursor" }
  if (Array.isArray(value))
    return value.map((item, index) => reportValue(item, value[index - 1] === "--cursor" ? "cursor" : undefined))
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reportValue(item, key)]))
  return value
}
const files = ["reviewed.mjs", "runtime.mjs", "guard.cjs"]
const report = {
  schema_version: 1,
  kind: "deterministic-published-cli-acceptance",
  created_at: new Date().toISOString(),
  node: process.version,
  packages,
  checks,
  fixture_sha256: digest(sourceHashes),
  source_sha256: Object.fromEntries(
    files.map((name) => [name, digest(readFileSync(fileURLToPath(new URL(name, import.meta.url))))]),
  ),
  calls: [...tool.calls, ...second.calls],
  trace: reportValue(trace),
  trace_normalization:
    "Ephemeral fixture cursors are replaced by SHA-256 objects; stdout hashes retain the original answers.",
  accepted: reviewed.receipt,
  discovery_pages: pages.length,
  network_attempts: 0,
  limits:
    "Synthetic local CLI paths only; no LLM reasoning, live Zoom schedule, provider login, embeddings, real data or timing claims. Project tasks are retrieved through tasks list project:HOB; receipt retains their meeting citations.",
}
writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({
    checks: checks.length,
    calls: report.calls.length,
    discovery_pages: pages.length,
    output: join(output, "report.json"),
  })}\n`,
)
