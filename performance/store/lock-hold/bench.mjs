// Lock hold of mail saves on a copy of a real store. Offline: the copy is opened through cli-core's own store code and
// nothing here reaches the network or an account.
//   node bench.mjs <cli-core checkout with dist> <store copy> [re-saves per run, 2000] [new emails per run, 300]
//   [split sample for re-saves, 100] [split sample for new emails, 30]
import { fork } from "node:child_process"
import { statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [core, path, resaves = "2000", fresh = "300", resampled = "100", freshSampled = "30"] = process.argv.slice(2)
const SIZES = {
  resave: { n: Number(resaves), k: Number(resampled) },
  new: { n: Number(fresh), k: Number(freshSampled) },
}
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openStoreContext } = await load("store/sqlite/open-store.js")
const { mailStoreOver } = await load("store/sqlite/emails.js")
const { write, writeBatch } = await load("store/sqlite/transaction.js")
const { drainStems, stemmerCache } = await load("store/sqlite/stems.js")
const { drainMentions, knownPeople } = await load("store/sqlite/mention-drain.js")
const { drainInvolvementQueue } = await load("store/sqlite/involvement-queue.js")
const { nameIndex } = await load("domain/person-names.js")
const { createStemmer } = await load("search/stem.js")

const context = await openStoreContext({ path, command: "lock-bench", version: "0.0.0" })
const { database } = context
const mail = mailStoreOver(context)
database.exec("CREATE TABLE IF NOT EXISTS bench_waiter (t REAL)")

const one = (sql) => Number(Object.values(database.prepare(sql).get() ?? {})[0])
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0
}
const fmt = (x) => (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.round(x)))
const out = (text) => process.stdout.write(`${text}\n`)
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const totals = {
  fileGB: +(statSync(path).size / 1e9).toFixed(2),
  emails: one("SELECT count(*) FROM emails"),
  withBody: one("SELECT count(*) FROM emails WHERE coalesce(body_text,'') <> ''"),
  threads: one("SELECT count(*) FROM email_threads"),
  messages: one("SELECT count(*) FROM messages"),
  mentions: one("SELECT count(*) FROM mentions"),
}
const people = knownPeople(database)
totals.knownPeople = people.length
totals.knownNames = people.reduce((n, p) => n + p.names.length + p.aliases.length, 0)
const indexMs = []
const peopleMs = []
for (let i = 0; i < 7; i++) {
  let t = performance.now()
  const known = knownPeople(database)
  peopleMs.push(performance.now() - t)
  t = performance.now()
  nameIndex(known, createStemmer())
  indexMs.push(performance.now() - t)
}
out(`totals ${JSON.stringify(totals)}`)

// Emails with a body, newest first, in disjoint slices: each run re-saves its own set, as the header backfill does.
const NEED = 4 * SIZES.resave.n + 2 * SIZES.resave.k + 4 * SIZES.new.n + 2 * SIZES.new.k
const rows = database
  .prepare(
    `SELECT e.account_id, e.external_id, e.subject, e.from_address, e.from_name, e.sent_at, e.body_text, t.external_id AS thread
       FROM emails e JOIN email_threads t ON t.id = e.email_thread_id
      WHERE coalesce(e.body_text,'') <> '' AND e.from_address IS NOT NULL AND e.deleted_at IS NULL
      ORDER BY e.id DESC LIMIT ?`,
  )
  .all(NEED)
if (rows.length < NEED) throw new Error(`store has only ${rows.length} usable emails`)
let cursor = 0
const take = (n) => {
  cursor += n
  return rows.slice(cursor - n, cursor)
}
// A re-save keeps the stored text, so it queues no mention work; a new email always does.
let serial = 0
const inputOf = (row, now, kind) => ({
  accountId: Number(row.account_id),
  externalId: kind === "new" ? `bench-thread-${serial}@lock-bench.invalid` : String(row.thread),
  now,
  emails: [
    {
      externalId: kind === "new" ? `bench-${serial++}@lock-bench.invalid` : String(row.external_id),
      subject: row.subject === null ? null : String(row.subject),
      from: { address: String(row.from_address), name: row.from_name === null ? null : String(row.from_name) },
      sentAt: row.sent_at === null ? null : Number(row.sent_at),
      bodyText: String(row.body_text),
      headers: { "list-id": "bench.example" },
    },
  ],
})

const summary = (xs) => ({ median: pct(xs, 50), p95: pct(xs, 95), max: Math.max(...xs) })

// 1. One save, split. The outer transaction takes no drain; each drain then runs on its own clock inside it.
const splitSaves = (set, kind) => {
  const out = { data: [], stems: [], mentions: [], involvements: [], commit: [], total: [] }
  for (const row of set) {
    const t0 = performance.now()
    let marks
    writeBatch(database, () => {
      const a = performance.now()
      mail.saveThread(inputOf(row, Date.now(), kind))
      const b = performance.now()
      drainStems(database, stemmerCache())
      const c = performance.now()
      drainMentions(database, Date.now())
      const d = performance.now()
      drainInvolvementQueue(database)
      const e = performance.now()
      marks = { a, b, c, d, e }
    })
    const t1 = performance.now()
    out.data.push(marks.b - marks.a)
    out.stems.push(marks.c - marks.b)
    out.mentions.push(marks.d - marks.c)
    out.involvements.push(marks.e - marks.d)
    out.commit.push(t1 - marks.e)
    out.total.push(t1 - t0)
  }
  return out
}
const normalSaves = async (set, kind) => {
  const total = []
  for (const row of set) {
    const t = performance.now()
    await mail.saveThread(inputOf(row, Date.now(), kind))
    total.push(performance.now() - t)
  }
  return total
}
const phase1 = {
  knownPeopleMs: summary(peopleMs),
  nameIndexMs: summary(indexMs),
}
for (const kind of ["resave", "new"]) {
  const { k } = SIZES[kind]
  const split = splitSaves(take(k), kind)
  const normal = await normalSaves(take(k), kind)
  phase1[kind] = {
    samples: k,
    split: Object.fromEntries(Object.entries(split).map(([name, v]) => [name, summary(v)])),
    normalTotal: summary(normal),
  }
}
out(`phase1 ${JSON.stringify(phase1)}`)

// 2. A writer against a waiting process.
const waiterRun = async (mode, writer) => {
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  const child = fork(fileURLToPath(new URL("./waiter.mjs", import.meta.url)), [path, mode], {
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" },
  })
  await new Promise((resolve) => child.once("message", resolve))
  sleep(200)
  const started = performance.now()
  const stats = writer()
  const duration = performance.now() - started
  const report = new Promise((resolve) => child.once("message", resolve))
  child.send("stop")
  const waiter = await report
  return { mode, duration, ...stats, waiter }
}

const perEmail = (set, kind) => () => {
  const holds = []
  const gaps = []
  let last
  for (const row of set) {
    const t = performance.now()
    if (last !== undefined) gaps.push(t - last)
    write(database, () => mail.saveThread(inputOf(row, Date.now(), kind)))
    last = performance.now()
    holds.push(last - t)
  }
  return { transactions: holds.length, holds, gaps }
}
const sliced =
  (set, kind, size = 50, pauseMs = 100) =>
  () => {
    const holds = []
    const gaps = []
    let last
    for (let i = 0; i < set.length; i += size) {
      sleep(i === 0 ? 0 : pauseMs)
      const t = performance.now()
      if (last !== undefined) gaps.push(t - last)
      write(database, () => {
        for (const row of set.slice(i, i + size)) mail.saveThread(inputOf(row, Date.now(), kind))
      })
      last = performance.now()
      holds.push(last - t)
    }
    return { transactions: holds.length, holds, gaps }
  }

const runs = []
for (const kind of ["resave", "new"])
  for (const mode of ["sqlite", "retry"]) {
    const { n } = SIZES[kind]
    runs.push({ kind, writer: "per email", ...(await waiterRun(mode, perEmail(take(n), kind))) })
    runs.push({ kind, writer: "slices of 50, 100 ms pause", ...(await waiterRun(mode, sliced(take(n), kind))) })
  }
const phase2 = runs.map((r) => ({
  workload: r.kind,
  writer: r.writer,
  wait: r.mode,
  emails: SIZES[r.kind].n,
  totalMs: Math.round(r.duration),
  transactions: r.transactions,
  hold: summary(r.holds),
  gap: summary(r.gaps),
  waiterTries: r.waiter.waits.length + r.waiter.failures.length,
  waiterWorst: Math.max(0, ...r.waiter.waits),
  waiterMedian: pct(r.waiter.waits, 50),
  waiterFailures: r.waiter.failures,
}))
out(`phase2 ${JSON.stringify(phase2)}`)

const row = (cells) => `| ${cells.join(" | ")} |`
const lines = []
lines.push(`totals ${JSON.stringify(totals)}`)
for (const kind of ["resave", "new"]) {
  const p = phase1[kind]
  lines.push(
    "",
    `### One save, split (ms): ${kind === "resave" ? "re-save of a stored email" : "new email"}, ${p.samples} saves`,
    "",
  )
  lines.push(row(["part", "median", "p95", "max"]), row(["---", "---", "---", "---"]))
  for (const [k, v] of Object.entries(p.split)) lines.push(row([k, fmt(v.median), fmt(v.p95), fmt(v.max)]))
  lines.push(
    row([
      "normal save (write(), all drains)",
      fmt(p.normalTotal.median),
      fmt(p.normalTotal.p95),
      fmt(p.normalTotal.max),
    ]),
  )
}
lines.push(
  "",
  "### Pieces of the mention drain (ms), run alone",
  "",
  row(["part", "median", "p95", "max"]),
  row(["---", "---", "---", "---"]),
)
lines.push(
  row([
    "knownPeople()",
    fmt(phase1.knownPeopleMs.median),
    fmt(phase1.knownPeopleMs.p95),
    fmt(phase1.knownPeopleMs.max),
  ]),
)
lines.push(
  row(["nameIndex()", fmt(phase1.nameIndexMs.median), fmt(phase1.nameIndexMs.p95), fmt(phase1.nameIndexMs.max)]),
)
lines.push("", "### Writer against a waiter", "")
lines.push(
  row([
    "workload",
    "writer",
    "waiter's wait",
    "emails",
    "total",
    "transactions",
    "hold median / p95 / max (ms)",
    "gap median / p95 (ms)",
    "waiter tries",
    "waiter worst wait (ms)",
    "waiter failures",
  ]),
)
lines.push(row(Array(11).fill("---")))
for (const r of phase2)
  lines.push(
    row([
      r.workload,
      r.writer,
      r.wait === "sqlite" ? "busy_timeout 5 s" : "1 ms retry",
      r.emails,
      `${r.totalMs} ms`,
      r.transactions,
      `${fmt(r.hold.median)} / ${fmt(r.hold.p95)} / ${fmt(r.hold.max)}`,
      `${fmt(r.gap.median)} / ${fmt(r.gap.p95)}`,
      r.waiterTries,
      fmt(r.waiterWorst),
      r.waiterFailures.length,
    ]),
  )
out(lines.join("\n"))
context.database.close()
