// node refill.mjs <run folder> --core <version> [--cut <message id>] [--runs N]
// After `store recover run`, do ordinary syncs from a service that still holds every committed message bring back the
// rows the damage took? A copy of the broken store a run kept gets the coverage a whole sync of each chat would have
// left, and a deep check that passed at the send time of message `--cut` plus a day; cli-core's recoverStore runs on it,
// then up to `--runs` ordinary syncs per chat (cli-core's own fetchInto, 1000 messages a run) read a fake history made
// of the ledgers. The kept file is never written to.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { ACCOUNT, args, installCore, loadCore, messages } from "./lib.mjs"

const DAY = 86_400_000
const opts = args(process.argv.slice(2))
const [runDir] = opts._
const core = opts.core
const cut = Number(opts.cut ?? 15000)
const maxRuns = Number(opts.runs ?? 20)
if (!core) throw new Error("--core <version> is required")
const kept = join(runDir, "kept")
if (!existsSync(join(kept, "wirecat.db"))) throw new Error(`${runDir} kept no broken store`)

installCore(core)
const { recoverStore } = await loadCore(core, "store/recover.js")
const { openStore } = await loadCore(core, "store/index.js")
const { FETCHING, fetchInto } = await loadCore(core, "services/archive.js")

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = join(runDir, `refill-${core}-cut${cut}-${stamp}`)
mkdirSync(dir)
const store = join(dir, "wirecat.db")
for (const part of ["", "-wal", "-shm"])
  if (existsSync(join(kept, `wirecat.db${part}`))) copyFileSync(join(kept, `wirecat.db${part}`), store + part)

// Committed message ids per chat, from every writer's ledger and the seed's.
const committed = new Map()
for (const file of readdirSync(join(runDir, "ledgers")).filter((name) => name.endsWith(".jsonl")))
  for (const line of readFileSync(join(runDir, "ledgers", file), "utf8")
    .split("\n")
    .filter(Boolean)) {
    const entry = JSON.parse(line)
    if (entry.table !== "messages" || entry.event !== undefined) continue
    const ids = committed.get(entry.chat) ?? new Set()
    for (let id = entry.ids[0]; id <= entry.ids[1]; id++) ids.add(id)
    committed.set(entry.chat, ids)
  }
const sentAt = (id) => Date.UTC(2026, 0, 1) + id * 1000

// What a sync of each whole chat leaves: one held stretch from its first message to its newest, and the start mark.
const coverage = { chats: 0, failed: [] }
{
  const db = new DatabaseSync(store)
  for (const [chat, ids] of committed) {
    try {
      const row = db.prepare("SELECT id, account_id FROM chats WHERE external_id = ?").get(chat)
      if (!row) {
        coverage.failed.push({ chat, error: "chat row gone" })
        continue
      }
      const sorted = [...ids].sort((a, b) => a - b)
      const now = Date.now()
      db.prepare(
        "INSERT OR REPLACE INTO sync_ranges (chat_id, from_key, to_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(row.id, sorted[0], sorted.at(-1), now, now)
      db.prepare(
        "INSERT OR REPLACE INTO sync_cursors (account_id, key, value, updated_at, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(row.account_id, `history_start:${chat}`, String(sorted[0]), now, now)
      coverage.chats++
    } catch (error) {
      coverage.failed.push({ chat, error: String(error.message).slice(0, 120) })
    }
  }
  db.close()
}
const lastOk = new Date(sentAt(cut) + DAY).toISOString()
writeFileSync(
  `${store}.health.json`,
  JSON.stringify({ checked_at: lastOk, ok: true, problems: 0, schema: null, cli: "harness", last_ok_at: lastOk }),
)

const missing = (path) => {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const out = { before_cut: 0, after_cut: 0, by_chat: {} }
    for (const [chat, ids] of committed) {
      const held = new Set(
        db
          .prepare(
            "SELECT m.external_id AS id FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.external_id = ?",
          )
          .all(chat)
          .map((row) => Number(row.id)),
      )
      let before = 0
      let after = 0
      const gone = []
      for (const id of [...ids].sort((a, b) => a - b)) {
        if (held.has(id)) continue
        id < cut ? before++ : after++
        const last = gone.at(-1)
        if (last && last[1] === id - 1) last[1] = id
        else gone.push([id, id])
      }
      out.before_cut += before
      out.after_cut += after
      if (before + after > 0) out.by_chat[chat] = { before_cut: before, after_cut: after, ids: gone, of: ids.size }
    }
    return out
  } finally {
    db.close()
  }
}

let recovery
try {
  recovery = await recoverStore({ path: store, command: "harness" })
} catch (error) {
  recovery = { error: String(error.message), reason: error.details?.reason ?? null }
}
const afterRecovery = recovery.error ? null : missing(store)

// The service: every committed message, newest first below `before`, as a messenger's history answers.
const history = (chat, opened) => {
  const ids = [...(committed.get(chat) ?? [])].sort((a, b) => a - b)
  return async ({ limit, before }) => {
    const older = ids.filter((id) => before === undefined || id < Number(before))
    const page = older.slice(-limit)
    const items = page.flatMap((id) => messages(chat, id, 1, 600)).reverse()
    await opened.messages.saveMessages(ACCOUNT, chat, items, { via: "history" })
    return { items, hasMore: older.length > page.length }
  }
}
const runs = []
if (!recovery.error) {
  for (let run = 1; run <= maxRuns; run++) {
    const opened = await openStore({ path: store, command: "harness-sync", warn: () => {} })
    let fetched = 0
    let requests = 0
    try {
      for (const chat of committed.keys()) {
        const one = await fetchInto({
          history: history(chat, opened),
          store: opened,
          account: ACCOUNT,
          fetching: FETCHING,
          limit: 1000,
          pageSize: 100,
          pauseMs: 0,
          note: () => {},
          stop: new AbortController().signal,
          onPage: () => {},
          onRequest: () => requests++,
        })
        fetched += one.fetched
      }
    } finally {
      await opened.close()
    }
    const left = missing(store)
    runs.push({ run, requests, fetched, missing_before_cut: left.before_cut, missing_after_cut: left.after_cut })
    if (left.after_cut === 0) break
  }
}

const result = {
  run: runDir,
  core,
  cut: { message_id: cut, sent_at: new Date(sentAt(cut)).toISOString(), last_ok_at: lastOk },
  committed: [...committed.values()].reduce((sum, ids) => sum + ids.size, 0),
  coverage,
  recovery: recovery.error
    ? recovery
    : { lost: recovery.lost, refetch: recovery.refetch ?? "not in this cli-core", health_ok: recovery.health.ok },
  missing_after_recovery: afterRecovery,
  syncs: runs,
}
writeFileSync(join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({ ...result, missing_after_recovery: { ...afterRecovery, by_chat: undefined } })}\n`,
)
