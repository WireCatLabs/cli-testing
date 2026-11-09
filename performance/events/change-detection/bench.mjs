#!/usr/bin/env node
// How fast does a reader learn that another process committed to a WAL-mode SQLite file?
// Compares polling PRAGMA data_version with fs.watch on the database folder (the -wal file).
// Usage: node bench.mjs [--seconds 20] [--dir /home/...]   (the folder must be on a local disk)
import { spawn } from "node:child_process"
import { mkdirSync, rmSync, watch } from "node:fs"
import { join } from "node:path"
import { argv, cpuUsage, exit, pid, stdout } from "node:process"
import { DatabaseSync } from "node:sqlite"

const print = (line = "") => stdout.write(`${line}\n`)
const now = () => performance.timeOrigin + performance.now()
const arg = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? fallback : argv[at + 1]
}

if (argv[2] === "writer") {
  const [, , , path, kind, seconds] = argv
  const db = new DatabaseSync(path)
  db.exec("PRAGMA busy_timeout = 5000")
  const end = Date.now() + Number(seconds) * 1000
  const event = db.prepare("INSERT INTO events (type, at, ref) VALUES (?, ?, ?)")
  const bulk = db.prepare("INSERT INTO filler (body) VALUES (?)")
  const blob = "x".repeat(4096)
  let n = 0
  const tick = () => {
    if (Date.now() > end) {
      db.close()
      exit(0)
    }
    if (kind === "events") {
      db.exec("BEGIN IMMEDIATE")
      event.run("task.updated", now(), `task:${++n}`)
      db.exec("COMMIT")
      setTimeout(tick, 20 + Math.random() * 180)
    } else {
      // A sync-like writer: 50 rows of 4 KB per transaction; about every 20th commit triggers a WAL checkpoint.
      db.exec("BEGIN IMMEDIATE")
      for (let i = 0; i < 50; i++) bulk.run(blob)
      db.exec("COMMIT")
      setTimeout(tick, 20)
    }
  }
  tick()
} else {
  const seconds = Number(arg("seconds", "20"))
  const root = arg("dir", join(process.env.HOME, `.cache/events-bench-${pid}`))
  const modes = ["poll-50", "poll-250", "poll-1000", "watch", "watch-settle"]
  const rows = []
  const microbench = () => {
    mkdirSync(root, { recursive: true })
    const db = new DatabaseSync(join(root, "micro.db"))
    db.exec("PRAGMA journal_mode = WAL")
    const statement = db.prepare("PRAGMA data_version")
    const count = 100_000
    const start = performance.now()
    for (let i = 0; i < count; i++) statement.get()
    const perCall = ((performance.now() - start) * 1000) / count
    db.close()
    return perCall
  }
  const percentile = (values, p) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
  }
  const runOne = (mode, load) =>
    new Promise((resolve) => {
      const dir = join(root, `${mode}-${load ? "load" : "idle"}`)
      mkdirSync(dir, { recursive: true })
      const path = join(dir, "store.db")
      const db = new DatabaseSync(path)
      db.exec("PRAGMA journal_mode = WAL")
      db.exec("CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, at REAL, ref TEXT)")
      db.exec("CREATE TABLE IF NOT EXISTS filler (id INTEGER PRIMARY KEY, body TEXT)")
      const version = db.prepare("PRAGMA data_version")
      const since = db.prepare("SELECT seq, at FROM events WHERE seq > ? ORDER BY seq")
      let last = 0
      let seen = version.get().data_version
      let wakeups = 0
      let emptyWakeups = 0
      let foundBySafetyNet = 0
      const latencies = []
      const drain = (bySafetyNet) => {
        const current = version.get().data_version
        if (current === seen) return
        seen = current
        const fresh = since.all(last)
        if (fresh.length === 0) emptyWakeups++
        const t = now()
        for (const row of fresh) {
          latencies.push(t - row.at)
          last = row.seq
          if (bySafetyNet) foundBySafetyNet++
        }
      }
      const cpuStart = cpuUsage()
      let timer
      let watcher
      let safety
      if (mode.startsWith("poll-")) {
        timer = setInterval(
          () => {
            wakeups++
            drain(false)
          },
          Number(mode.slice(5)),
        )
      } else {
        // Watch the folder, not the file: the -wal file is created and deleted with connections.
        // The -wal write can land before the writer updates the shared index, so data_version may not have moved
        // yet. "watch-settle" re-checks once, 20 ms after the last file event.
        let settle
        watcher = watch(dir, (_event, name) => {
          if (name && !name.endsWith("-wal")) return
          wakeups++
          drain(false)
          if (mode !== "watch-settle") return
          clearTimeout(settle)
          settle = setTimeout(() => drain(false), 20)
        })
        safety = setInterval(() => drain(true), 5000)
      }
      const children = [spawn(process.execPath, [import.meta.filename, "writer", path, "events", String(seconds)])]
      if (load) children.push(spawn(process.execPath, [import.meta.filename, "writer", path, "bulk", String(seconds)]))
      let left = children.length
      for (const child of children) {
        child.stderr.pipe(process.stderr)
        child.on("exit", () => {
          if (--left > 0) return
          setTimeout(() => {
            drain(true)
            clearInterval(timer)
            clearInterval(safety)
            watcher?.close()
            const cpu = cpuUsage(cpuStart)
            const walCheckpoints = db.prepare("SELECT count(*) AS n FROM filler").get().n
            db.close()
            resolve({
              mode,
              load: load ? "sync-like writer" : "idle",
              events: latencies.length,
              p50: percentile(latencies, 50),
              p95: percentile(latencies, 95),
              max: percentile(latencies, 100),
              wakeups,
              emptyWakeups,
              foundBySafetyNet,
              readerCpuMsPerMin: ((cpu.user + cpu.system) / 1000 / seconds) * 60,
              fillerRows: walCheckpoints,
            })
          }, 300)
        })
      }
    })

  const perCall = microbench()
  for (const load of [false, true]) for (const mode of modes) rows.push(await runOne(mode, load))
  const fmt = (n) => (n === null ? "—" : n.toFixed(1))
  print(
    `node ${process.version}, sqlite ${new DatabaseSync(":memory:").prepare("SELECT sqlite_version() AS v").get().v}`,
  )
  print(`PRAGMA data_version: ${perCall.toFixed(2)} µs per call (100,000 calls, prepared once)\n`)
  print(
    "| Mode | Other writers | Events | p50 ms | p95 ms | max ms | Wakeups | Empty wakeups | Found only by 5 s safety poll | Reader CPU ms/min |",
  )
  print("|---|---|---|---|---|---|---|---|---|---|")
  for (const r of rows) {
    print(
      `| ${r.mode} | ${r.load} | ${r.events} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} | ${r.wakeups} | ${r.emptyWakeups} | ${r.foundBySafetyNet} | ${r.readerCpuMsPerMin.toFixed(0)} |`,
    )
  }
  if (!arg("keep", null)) rmSync(root, { recursive: true, force: true })
}
