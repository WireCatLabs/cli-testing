// The cost of one commit in cli-core's store settings (WAL, default synchronous=FULL) against NORMAL,
// on the disk BENCH_DIR is on. Writes only to its own folder.
import { mkdirSync, rmSync } from "node:fs"
import { loadavg } from "node:os"
import { DatabaseSync } from "node:sqlite"

const DIR = process.env.BENCH_DIR ?? "/tmp/commit-cost-bench"
const COMMITS = Number(process.env.COMMITS ?? 200)

const run = (synchronous) => {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  const db = new DatabaseSync(`${DIR}/store.db`)
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = ${synchronous};
    CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)`)
  const insert = db.prepare("INSERT INTO t (body) VALUES (?)")
  const times = []
  for (let i = 0; i < COMMITS; i++) {
    const start = process.hrtime.bigint()
    db.exec("BEGIN IMMEDIATE")
    for (let j = 0; j < 100; j++) insert.run("x".repeat(400))
    db.exec("COMMIT")
    times.push(Number(process.hrtime.bigint() - start) / 1e6)
  }
  db.close()
  times.sort((a, b) => a - b)
  const pick = (q) => times[Math.floor(q * (times.length - 1))].toFixed(2)
  return { synchronous, median_ms: pick(0.5), p90_ms: pick(0.9), max_ms: times.at(-1).toFixed(2) }
}

const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)

print({ load: loadavg().map((n) => n.toFixed(1)), commits: COMMITS, rows_per_commit: 100 })
for (const mode of ["FULL", "NORMAL", "FULL", "NORMAL"]) print(run(mode))
rmSync(DIR, { recursive: true, force: true })
