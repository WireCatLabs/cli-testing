// node check.mjs <store> <ledger>... — or import { check }. Runs on a fresh connection after every writer has exited.
import { readFileSync } from "node:fs"
import { args, loadCore } from "./lib.mjs"

const CHECK_CORE = process.env.STORE_HARNESS_CHECK_CORE ?? "0.608.0"

const attempt = (fn) => {
  try {
    return { ok: true, ...fn() }
  } catch (error) {
    return { ok: false, error: String(error.message).slice(0, 500) }
  }
}

const pragma = (db, name) =>
  attempt(() => {
    const rows = db
      .prepare(`PRAGMA ${name}(20)`)
      .all()
      .map((row) => Object.values(row)[0])
    return rows.length === 1 && rows[0] === "ok" ? {} : { ok: false, output: rows }
  })

const ftsTables = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%USING fts5(%' ORDER BY name")
    .all()
    .map((row) => row.name)

const ftsCheck = (db) => {
  const failed = {}
  const tables = ftsTables(db)
  for (const table of tables) {
    const result = attempt(() => db.exec(`INSERT INTO "${table}"("${table}") VALUES ('integrity-check')`))
    if (!result.ok) failed[table] = result.error
  }
  return { ok: Object.keys(failed).length === 0, tables: tables.length, failed }
}

// vec0 tables exist only once a store holds vectors; the generator writes none yet.
const vecCheck = (db) =>
  attempt(() => {
    const indexes = db.prepare("SELECT count(*) AS n FROM vector_indexes").get().n
    return indexes === 0
      ? { skipped: "no vector index in this store" }
      : { skipped: `${indexes} indexes, not checked yet` }
  })

const ledgerLines = (files) =>
  files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  )

const reconcile = (db, lines) =>
  attempt(() => {
    const commits = lines.filter((line) => line.table === "messages")
    const count = db.prepare(
      `SELECT count(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id
       WHERE c.external_id = ? AND CAST(m.external_id AS INTEGER) BETWEEN ? AND ?`,
    )
    let missing = 0
    const committed = {}
    for (const { chat, ids, n } of commits) {
      missing += Math.max(0, n - count.get(chat, ids[0], ids[1]).n)
      committed[chat] = (committed[chat] ?? 0) + n
    }
    let unexpected = 0
    for (const [chat, n] of Object.entries(committed)) {
      const held = db
        .prepare("SELECT count(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.external_id = ?")
        .get(chat).n
      unexpected += Math.max(0, held - n)
    }
    const total = Object.values(committed).reduce((a, b) => a + b, 0)
    return { ok: missing === 0 && unexpected === 0, committed: total, missing, unexpected }
  })

export const check = async (store, ledgers) => {
  const { nodeClient } = await loadCore(CHECK_CORE, "store/drivers/node-sqlite.js")
  let db
  try {
    db = await nodeClient(store)
  } catch (error) {
    return { verdict: "broke", open: { ok: false, error: String(error.message) } }
  }
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    const lines = ledgerLines(ledgers)
    const checks = {
      open: { ok: true },
      sqlite_version: db.prepare("SELECT sqlite_version() AS v").get().v,
      vec_version: attempt(() => ({ version: db.prepare("SELECT vec_version() AS v").get().v })).version ?? null,
      quick_check: pragma(db, "quick_check"),
      integrity_check: pragma(db, "integrity_check"),
      fts: attempt(() => ftsCheck(db)),
      vec: vecCheck(db),
      ledger: reconcile(db, lines),
      writer_errors: lines.filter((line) => line.event === "error"),
    }
    const damaged =
      !checks.quick_check.ok ||
      !checks.integrity_check.ok ||
      !checks.fts.ok ||
      !checks.vec.ok ||
      checks.ledger.unexpected > 0 ||
      checks.ledger.error !== undefined ||
      checks.writer_errors.some((line) => /malformed|corrupt/i.test(line.message))
    checks.verdict = damaged ? "broke" : checks.ledger.missing > 0 ? "lost" : "ok"
    return checks
  } finally {
    db.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { _: files } = args(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(await check(files[0], files.slice(1)), null, 2)}\n`)
}
