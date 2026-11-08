#!/usr/bin/env node
import { writeFileSync } from "node:fs"
// Compares two WireCat stores read only: rows per source account and UTC day, and rows A has that B lacks.
// Usage: node gap.mjs <storeA> <storeB> [--from 2026-11-01] [--to 2026-11-08] [--detail <file>] [--json]
// A store path may be a file: URI, e.g. "file:/path/x.db?immutable=1" for a copy no process writes to.
// Exits 1 when A holds rows in the window that B lacks.
import { DatabaseSync } from "node:sqlite"

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const [pathA, pathB] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))
if (!pathA || !pathB) {
  console.error("usage: node gap.mjs <storeA> <storeB> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--detail file] [--json]")
  process.exit(2)
}
const from = Date.parse(`${opt("from", "2026-11-01")}T00:00:00Z`)
const to = Date.parse(`${opt("to", "2026-11-08")}T23:59:59.999Z`)
const DAY = 86_400_000
const out = (line) => process.stdout.write(`${line}\n`)

const open = (p) => new DatabaseSync(p.startsWith("file:") ? new URL(p) : p, { readOnly: true })

// Rows sent and stored before the window are left to the per-account totals.
const KINDS = [
  { table: "messages", cols: "id, account_id, chat_id, external_id, sent_at AS t, created_at", group: "chat" },
  {
    table: "emails",
    cols: "id, account_id, external_id, coalesce(received_at, sent_at, created_at) AS t, created_at",
    group: "mailbox",
  },
  { table: "documents", cols: "id, account_id, external_id, created_at AS t, created_at", group: "account" },
  { table: "records", cols: "id, account_id, external_id, created_at AS t, created_at", group: "account" },
  { table: "notes", cols: "id, created_at AS t, created_at", group: "store" },
  { table: "memories", cols: "id, created_at AS t, created_at", group: "store" },
  { table: "facts", cols: "id, created_at AS t, created_at", group: "store" },
  { table: "tasks", cols: "id, created_at AS t, created_at", group: "store" },
  { table: "decisions", cols: "id, created_at AS t, created_at", group: "store" },
]

const tryRun = (fn) => {
  try {
    return { ok: fn() }
  } catch (error) {
    return { error: String(error.message ?? error).split("\n")[0] }
  }
}

// Walks a table by rowid so a damaged page costs only the ids on it; returns the rows and the skipped id ranges.
function scan(db, table, cols, startId, failures) {
  const batch = db.prepare(`SELECT ${cols} FROM ${table} WHERE id > ? ORDER BY id LIMIT 500`)
  const one = db.prepare(`SELECT ${cols} FROM ${table} WHERE id > ? ORDER BY id LIMIT 1`)
  const rows = []
  let cursor = startId - 1
  for (;;) {
    let got = tryRun(() => batch.all(cursor))
    if (got.error) got = tryRun(() => one.all(cursor))
    if (got.error) {
      let skip = 1
      let next = null
      while (skip < 2 ** 40) {
        const probe = tryRun(() => one.all(cursor + skip))
        if (probe.ok) {
          next = cursor + skip
          break
        }
        skip *= 2
      }
      failures.push({ table, afterId: cursor, skippedTo: next, error: got.error })
      if (next === null) break
      cursor = next
      continue
    }
    if (got.ok.length === 0) break
    const fresh = got.ok.filter((r) => r.id > cursor)
    if (fresh.length === 0) {
      failures.push({ table, afterId: cursor, skippedTo: null, error: "rowid order broken" })
      break
    }
    rows.push(...fresh)
    cursor = fresh.at(-1).id
  }
  if (process.env.GAP_VERBOSE) console.error(`${table}: ${rows.length} rows from id ${startId}`)
  return rows
}

function load(path) {
  const db = open(path)
  const failures = []
  const accounts = new Map()
  for (const a of db.prepare("SELECT id, provider, external_id FROM accounts").all()) {
    accounts.set(a.id, { key: `${a.provider}|${a.external_id}`, provider: a.provider })
  }
  const chats = new Map()
  for (const c of scan(db, "chats", "id, account_id, external_id", 0, failures)) {
    chats.set(c.id, `${accounts.get(c.account_id)?.key}|${c.external_id}`)
  }
  const tables = {}
  for (const kind of KINDS) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(kind.table)
    if (!exists) continue
    const totals = tryRun(() =>
      kind.cols.includes("account_id")
        ? db.prepare(`SELECT account_id, count(*) n FROM ${kind.table} GROUP BY account_id`).all()
        : db.prepare(`SELECT NULL account_id, count(*) n FROM ${kind.table}`).all(),
    )
    // A full walk: on a damaged file ids are not ordered by time, so a bisect to the window start misses rows.
    const rows = scan(db, kind.table, kind.cols, 0, failures)
    const byKey = new Map()
    for (const r of rows) {
      if (r.created_at < from - DAY && r.t < from) continue
      const acct = r.account_id === undefined ? { key: "store", provider: "store" } : accounts.get(r.account_id)
      const key =
        kind.table === "messages"
          ? `${chats.get(r.chat_id)}|${r.external_id}`
          : r.external_id !== undefined
            ? `${acct?.key}|${r.external_id}`
            : `${r.id}|${r.created_at}`
      byKey.set(key, { ...r, acctKey: acct?.key ?? `account ${r.account_id}`, provider: acct?.provider })
    }
    tables[kind.table] = { kind, totals, byKey }
  }
  return { db, accounts, failures, tables }
}

const dayOf = (t) => (t < from ? "before" : t > to ? "after" : new Date(t).toISOString().slice(0, 10))

function compare(A, B) {
  const labels = new Map()
  const label = (acctKey, provider) => {
    if (!labels.has(acctKey)) {
      const n = [...labels.values()].filter((l) => l.startsWith(`${provider} `)).length + 1
      labels.set(acctKey, `${provider} ${n}`)
    }
    return labels.get(acctKey)
  }
  const summary = []
  const detail = []
  for (const [table, a] of Object.entries(A.tables)) {
    const b = B.tables[table] ?? { byKey: new Map() }
    const cells = new Map()
    const cell = (acct, provider, day) => {
      const id = `${label(acct, provider)}\t${day}`
      if (!cells.has(id)) cells.set(id, { inA: 0, inB: 0, onlyA: 0, onlyB: 0, groups: new Set() })
      return cells.get(id)
    }
    for (const [key, r] of a.byKey) {
      const c = cell(r.acctKey, r.provider, dayOf(r.t))
      c.inA++
      if (!b.byKey.has(key)) {
        c.onlyA++
        const group = groupOf(A, a.kind, r)
        c.groups.add(group)
        detail.push({
          table,
          account: label(r.acctKey, r.provider),
          day: dayOf(r.t),
          group,
          id: r.id,
          missingFrom: "B",
        })
      }
    }
    for (const [key, r] of b.byKey) {
      const c = cell(r.acctKey, r.provider, dayOf(r.t))
      c.inB++
      if (!a.byKey.has(key)) c.onlyB++
    }
    for (const [id, c] of [...cells].sort()) {
      const [account, day] = id.split("\t")
      summary.push({
        table,
        account,
        day,
        inA: c.inA,
        inB: c.inB,
        onlyA: c.onlyA,
        onlyB: c.onlyB,
        groups: c.groups.size,
      })
    }
  }
  return { summary, detail, labels }
}

function groupOf(store, kind, row) {
  if (kind.group === "chat") return `chat ${row.chat_id}`
  if (kind.group === "mailbox") {
    const boxes = tryRun(() =>
      store.db
        .prepare("SELECT mailbox_id FROM email_mailboxes WHERE email_id = ?")
        .all(row.id)
        .map((m) => m.mailbox_id),
    )
    return boxes.ok?.length ? `mailbox ${boxes.ok.join(",")}` : "mailbox ?"
  }
  return kind.group === "account" ? row.acctKey : "store"
}

const A = load(pathA)
const B = load(pathB)
const { summary, detail, labels } = compare(A, B)
const totals = (S) =>
  Object.fromEntries(
    Object.entries(S.tables).map(([t, v]) => [
      t,
      v.totals.error
        ? { error: v.totals.error }
        : Object.fromEntries(
            v.totals.ok.map((r) => [
              r.account_id === null
                ? "store"
                : (labels.get(S.accounts.get(r.account_id)?.key) ?? `account ${r.account_id}`),
              r.n,
            ]),
          ),
    ]),
  )
const report = {
  window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
  failures: { A: A.failures, B: B.failures },
  totals: { A: totals(A), B: totals(B) },
  summary,
}
if (opt("detail"))
  writeFileSync(opt("detail"), JSON.stringify({ labels: Object.fromEntries(labels), detail }, null, 1), { mode: 0o600 })
if (args.includes("--json")) {
  out(JSON.stringify(report, null, 1))
} else {
  out(`window ${report.window.from} .. ${report.window.to}; A=${pathA} B=${pathB}`)
  for (const side of ["A", "B"]) {
    for (const f of report.failures[side]) out(`unreadable in ${side}: ${f.table} after id ${f.afterId} (${f.error})`)
  }
  out("\ntable\taccount\tday\tin A\tin B\tonly A\tonly B\tgroups missing in B")
  for (const s of summary) {
    out([s.table, s.account, s.day, s.inA, s.inB, s.onlyA, s.onlyB, s.groups].join("\t"))
  }
  out("\ntotals per account (whole table)")
  for (const t of Object.keys(report.totals.A)) {
    const ta = report.totals.A[t]
    const tb = report.totals.B[t] ?? {}
    for (const acct of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
      out([t, acct, ta[acct] ?? ta.error ?? 0, tb[acct] ?? tb.error ?? 0].join("\t"))
    }
  }
}
if (summary.some((s) => s.onlyA > 0)) process.exitCode = 1
