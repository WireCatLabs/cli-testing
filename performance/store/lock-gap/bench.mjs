// One write against a process that writes in a loop: how long it waits for the lock, by the pause the loop leaves
// after each commit and by how the write waits. "retry" is cli-core's beginImmediate (busy_timeout 0, a try every
// millisecond); "sqlite" is SQLite's own busy_timeout. A write that waits 5 s gives up with "database is locked".
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const runs = Number(process.argv[2] ?? 10)
const gaps = (process.argv[3] ?? "0,0.3,2").split(",").map(Number)
const modes = ["retry", "sqlite"]
const HOLD_MS = 20
const TIMEOUT = 5000

const holderScript = (path, gap) => `import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(${JSON.stringify(path)})
db.exec("PRAGMA busy_timeout = 5000")
console.log("ready")
const end = Date.now() + 9000
while (Date.now() < end) {
  db.exec("BEGIN IMMEDIATE")
  const stop = performance.now() + ${HOLD_MS}
  while (performance.now() < stop);
  db.exec("COMMIT")
  const next = performance.now() + ${gap}
  while (performance.now() < next);
}
`

const pause = new Int32Array(new SharedArrayBuffer(4))
const begin = (db, mode) => {
  if (mode === "sqlite") return db.exec("BEGIN IMMEDIATE")
  const deadline = Date.now() + TIMEOUT
  for (;;) {
    try {
      return db.exec("BEGIN IMMEDIATE")
    } catch (error) {
      if (Date.now() >= deadline) throw error
      Atomics.wait(pause, 0, 0, 1)
    }
  }
}

const once = async (gap, mode) => {
  const dir = mkdtempSync(join(tmpdir(), "lock-gap-"))
  const path = join(dir, "store.db")
  const db = new DatabaseSync(path)
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE t (v INTEGER)")
  db.exec(`PRAGMA busy_timeout = ${mode === "sqlite" ? TIMEOUT : 0}`)
  writeFileSync(join(dir, "holder.mjs"), holderScript(path, gap))
  const holder = spawn(process.execPath, [join(dir, "holder.mjs")], { stdio: ["ignore", "pipe", "inherit"] })
  try {
    await new Promise((resolve) => holder.stdout.once("data", resolve))
    await new Promise((resolve) => setTimeout(resolve, 200))
    const started = performance.now()
    try {
      begin(db, mode)
      db.prepare("INSERT INTO t (v) VALUES (1)").run()
      db.exec("COMMIT")
      return performance.now() - started
    } catch {
      return Number.POSITIVE_INFINITY
    }
  } finally {
    holder.kill()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
const say = (line) => process.stdout.write(`${line}\n`)
const shown = (ms) => (Number.isFinite(ms) ? `${Math.round(ms)}` : "failed")

say(`| pause after commit | write waits with | median ms | p90 ms | worst ms | over 1 s | failed (5 s) |`)
say(`|---|---|---|---|---|---|---|`)
for (const gap of gaps)
  for (const mode of modes) {
    const waits = []
    for (let i = 0; i < runs; i++) waits.push(await once(gap, mode))
    waits.sort((a, b) => a - b)
    const over = waits.filter((ms) => ms > 1000).length
    const failed = waits.filter((ms) => !Number.isFinite(ms)).length
    say(
      `| ${gap} ms | ${mode} | ${shown(quantile(waits, 0.5))} | ${shown(quantile(waits, 0.9))} | ` +
        `${shown(waits.at(-1))} | ${over}/${runs} | ${failed}/${runs} |`,
    )
  }
