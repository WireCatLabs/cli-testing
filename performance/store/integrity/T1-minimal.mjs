// node T1-minimal.mjs [folder] — the 2026-11-06 reproduction in a dozen lines, no cli-core: one process loses its
// SQLite locks to a writeFileSync on the store path, the sqlite3 shell's close deletes -wal and -shm, and the first
// process's later checkpoint copies stale pages over the file. Needs the sqlite3 shell on PATH.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const base = process.env.STORE_HARNESS_DIR ?? "/var/tmp/claude/store-harness"
mkdirSync(base, { recursive: true })
const dir = process.argv[2] ?? mkdtempSync(join(base, "t1-minimal-"))
const path = join(dir, "store.db")
const other = (sql) =>
  execFileSync(
    process.execPath,
    [
      "--no-warnings",
      "-e",
      `const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(${JSON.stringify(path)});db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL");${sql};db.close()`,
    ],
    { encoding: "utf8" },
  )

const db = new DatabaseSync(path)
db.exec(
  "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE a(id INTEGER PRIMARY KEY, body TEXT); CREATE TABLE b(id INTEGER PRIMARY KEY, body TEXT); INSERT INTO a(body) VALUES ('x')",
)
writeFileSync(path, "", { flag: "a" })
execFileSync("sqlite3", [path, "INSERT INTO b(body) VALUES ('cli');"])
db.exec("INSERT INTO a(body) VALUES ('stale')")
other(`for (let i=0;i<3000;i++) db.exec("INSERT INTO b(body) VALUES (hex(randomblob(2000)))")`)
for (let i = 0; i < 1500; i++) db.exec("INSERT INTO a(body) VALUES (hex(randomblob(2000)))")
db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
db.close()
process.stdout.write(`${path}\n`)
process.stdout.write(
  `${other(`console.log(JSON.stringify(db.prepare("PRAGMA quick_check(5)").all().map((r) => r.quick_check)))`)}\n`,
)
