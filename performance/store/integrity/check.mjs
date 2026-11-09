// node check.mjs <store> <ledger>... — or import { check }. Runs on a fresh connection after every writer has exited.
import { readFileSync } from "node:fs"
import { args, CURRENT, emailId, loadCore, notePath } from "./lib.mjs"

const CHECK_CORE = process.env.STORE_HARNESS_CHECK_CORE ?? CURRENT

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

// Per model: the vec0 index against the rows cli-core derives from chunks and embeddings (its own `store check`
// comparison), and the vec0 table against its rowid shadow table.
const vecCheck = (db, vectorIndexCounts) =>
  attempt(() => {
    const indexes = db.prepare("SELECT id, model FROM vector_indexes ORDER BY id").all()
    if (indexes.length === 0) return { skipped: "no vector index in this store" }
    const counts = vectorIndexCounts(db).map((row, i) => {
      const table = `vector_index_${indexes[i].id}`
      const rows = db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n
      const rowids = db.prepare(`SELECT count(*) AS n FROM ${table}_rowids`).get().n
      return { ...row, rows, rowids }
    })
    const ok = counts.every((row) => row.missing === 0 && row.extra === 0 && row.rows === row.rowids)
    return { ok, indexes: counts }
  })

const ledgerLines = (files) =>
  files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  )

// Where each table's rows of one writer live, and which external ids a ledger line names.
const TABLES = {
  messages: {
    group: (line) => line.chat,
    ids: (line) => range(line).map(String),
    present: `SELECT count(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id
      WHERE c.external_id = ? AND m.external_id IN (SELECT value FROM json_each(?))`,
    held: `SELECT count(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id
      WHERE c.external_id = ? AND m.source != 'shell'`,
    heldArgs: (group) => [group],
  },
  // Rows the sqlite3 shell inserts into a seed chat, as a second SQLite build writing the same table.
  shell: {
    group: (line) => line.prefix,
    ids: (line) => range(line).map((n) => `${line.prefix}-${n}`),
    present: `SELECT count(*) AS n FROM messages WHERE source = 'shell' AND ? IS NOT NULL
      AND external_id IN (SELECT value FROM json_each(?))`,
    held: "SELECT count(*) AS n FROM messages WHERE source = 'shell' AND external_id LIKE ?",
    heldArgs: (group) => [`${group}-%`],
  },
  emails: {
    group: (line) => line.prefix,
    ids: (line) => range(line).map((n) => emailId(line.prefix, n)),
    present: `SELECT count(*) AS n FROM emails e JOIN accounts a ON a.id = e.account_id
      WHERE a.provider = 'email' AND ? IS NOT NULL AND e.external_id IN (SELECT value FROM json_each(?))`,
    held: "SELECT count(*) AS n FROM emails WHERE external_id LIKE ?",
    heldArgs: (group) => [`<${group}.%`],
  },
  notes: {
    group: (line) => line.prefix,
    ids: (line) => range(line).map((n) => notePath(line.prefix, n)),
    present: `SELECT count(*) AS n FROM documents d WHERE d.kind = 'file' AND ? IS NOT NULL
      AND d.external_id IN (SELECT value FROM json_each(?))`,
    held: "SELECT count(*) AS n FROM documents WHERE kind = 'file' AND external_id LIKE ?",
    heldArgs: (group) => [`${group}/%`],
  },
}

const range = ({ ids: [from, to] }) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

// A commit line comes after the commit; a begin line before it. A batch begun and never confirmed (its writer was
// killed) must be all there or not there at all: anything between is a transaction SQLite split.
const reconcile = (db, lines, { before = Infinity, after = -Infinity } = {}) =>
  attempt(() => {
    const out = {}
    for (const [table, spec] of Object.entries(TABLES)) {
      const count = db.prepare(spec.present)
      const present = (line) => count.get(spec.group(line), JSON.stringify(spec.ids(line))).n
      const commits = lines.filter((line) => line.table === table && line.event === undefined)
      const committedKeys = new Set(commits.map((line) => `${spec.group(line)}:${line.ids[0]}`))
      const pending = lines.filter(
        (line) =>
          line.table === table && line.event === "begin" && !committedKeys.has(`${spec.group(line)}:${line.ids[0]}`),
      )
      if (commits.length === 0 && pending.length === 0) continue
      let missing = 0
      const allowed = {}
      const lostBy = {}
      for (const line of commits) {
        allowed[spec.group(line)] = (allowed[spec.group(line)] ?? 0) + line.n
        if (line.at >= before || line.at < after) continue
        const gone = Math.max(0, line.n - present(line))
        missing += gone
        if (gone > 0) {
          const key = `${line.role}:${spec.group(line)}`
          lostBy[key] ??= { n: 0, first_at: line.at, last_at: line.at }
          const by = lostBy[key]
          by.n += gone
          by.last_at = line.at
        }
      }
      let partial = 0
      let landed = 0
      for (const line of pending) {
        const n = present(line)
        if (n > 0 && n < line.n) partial++
        if (n === line.n) landed++
        allowed[spec.group(line)] = (allowed[spec.group(line)] ?? 0) + n
      }
      let unexpected = 0
      for (const [group, n] of Object.entries(allowed)) {
        const held = db.prepare(spec.held).get(...spec.heldArgs(group)).n
        unexpected += Math.max(0, held - n)
      }
      const committed = commits.reduce((sum, line) => sum + line.n, 0)
      out[table] = {
        committed,
        missing,
        unexpected,
        killed_batches: pending.length,
        landed_after_kill: landed,
        partial,
        ...(missing > 0 ? { missing_by_writer: lostBy } : {}),
      }
    }
    const tables = Object.values(out)
    const sum = (key) => tables.reduce((total, table) => total + table[key], 0)
    return {
      ok: sum("missing") === 0 && sum("unexpected") === 0 && sum("partial") === 0,
      committed: sum("committed"),
      missing: sum("missing"),
      unexpected: sum("unexpected"),
      partial: sum("partial"),
      tables: out,
    }
  })

export const check = async (store, ledgers, options = {}) => {
  const { nodeClient } = await loadCore(CHECK_CORE, "store/drivers/node-sqlite.js")
  const { vectorIndexCounts } = await loadCore(CHECK_CORE, "store/sqlite/vector-index.js")
  let db
  try {
    db = await nodeClient(store)
  } catch (error) {
    return { verdict: "broke", open: { ok: false, error: String(error.message) } }
  }
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    const readable = attempt(() => ({ v: db.prepare("SELECT sqlite_version() AS v").get().v }))
    if (!readable.ok) return { verdict: "broke", open: { ok: false, error: readable.error } }
    const lines = ledgerLines(ledgers)
    const checks = {
      open: { ok: true },
      sqlite_version: db.prepare("SELECT sqlite_version() AS v").get().v,
      vec_version: attempt(() => ({ version: db.prepare("SELECT vec_version() AS v").get().v })).version ?? null,
      quick_check: pragma(db, "quick_check"),
      integrity_check: pragma(db, "integrity_check"),
      fts: attempt(() => ftsCheck(db)),
      vec: vecCheck(db, vectorIndexCounts),
      ledger: reconcile(db, lines, options),
      writer_errors: lines.filter((line) => line.event === "error"),
    }
    const damaged =
      !checks.quick_check.ok ||
      !checks.integrity_check.ok ||
      !checks.fts.ok ||
      !checks.vec.ok ||
      checks.ledger.unexpected > 0 ||
      checks.ledger.partial > 0 ||
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
