// The "300 new emails" case through cli-core's real MailStore.saveThreads, in slices of 50 with a 100 ms pause, as
// src/mail/sync.ts does. Offline, on a copy of a real store.
//   node save-threads.mjs <cli-core checkout with dist> <store copy> [new emails per run, 300]
import { fork } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [core, path, count = "300"] = process.argv.slice(2)
const N = Number(count)
const SLICE = 50
const PAUSE_MS = 100
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openStoreContext } = await load("store/sqlite/open-store.js")
const { mailStoreOver } = await load("store/sqlite/emails.js")

const context = await openStoreContext({ path, command: "lock-bench", version: "0.0.0" })
const counts = { drains: 0, rebuilds: 0 }
const database = new Proxy(context.database, {
  get: (target, key) =>
    key === "prepare"
      ? (sql) => {
          if (sql.startsWith("SELECT source_type, source_id FROM mention_pending")) counts.drains++
          if (sql.startsWith("WITH met AS")) counts.rebuilds++
          return target.prepare(sql)
        }
      : typeof target[key] === "function"
        ? target[key].bind(target)
        : target[key],
})
const mail = mailStoreOver({ database, orm: context.orm, now: Date.now })
database.exec("CREATE TABLE IF NOT EXISTS bench_waiter (t REAL)")

const rows = database
  .prepare(
    `SELECT e.account_id, e.subject, e.from_address, e.from_name, e.sent_at, e.body_text
       FROM emails e WHERE coalesce(e.body_text,'') <> '' AND e.from_address IS NOT NULL AND e.deleted_at IS NULL
      ORDER BY e.id DESC LIMIT ?`,
  )
  .all(2 * N)
let serial = 0
let cursor = 0
const take = () => {
  cursor += N
  return rows.slice(cursor - N, cursor)
}
const inputOf = (row) => ({
  accountId: Number(row.account_id),
  externalId: `bench-st-thread-${serial}@lock-bench.invalid`,
  now: Date.now(),
  emails: [
    {
      externalId: `bench-st-${serial++}@lock-bench.invalid`,
      subject: row.subject === null ? null : String(row.subject),
      from: { address: String(row.from_address), name: row.from_name === null ? null : String(row.from_name) },
      sentAt: row.sent_at === null ? null : Number(row.sent_at),
      bodyText: String(row.body_text),
    },
  ],
})
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const out = (text) => process.stdout.write(`${text}\n`)

const run = async (mode) => {
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  const child = fork(fileURLToPath(new URL("./waiter.mjs", import.meta.url)), [path, mode], {
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" },
  })
  await new Promise((resolve) => child.once("message", resolve))
  sleep(200)
  const set = take()
  counts.drains = 0
  counts.rebuilds = 0
  const holds = []
  const started = performance.now()
  for (let i = 0; i < set.length; i += SLICE) {
    if (i > 0) sleep(PAUSE_MS)
    const t = performance.now()
    await mail.saveThreads(set.slice(i, i + SLICE).map(inputOf), [
      { accountId: Number(set[i].account_id), name: "bench:progress", value: String(i) },
    ])
    holds.push(performance.now() - t)
  }
  const total = performance.now() - started
  const report = new Promise((resolve) => child.once("message", resolve))
  child.send("stop")
  const waiter = await report
  return {
    wait: mode === "sqlite" ? "busy_timeout 5 s" : "1 ms retry",
    emails: N,
    totalMs: Math.round(total),
    transactions: holds.length,
    drains: counts.drains,
    nameIndexRebuilds: counts.rebuilds,
    hold: { median: pct(holds, 50), max: Math.max(...holds) },
    waiterTries: waiter.waits.length + waiter.failures.length,
    waiterWorst: Math.max(0, ...waiter.waits),
    waiterFailures: waiter.failures.length,
  }
}
const results = [await run("sqlite"), await run("retry")]
const fmt = (x) => (x < 10 ? x.toFixed(2) : String(Math.round(x)))
out(
  "| waiter's wait | emails | total | transactions | mention drains | name index rebuilds | hold median / max (ms) | waiter tries | waiter worst wait (ms) | waiter failures |",
)
out(`|${Array(10).fill(" --- ").join("|")}|`)
for (const r of results)
  out(
    `| ${r.wait} | ${r.emails} | ${r.totalMs} ms | ${r.transactions} | ${r.drains} | ${r.nameIndexRebuilds} | ${fmt(r.hold.median)} / ${fmt(r.hold.max)} | ${r.waiterTries} | ${fmt(r.waiterWorst)} | ${r.waiterFailures} |`,
  )
context.database.close()
