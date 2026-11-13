// What the Desktop's Documents and Meetings pages cost cli-core's listings on a heavy user's store.
// A synthetic store: no real data, no network, no account, no CLI run.
//   node bench.mjs <cli-core checkout with dist> <store file, made when missing>
import { existsSync } from "node:fs"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

const [core, path] = process.argv.slice(2)
if (!core || !path) throw new Error("usage: node bench.mjs <cli-core checkout with dist> <store file>")
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openStore } = await load("store/index.js")
const { listDocuments, listDocumentSources, showDocument, listMeetingEntries, showMeetingEntry } =
  await load("services/index.js")
const { documentListRequest, meetingListRequest } = await load("cli/index.js")

const DOCUMENTS = Number(process.env.BENCH_DOCUMENTS ?? 20_000)
const EVENTS = Number(process.env.BENCH_EVENTS ?? 8_000)
const MEETINGS = Number(process.env.BENCH_MEETINGS ?? 4_000)
const CALLS = Number(process.env.BENCH_CALLS ?? 1_000)
const RUNS = Number(process.env.BENCH_RUNS ?? 40)
const DAY = 86_400_000
// Two years of history up to the measured month, so a month window sits among older and newer rows.
const START = Date.parse("2025-01-01T00:00:00Z")
const SPAN = 730 * DAY
const NOW = Date.parse("2026-11-13T12:00:00Z")

const seeded = existsSync(path)
const store = await openStore({ path })
const say = (line) => process.stdout.write(`${line}\n`)

if (!seeded) {
  const accounts = {}
  for (const [provider, account] of [
    ["google-drive", "drive-a"],
    ["google-drive", "drive-b"],
    ["obsidian", "vault"],
    ["added", "owner"],
    ["import", "crm"],
    ["google-calendar", "work"],
    ["google-calendar", "home"],
    ["zoom", "work"],
    ["phone", "pixel"],
  ])
    accounts[`${provider}:${account}`] = await store.accounts.saveAccount({ provider, account }, { name: null })
  const { database: db } = await import(pathToFileURL(join(core, "dist", "store/open.js")).href).then(
    async ({ openCache }) => ({
      database: await openCache(path),
    }),
  )
  db.exec("PRAGMA foreign_keys = OFF")
  db.exec("BEGIN")
  const words = ["budget", "launch", "invoice", "contract", "roadmap", "hiring", "design", "review", "report", "plan"]
  const text = (i) =>
    Array.from({ length: 400 }, (_, k) => `${words[(i * 7 + k) % words.length]} item${(i + k) % 997}`).join(" ")
  const documentAccounts = [
    "google-drive:drive-a",
    "google-drive:drive-b",
    "obsidian:vault",
    "added:owner",
    "import:crm",
  ]
  const extensions = ["pdf", "md", "docx", "txt", "xlsx", "md", "pdf", "vtt"]
  const doc = db.prepare(
    "INSERT INTO documents (account_id, external_id, kind, title, file_name, extension, mime, size, body, " +
      "external_updated_at, created_at, updated_at, storage) VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
  )
  const file = db.prepare(
    "INSERT INTO files (account_id, external_id, kind, name, path, path_folded, document_id, size, " +
      "external_updated_at, created_at, updated_at) VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)",
  )
  const pending = db.prepare("INSERT OR IGNORE INTO document_index_pending (indexable_type, id) VALUES ('document', ?)")
  for (let i = 0; i < DOCUMENTS; i++) {
    const account = accounts[documentAccounts[i % documentAccounts.length]]
    const extension = extensions[i % extensions.length]
    const name = `Document ${i}.${extension}`
    const folder = `Area ${i % 12}/Project ${i % 60}${i % 3 === 0 ? `/Sub ${i % 5}` : ""}`
    const path = `${folder}/${name}`
    const at = START + Math.floor((i / DOCUMENTS) * SPAN)
    const body = i % 5 === 4 ? null : text(i)
    const id = Number(
      doc.get(account, `d${i}`, `Document ${i}`, name, extension, null, 4096 + i, body, at, at, at, "local").id,
    )
    file.get(account, `d${i}`, name, path, path.toLowerCase(), id, 4096 + i, at, at, at)
    if (body !== null) pending.run(id)
  }
  const calendar = db.prepare(
    "INSERT INTO calendars (account_id, external_id, title, primary_calendar, synced, created_at, updated_at) " +
      "VALUES (?, ?, ?, 1, 1, 0, 0) RETURNING id",
  )
  const work = Number(calendar.get(accounts["google-calendar:work"], "primary", "Work").id)
  const home = Number(calendar.get(accounts["google-calendar:home"], "primary", "Home").id)
  const calls = Number(calendar.get(accounts["phone:pixel"], "calls", "Calls").id)
  const identity = db.prepare(
    "INSERT INTO identities (provider, external_id, name, email, created_at, updated_at) VALUES ('email', ?, ?, ?, 0, 0)",
  )
  const people = 500
  for (let i = 0; i < people; i++) identity.run(`p${i}@example.com`, `Person ${i}`, `p${i}@example.com`)
  const event = db.prepare(
    "INSERT INTO events (title, starts_at, ends_at, origin, status, all_day, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 'confirmed', 0, 0, 0) RETURNING id",
  )
  const entry = db.prepare(
    "INSERT INTO calendar_entries (calendar_id, kind, event_id, external_id, exception, status, title, starts_at, " +
      "ends_at, all_day, event_type, join_url, join_key, created_at, updated_at) " +
      "VALUES (?, 'single', ?, ?, 0, 'confirmed', ?, ?, ?, 0, ?, ?, ?, 0, 0) RETURNING id",
  )
  const attendee = db.prepare(
    "INSERT INTO calendar_entry_participants (entry_id, identity_id, email, name, optional, organizer, self, " +
      "resource, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, 0, 0, 0, 0)",
  )
  const meeting = db.prepare(
    "INSERT INTO meetings (account_id, external_id, title, join_url, join_key, started_at, ended_at, duration_ms, " +
      "event_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0) RETURNING id",
  )
  const participant = db.prepare(
    "INSERT INTO meeting_participants (meeting_id, identity_id, display_name, email, role, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, 0, 0)",
  )
  const transcript = db.prepare(
    "INSERT INTO meeting_transcripts (meeting_id, source, created_at, updated_at) VALUES (?, 'api', 0, 0) RETURNING id",
  )
  const line = db.prepare(
    "INSERT INTO meeting_transcript_rows (meeting_transcript_id, position, start_ms, end_ms, speaker_name, text, " +
      "created_at) VALUES (?, ?, ?, ?, ?, ?, 0)",
  )
  const slot = (i, count) => START + Math.floor((i / count) * SPAN) + 9 * 3_600_000
  // Three in eight calendar events are Zoom meetings over 40 recurring rooms; a quarter of the meetings have no event.
  const joined = Math.floor((EVENTS * 3) / 8)
  for (let i = 0; i < EVENTS; i++) {
    const at = slot(i, EVENTS)
    const zoom = i % 8 < 3
    const key = zoom ? `zoom:${100000000 + (i % 40)}` : null
    const id = Number(event.get(`Event ${i}`, at, at + 3_600_000, "calendar").id)
    const copy = Number(
      entry.get(
        i % 4 === 0 ? home : work,
        id,
        `e${i}`,
        `Event ${i}`,
        at,
        at + 3_600_000,
        null,
        key ? `https://us02web.zoom.us/j/${key.slice(5)}` : null,
        key,
      ).id,
    )
    for (let k = 0; k < 4; k++) {
      const person = (i * 3 + k) % people
      attendee.get(copy, person + 1, `p${person}@example.com`, `Person ${person}`, k === 0 ? 1 : 0)
    }
    if (key) {
      const own = Number(
        meeting.get(
          accounts["zoom:work"],
          `z${i}`,
          `Event ${i}`,
          `https://us02web.zoom.us/j/${key.slice(5)}`,
          key,
          at + 60_000,
          at + 3_000_000,
          2_940_000,
          null,
        ).id,
      )
      for (let k = 0; k < 4; k++) {
        const person = (i * 3 + k) % people
        participant.get(own, person + 1, `Person ${person}`, `p${person}@example.com`, k === 0 ? "host" : "attendee")
      }
      if (i % 2 === 0) {
        const held = Number(transcript.get(own).id)
        for (let k = 0; k < 20; k++)
          line.run(held, k, k * 5000, k * 5000 + 4000, `Person ${k % 4}`, `line ${k} ${text(k).slice(0, 80)}`)
      }
    }
  }
  // Zoom meetings with no calendar event: their own rows.
  for (let i = 0; i < Math.max(0, MEETINGS - joined); i++) {
    const at = slot(i, MEETINGS - joined) + 5 * 3_600_000
    meeting.get(
      accounts["zoom:work"],
      `adhoc${i}`,
      `Ad hoc ${i}`,
      `https://us02web.zoom.us/j/${200000000 + i}`,
      `zoom:${200000000 + i}`,
      at,
      at + 1_800_000,
      1_800_000,
      null,
    )
  }
  for (let i = 0; i < CALLS; i++) {
    const at = slot(i, CALLS) + 2 * 3_600_000
    const id = Number(event.get(`Call ${i}`, at, at + 300_000, "calendar").id)
    entry.get(calls, id, `c${i}`, `+3460000${i}`, at, at + 300_000, "call", null, null)
  }
  db.exec("COMMIT")
  db.close()
  // The first text search builds the words index of every document; it is not what a page waits for.
  await listDocuments(store, documentListRequest("budget", { limit: 1, page: 1, zone: "UTC", now: NOW }))
}

const counts = (await import(pathToFileURL(join(core, "dist", "store/open.js")).href)).openCache
const db = await counts(path)
const count = (table) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
// Findings batches a meeting page reads for its pending counts: a long review history, 5 findings each.
const BATCHES = Number(process.env.BENCH_BATCHES ?? 2_000)
if (Number(db.prepare("SELECT count(*) AS n FROM proposed_actions WHERE kind = 'meeting_findings'").get()?.n) === 0) {
  const zoom = db.prepare("SELECT id, account_id FROM meetings ORDER BY id").all()
  const batch = db.prepare(
    "INSERT INTO proposed_actions (kind, account_id, payload, status, proposed_by_type, proposed_by_id, created_at, " +
      "updated_at) VALUES ('meeting_findings', ?, ?, ?, 'bot', 1, 0, 0)",
  )
  db.exec("BEGIN")
  for (let i = 0; i < BATCHES; i++) {
    const cited = zoom[(i * 7) % zoom.length]
    const findings = Array.from({ length: 5 }, (_, k) => ({
      id: `f${k}`,
      kind: "fact",
      statement: `finding ${k} ${"a synthetic statement about the budget and the launch ".repeat(4)}`,
      evidence: [{ reference: `meeting:${cited.account_id}/${cited.id}/1/${k}`, fingerprint: "0".repeat(64) }],
    }))
    batch.run(
      cited.account_id,
      JSON.stringify({ schemaVersion: 1, key: `b${i}`, findings, decided: [] }),
      i % 3 === 0 ? "proposed" : "approved",
    )
  }
  db.exec("COMMIT")
}
say(
  `documents ${count("documents")}, events ${count("events")}, calendar entries ${count("calendar_entries")}, ` +
    `meetings ${count("meetings")}, transcript lines ${count("meeting_transcript_rows")}, ` +
    `findings batches ${count("proposed_actions")}`,
)
db.close()

const measure = async (label, work) => {
  let rows = 0
  for (let warm = 0; warm < 3; warm++) await work()
  const times = []
  for (let run = 0; run < RUNS; run++) {
    const began = performance.now()
    rows = await work()
    times.push(performance.now() - began)
  }
  times.sort((a, b) => a - b)
  const at = (share) => times[Math.min(times.length - 1, Math.floor(share * times.length))].toFixed(1)
  say(`${label.padEnd(52)} p50 ${at(0.5).padStart(6)} ms  p95 ${at(0.95).padStart(6)} ms  rows ${rows}`)
}

const page = { limit: 50, page: 1, zone: "UTC", now: NOW }
const documents = async (words, more = {}) =>
  (await listDocuments(store, documentListRequest(words, { ...page, ...more }))).items.length
const meetings = async (words, more = {}) =>
  (await listMeetingEntries(store, meetingListRequest(words, { ...page, ...more }).request)).items.length

await measure("documents: first page of 50, every account", () => documents(""))
await measure("documents: page 200 of 50", () => documents("", { page: 200 }))
await measure("documents: one account", () => documents("source:google-drive:drive-a"))
await measure("documents: kind:pdf", () => documents("kind:pdf"))
await measure('documents: folder:"Area 3"', () => documents('folder:"Area 3"'))
await measure("documents: text budget (words index)", () => documents("budget"))
await measure("documents: text budget kind:md", () => documents("budget kind:md"))
await measure("documents: sources tree, depth 3", async () => (await listDocumentSources(store, { depth: 3 })).length)
const first = (await listDocuments(store, documentListRequest("", page))).items[0]
await measure("documents: show, 20,000 characters", async () => {
  await showDocument(store, first.ref, { offset: 0, limit: 20_000 })
  return 1
})
const month = "started_at:[2026-11-01 TO 2026-12-01}"
const week = "started_at:[2026-11-09 TO 2026-11-16}"
await measure("meetings: month window, every row (limit 500)", () => meetings(month, { limit: 500 }))
await measure("meetings: week window, every row (limit 500)", () => meetings(week, { limit: 500 }))
await measure("meetings: default window, first page of 50", () => meetings(""))
await measure("meetings: a year, first page of 50", () => meetings("started_at:[2025-11-01 TO 2026-11-01}"))
await measure("meetings: a year, page 10 of 50", () => meetings("started_at:[2025-11-01 TO 2026-11-01}", { page: 10 }))
await measure("meetings: month, has_transcript:true", () => meetings(`${month} has_transcript:true`, { limit: 500 }))
await measure("meetings: month, person:person:7", () => meetings(`${month} person:"person:7"`, { limit: 500 }))
await measure("meetings: month, text event", () => meetings(`${month} event`, { limit: 500 }))
const shown = (await listMeetingEntries(store, meetingListRequest(`${month} has_transcript:true`, page).request))
  .items[0]
await measure("meetings: show with 200 transcript lines", async () => {
  if (shown) await showMeetingEntry(store, shown.ref, { offset: 0, limit: 200 })
  return shown ? 1 : 0
})
await store.close()
