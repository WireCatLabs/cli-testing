// node writer.mjs --role <role> --core <version> --store <path> --ledger <file> [--seconds S] [--batch N] [--size bytes]
//   [--gap ms] [--reopen-every K] [--batches K] [--mark yes] [--hold commit|begin] [--hold-ms ms]
// One line per committed transaction goes to the ledger after the commit, and one "begin" line before it: the oracle
// the checks reconcile against. A batch begun and never confirmed must be in the store whole or not at all.
import { execFileSync } from "node:child_process"
import { appendFileSync, writeSync } from "node:fs"
import { DatabaseSync, StatementSync } from "node:sqlite"
import { setTimeout as sleep } from "node:timers/promises"
import { ACCOUNT, args, chatOf, emailId, embed, loadCore, MAIL_ACCOUNT, messages, noteFiles, threads } from "./lib.mjs"

const opts = args(process.argv.slice(2))
const role = opts.role
const path = opts.store
const deadline = Date.now() + Number(opts.seconds ?? 30) * 1000
const batch = Number(opts.batch ?? 50)
const size = Number(opts.size ?? 600)
const gap = Number(opts.gap ?? 20)
const reopenEvery = Number(opts["reopen-every"] ?? 10)
const batches = Number(opts.batches ?? 3)
const chat = chatOf(role, process.pid)
const prefix = `${role}${process.pid}`

// cli-core runs every write transaction through DatabaseSync#exec("BEGIN IMMEDIATE") ... exec("COMMIT"). Wrapping
// exec lets the runner see the transaction from outside and kill the process inside it, without changing cli-core.
if (opts.mark === "yes" || opts.hold) {
  const hold = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  const exec = DatabaseSync.prototype.exec
  DatabaseSync.prototype.exec = function (sql) {
    if (sql === "COMMIT") {
      writeSync(1, "MARK commit\n")
      if (opts.hold === "commit") hold(Number(opts["hold-ms"] ?? 200))
    }
    const out = exec.call(this, sql)
    if (sql === "BEGIN IMMEDIATE") {
      writeSync(1, "MARK begin\n")
      if (opts.hold === "begin") hold(Number(opts["hold-ms"] ?? 200))
    }
    return out
  }
}

// Every SQLite error as SQLite raised it, before cli-core's own handling can replace it with another one.
if (opts["trace-errors"] === "yes") {
  const traced = (target, name) => {
    const call = target[name]
    target[name] = function (...input) {
      try {
        return call.apply(this, input)
      } catch (error) {
        const sql = name === "exec" ? String(input[0]).slice(0, 80) : String(this.sourceSQL ?? "").slice(0, 80)
        // cli-core retries BEGIN IMMEDIATE itself while another process writes; those are expected.
        if (sql === "BEGIN IMMEDIATE") throw error
        appendFileSync(
          opts.ledger,
          `${JSON.stringify({ at: Date.now(), pid: process.pid, role, event: "sqlite-error", errcode: error.errcode ?? null, message: String(error.message).slice(0, 200), sql })}\n`,
        )
        throw error
      }
    }
  }
  traced(DatabaseSync.prototype, "exec")
  for (const name of ["run", "get", "all"]) traced(StatementSync.prototype, name)
}

const RAW = new Set(["checkpoint", "sqlite3", "sqlite3-write", "optimize", "long-read"])
const { openStore } = RAW.has(role) ? {} : await loadCore(opts.core, "store/index.js")

const record = (line) =>
  appendFileSync(opts.ledger, `${JSON.stringify({ at: Date.now(), pid: process.pid, role, ...line })}\n`)
const open = (readOnly = false) => openStore({ path, readOnly, command: `harness-${role}`, warn: () => {} })

const committed = async (line, work) => {
  record({ event: "begin", ...line })
  if (opts.mark === "yes" || opts.hold) writeSync(1, "MARK batch\n")
  await work()
  record(line)
}

let next = 1
const write = async (store, via) => {
  const from = next
  next += batch
  await committed({ table: "messages", chat, ids: [from, next - 1], n: batch, via }, () =>
    store.messages.saveMessages(ACCOUNT, chat, messages(chat, from, batch, size), { via }),
  )
}

const jitter = () => sleep(gap * (0.5 + Math.random()))

const roles = {
  // A sync timer: every run is its own open and close, so any of them can be the last closer that checkpoints.
  sync: async () => {
    while (Date.now() < deadline) {
      const store = await open()
      await write(store, "sync")
      await store.close()
      await jitter()
    }
  },
  // A long-lived server: one open for its life, and a second open now and then, as `withStore` did before P2.
  serve: async () => {
    const main = await open()
    record({ event: "opened" })
    for (let i = 1; Date.now() < deadline; i++) {
      await write(main, "serve")
      if (i % reopenEvery === 0) {
        const second = await open()
        await write(second, "serve-second")
        await second.close()
      }
      await sleep(gap)
    }
    await main.close()
  },
  // `tg sync` / `max sync`: one open per run, a few pages of messages, then the embed step, then close.
  tg: async () => {
    let after = 0
    while (Date.now() < deadline) {
      const store = await open()
      for (let i = 0; i < batches && Date.now() < deadline; i++) await write(store, "tg-sync")
      after = (await embed.messages(store, ACCOUNT, after)).after
      await store.close()
      await jitter()
    }
  },
  // `mail sync`: slices of threads saved with their resume point in one transaction, mail gone at the source marked
  // deleted (the contentless FTS5 delete path), then the embed step.
  mail: async () => {
    while (Date.now() < deadline) {
      const store = await open()
      const accountId = await store.accounts.saveAccount(MAIL_ACCOUNT, { name: MAIL_ACCOUNT.account })
      for (let i = 0; i < batches && Date.now() < deadline; i++) {
        const from = next
        next += batch
        const line = { table: "emails", prefix, ids: [from, next - 1], n: batch }
        const state = { accountId, name: `harness:${prefix}`, value: JSON.stringify({ done: next - 1 }) }
        await committed(line, () =>
          store.mail.saveThreads(threads(accountId, prefix, from, batch, size, Date.now()), [state]),
        )
      }
      if (next > batch * 2) {
        const gone = Array.from({ length: Math.ceil(batch / 10) }, () => 1 + Math.floor(Math.random() * (next - 1)))
        await store.mail.markDeleted(
          accountId,
          gone.map((n) => emailId(prefix, n)),
          Date.now(),
        )
      }
      await embed.mail(store)
      await store.close()
      await jitter()
    }
  },
  // `memo import`: one transaction per file note, then the embed step.
  memo: async () => {
    let folderId
    while (Date.now() < deadline) {
      const store = await open()
      folderId ??= (await store.notes.addFolder({ name: prefix })).id
      for (let i = 0; i < batches && Date.now() < deadline; i++) {
        const from = next
        next += batch
        for (const [k, file] of noteFiles(folderId, prefix, from, batch, size).entries())
          await committed({ table: "notes", prefix, ids: [from + k, from + k], n: 1 }, () =>
            store.notes.saveFileNote(file),
          )
      }
      await embed.notes(store)
      await store.close()
      await jitter()
    }
  },
  // `quiesce` before a restore, or memo `erase`: a checkpoint that copies the WAL back and truncates it.
  checkpoint: async () => {
    const db = new DatabaseSync(path)
    db.exec("PRAGMA busy_timeout = 5000")
    while (Date.now() < deadline) {
      writeSync(1, "MARK checkpoint\n")
      const [row] = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").all()
      record({ event: "checkpoint", ...row })
      await jitter()
    }
    db.close()
  },
  // Someone looking at the store with the sqlite3 shell. On this machine its SQLite (3.46.1) deletes -wal and -shm
  // when its close finds no other lock on the database file; Node's 3.53.3 left them in place in the same spot.
  sqlite3: async () => {
    record({ event: "version", sqlite3: execFileSync("sqlite3", ["--version"], { encoding: "utf8" }).split(" ")[0] })
    while (Date.now() < deadline) {
      execFileSync("sqlite3", ["-cmd", ".timeout 5000", path, "SELECT count(*) FROM messages;"], { stdio: "ignore" })
      await jitter()
    }
  },
  // The sqlite3 shell writing rows itself: a second SQLite build (3.46.1) in the same table and the same triggers.
  "sqlite3-write": async () => {
    while (Date.now() < deadline) {
      const from = next
      next += batch
      const sql = `INSERT INTO messages (chat_id, account_id, external_id, sent_at, text, outgoing, created_at, source,
        updated_at) SELECT c.id, c.account_id, '${prefix}-' || r.n, r.n, 'shell kilo lima ' || r.n, 0, r.n, 'shell', r.n
        FROM chats c, (WITH RECURSIVE r(n) AS (SELECT ${from} UNION ALL SELECT n + 1 FROM r WHERE n < ${next - 1})
        SELECT n FROM r) r WHERE c.external_id = 'seed-0';`
      await committed({ table: "shell", prefix, ids: [from, next - 1], n: batch }, async () =>
        execFileSync("sqlite3", ["-cmd", ".timeout 5000", path, sql], { stdio: ["ignore", "ignore", "pipe"] }),
      )
      await jitter()
    }
  },
  // FTS5 `optimize` on every full-text table, from a fifth process while mail writers insert and delete (T14).
  optimize: async () => {
    const db = new DatabaseSync(path)
    db.exec("PRAGMA busy_timeout = 5000")
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%USING fts5(%' ORDER BY name")
      .all()
      .map(({ name }) => name)
    while (Date.now() < deadline) {
      for (const table of tables) db.exec(`INSERT INTO "${table}"("${table}") VALUES ('optimize')`)
      record({ event: "optimized", tables: tables.length })
      await jitter()
    }
    db.close()
  },
  // A reader that keeps one read transaction open for `--hold-s` seconds, as cli-core's read-only open does
  // (query_only), so no checkpoint can reset the WAL behind it (T16).
  "long-read": async () => {
    const db = new DatabaseSync(path, { readOnly: true })
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA query_only = ON")
    while (Date.now() < deadline) {
      db.exec("BEGIN")
      const { n } = db.prepare("SELECT count(*) AS n FROM messages").get()
      record({ event: "read-begin", n })
      await sleep(Math.min(Number(opts["hold-s"] ?? 20) * 1000, Math.max(0, deadline - Date.now())))
      db.exec("COMMIT")
      record({ event: "read-end" })
      await jitter()
    }
    db.close()
  },
  reader: async () => {
    while (Date.now() < deadline) {
      const store = await open(true)
      await store.accounts.accounts()
      await store.close()
      await jitter()
    }
  },
}

try {
  await roles[role]()
  record({ event: "done" })
} catch (error) {
  const where = String(error.stack ?? "")
    .split("\n")
    .filter((line) => line.includes("cli-core/dist"))
    .slice(0, 4)
    .map((line) => line.replace(/.*cli-core\/dist\//, "").replace(/\)$/, ""))
  record({
    event: "error",
    code: error.code ?? null,
    errcode: error.errcode ?? null,
    message: String(error.message).slice(0, 300),
    where,
  })
  process.exitCode = 1
}
