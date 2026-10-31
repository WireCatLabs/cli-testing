// Another command in another process: tries to take the write lock every 50 ms, writes one row, and reports how long
// each try waited. "sqlite" waits with SQLite's own busy_timeout; "retry" is cli-core 0.485.0's beginImmediate:
// busy_timeout 0 and a try every millisecond.
import { DatabaseSync } from "node:sqlite"

const [path, mode] = process.argv.slice(2)
const TIMEOUT = 5000
const db = new DatabaseSync(path)
db.exec(`PRAGMA busy_timeout = ${mode === "sqlite" ? TIMEOUT : 0}`)
const pause = new Int32Array(new SharedArrayBuffer(4))
const begin = () => {
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
const waits = []
const failures = []
let running = true
process.on("message", () => {
  running = false
})
process.send("ready")
while (running) {
  const started = performance.now()
  try {
    begin()
    waits.push(performance.now() - started)
    db.prepare("INSERT INTO bench_waiter (t) VALUES (?)").run(started)
    db.exec("COMMIT")
  } catch {
    failures.push(Math.round(performance.now() - started))
    try {
      db.exec("ROLLBACK")
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 50))
}
db.close()
process.send({ waits, failures })
process.disconnect()
