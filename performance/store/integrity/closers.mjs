// node closers.mjs [folder] — which program's close deletes -wal and -shm while another process still has the store
// open (FIND-2409). For every closer, twice: once after the holder lost its locks to a writeFileSync on the store path
// (the 2026-11-06 bug), once with its locks kept. No cli-core; needs the sqlite3 shell, and bun if it is on PATH.
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const node = (path, sql) =>
  `const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(${JSON.stringify(path)});db.exec("PRAGMA busy_timeout=5000");${sql};db.close()`

const CLOSERS = {
  "node-open": (path) => [process.execPath, ["--no-warnings", "-e", node(path, "")]],
  "node-read": (path) => [
    process.execPath,
    ["--no-warnings", "-e", node(path, `db.prepare("SELECT count(*) FROM b").get()`)],
  ],
  "node-write": (path) => [
    process.execPath,
    ["--no-warnings", "-e", node(path, `db.exec("INSERT INTO b(body) VALUES ('n')")`)],
  ],
  "node-write-passive": (path) => [
    process.execPath,
    [
      "--no-warnings",
      "-e",
      node(path, `db.exec("INSERT INTO b(body) VALUES ('n')");db.exec("PRAGMA wal_checkpoint(PASSIVE)")`),
    ],
  ],
  "node-write-truncate": (path) => [
    process.execPath,
    [
      "--no-warnings",
      "-e",
      node(path, `db.exec("INSERT INTO b(body) VALUES ('n')");db.exec("PRAGMA wal_checkpoint(TRUNCATE)")`),
    ],
  ],
  "bun-write": (path) => [
    "bun",
    [
      "-e",
      `import {Database} from "bun:sqlite";const db=new Database(${JSON.stringify(path)});db.exec("INSERT INTO b(body) VALUES ('bun')");db.close()`,
    ],
  ],
  "sqlite3-read": (path) => ["sqlite3", [path, "SELECT count(*) FROM b;"]],
  "sqlite3-write": (path) => ["sqlite3", [path, "INSERT INTO b(body) VALUES ('cli');"]],
}

const has = (program) => spawnSync(program, ["--version"], { stdio: "ignore" }).status === 0
const version = (program, argv) => spawnSync(program, argv, { encoding: "utf8" }).stdout.trim().split(" ")[0]

const trial = (dir, closer, dropLocks) => {
  const path = join(dir, `${closer}-${dropLocks ? "dropped" : "kept"}.db`)
  const holder = new DatabaseSync(path)
  holder.exec(
    "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE a(id INTEGER PRIMARY KEY, body TEXT); CREATE TABLE b(id INTEGER PRIMARY KEY, body TEXT); INSERT INTO a(body) VALUES ('x')",
  )
  if (dropLocks) writeFileSync(path, "", { flag: "a" })
  const [program, argv] = CLOSERS[closer](path)
  execFileSync(program, argv, { stdio: ["ignore", "ignore", "inherit"] })
  const wal = existsSync(`${path}-wal`)
  const shm = existsSync(`${path}-shm`)
  holder.close()
  return { closer, holder_locks: dropLocks ? "dropped" : "kept", wal_after_close: wal, shm_after_close: shm }
}

const base = process.env.STORE_HARNESS_DIR ?? "/var/tmp/claude/store-harness"
mkdirSync(base, { recursive: true })
const dir = process.argv[2] ?? mkdtempSync(join(base, "closers-"))
const closers = Object.keys(CLOSERS).filter((closer) => !closer.startsWith("bun") || has("bun"))
const runtimes = {
  node: process.version,
  node_sqlite: new DatabaseSync(":memory:").prepare("SELECT sqlite_version() AS v").get().v,
  sqlite3_shell: version("sqlite3", ["--version"]),
  bun: has("bun") ? version("bun", ["--version"]) : null,
}
process.stdout.write(`${JSON.stringify(runtimes)}\n`)
for (const dropLocks of [true, false])
  for (const closer of closers) process.stdout.write(`${JSON.stringify(trial(dir, closer, dropLocks))}\n`)
process.stdout.write(`${JSON.stringify({ folder: dir })}\n`)
