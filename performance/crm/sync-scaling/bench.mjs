// CRM sync scaling on synthetic data: cli-core's own syncCrm over its in-memory fake CRM, into a fresh temp store.
// Offline: no network, no account, no CLI run.
//   node bench.mjs <cli-core checkout with dist> <N> [store dir]
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [core, size, dir] = process.argv.slice(2)
const N = Number(size)
if (!core || !N) throw new Error("usage: node bench.mjs <cli-core checkout with dist> <N> [store dir]")
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openStore } = await load("store/store.js")
const { syncCrm } = await load("crm/sync.js")
const { fakeCrmSource } = await load("crm/testing/index.js")

const prepared = new Set()
const prepare = DatabaseSync.prototype.prepare
DatabaseSync.prototype.prepare = function (sql, ...rest) {
  prepared.add(sql)
  return prepare.call(this, sql, ...rest)
}

const PORTAL = { provider: "example-crm", account: "bench.example.test" }
const USERS = Number(process.env.CRM_SCALE_USERS ?? 10)
const COMPANIES = Math.max(1, Math.floor(N / 10))
const LEADS = Math.floor(N / 2)
const NOW = Date.parse("2026-11-01T12:00:00Z")

const source = fakeCrmSource({ pageSize: 50 })
const users = Array.from({ length: USERS }, (_, n) => ({
  externalId: `u${n}`,
  name: `User ${n}`,
  email: `user${n}@bench.example.test`,
  active: true,
}))
source.users = async () => users
source.departments = async () => []
for (let n = 0; n < COMPANIES; n++) source.put("organization", { externalId: `c${n}`, name: `Company ${n}` })
for (let n = 0; n < N; n++)
  source.put("person", {
    externalId: `p${n}`,
    name: `Person ${n}`,
    email: `person${n}@example.test`,
    organizations: [{ externalId: `c${n % COMPANIES}` }],
  })
const item = (kind, n, people) => ({
  externalId: `${kind}${n}`,
  title: `Synthetic ${kind} ${n}`,
  pipeline: kind === "deal" ? "deal-1" : "lead-1",
  stage: kind === "deal" ? "new" : "lead-new",
  amount: "100.00",
  currency: "EUR",
  organization: `c${n % COMPANIES}`,
  people,
  assignee: `u${n % USERS}`,
  createdAt: NOW - n * 60_000,
  updatedAt: NOW - n * 60_000,
})
for (let n = 0; n < N; n++)
  source.put(
    "deal",
    item("deal", n, [
      { externalId: `p${n}`, role: "contact", primary: true },
      { externalId: `p${(n + 1) % N}`, role: "decision-maker" },
    ]),
  )
for (let n = 0; n < LEADS; n++)
  source.put("lead", item("lead", n, [{ externalId: `p${(n * 2) % N}`, role: "contact" }]))

const path = join(dir ?? mkdtempSync(join(tmpdir(), "crm-scale-")), `crm-${N}.db`)
const store = await openStore({ path })

let peak = 0
const sampler = setInterval(() => {
  peak = Math.max(peak, process.memoryUsage().rss)
}, 50)

const pages = []
const saveItems = store.crm.saveItems.bind(store.crm)
store.crm.saveItems = async (key, kind, items, options) => {
  const began = performance.now()
  const done = await saveItems(key, kind, items, options)
  peak = Math.max(peak, process.memoryUsage().rss)
  pages.push({ kind, items: items.length, ms: performance.now() - began })
  return done
}

const perItem = (kind, from, to) => {
  const slice = pages.filter((page) => page.kind === kind)
  const part = slice.slice(Math.floor(slice.length * from), Math.ceil(slice.length * to))
  const ms = part.reduce((sum, page) => sum + page.ms, 0)
  const items = part.reduce((sum, page) => sum + page.items, 0)
  return items ? Number((ms / items).toFixed(3)) : null
}

const run = async (label, options) => {
  pages.length = 0
  const began = performance.now()
  const report = await syncCrm(source, store, PORTAL, { now: NOW, ...options })
  const seconds = (performance.now() - began) / 1000
  return {
    run: label,
    seconds: Number(seconds.toFixed(2)),
    complete: report.complete,
    issues: [...new Set(report.issues.map((one) => one.reason))],
    dealMsFirstTenth: perItem("deal", 0, 0.1),
    dealMsLastTenth: perItem("deal", 0.9, 1),
    leadMsFirstTenth: perItem("lead", 0, 0.1),
    leadMsLastTenth: perItem("lead", 0.9, 1),
  }
}

const results = [await run("first"), await run("rescan", { rescan: true })]
clearInterval(sampler)
await store.close()
DatabaseSync.prototype.prepare = prepare

const database = new DatabaseSync(path, { readOnly: true })
const count = (table) => Number(database.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)
const TABLES = "links|deals|leads|records|identities|identity_links|persons"
const plans = []
for (const sql of prepared) {
  const trimmed = sql.trim()
  if (trimmed.length > 1000 || !/^(SELECT|UPDATE|DELETE|INSERT)/i.test(trimmed)) continue
  if (!new RegExp(`\\b(${TABLES}|proposed_actions)\\b`).test(trimmed)) continue
  let rows
  try {
    rows = database.prepare(`EXPLAIN QUERY PLAN ${trimmed}`).all()
  } catch {
    continue
  }
  const steps = rows.map((row) => row.detail)
  plans.push({ sql: trimmed.replace(/\s+/g, " "), plan: steps })
}
const scans = plans.filter(({ plan }) => plan.some((step) => new RegExp(`^SCAN (${TABLES})\\b`).test(step)))
const linkSearches = plans.filter(({ sql }) => /\bFROM links\b|UPDATE links|INSERT INTO links/.test(sql))

process.stdout.write(
  `${JSON.stringify(
    {
      n: N,
      companies: COMPANIES,
      contacts: N,
      deals: N,
      leads: LEADS,
      users: USERS,
      results,
      peakRssMb: Math.round(peak / 1048576),
      rows: { links: count("links"), deals: count("deals"), leads: count("leads"), persons: count("persons") },
      scans,
      linkPlans: linkSearches,
    },
    null,
    2,
  )}\n`,
)
