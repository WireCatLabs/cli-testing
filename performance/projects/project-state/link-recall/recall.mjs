// node recall.mjs copy <store> <copy>
// node recall.mjs <copy> --project <key> --sources <accounts> [--rounds 3] [--memo memo] [--extra-gold <file>]
//
// Step C's check on a store copy: takes the project's confirmed member links out, runs `memo relationships scan`
// (a dry run) round by round, puts back the links the scan proposes as the owner would confirm them, and prints
// totals only. The proposed and missed references go to <copy>.recall.json beside the copy: keep that file private.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { backup, DatabaseSync } from "node:sqlite"
import { args } from "../../../store/integrity/lib.mjs"

const NAME_SCORERS = new Set(["chat-title", "alias-hits"])
const percent = (part, whole) => (whole === 0 ? null : Math.round((part / whole) * 100))

const liveStores = () =>
  [
    process.env.MESSAGING_STORE,
    join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "WireCat", "wirecat.db"),
    join(homedir(), ".local", "share", "WireCat", "wirecat.db"),
  ]
    .filter((path) => path && existsSync(path))
    .map((path) => realpathSync(path))

const opts = args(process.argv.slice(2))

if (opts._[0] === "copy") {
  const [, from, to] = opts._
  if (existsSync(to)) throw new Error(`${to} exists; copy into a new path`)
  mkdirSync(dirname(resolve(to)), { recursive: true })
  // node:sqlite rather than the sqlite3 shell: an older shell's close can delete a WAL in use (FIND-2409).
  const source = new DatabaseSync(from, { readOnly: true })
  const pages = await backup(source, to)
  source.close()
  process.stdout.write(`${JSON.stringify({ copied: to, pages })}\n`)
  process.exit(0)
}

const [store] = opts._
if (!store || !opts.project || !opts.sources)
  throw new Error("usage: recall.mjs <copy> --project <key> --sources <a,b>")
const path = realpathSync(store)
if (liveStores().includes(path)) throw new Error(`${path} is a live store; run on a copy (recall.mjs copy)`)
const rounds = Number(opts.rounds ?? 3)
const memo = opts.memo ?? "memo"
const extraGold = opts["extra-gold"]
  ? new Set(
      readFileSync(opts["extra-gold"], "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
  : new Set()

const db = new DatabaseSync(path)
db.exec("PRAGMA busy_timeout = 5000")
if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = '_recall_gold'").get())
  throw new Error("this copy was used by an earlier run; make a fresh copy")
const project = /^project:\d+$/.test(opts.project)
  ? db.prepare("SELECT id, key FROM projects WHERE id = ?").get(Number(opts.project.slice(8)))
  : db.prepare("SELECT id, key FROM projects WHERE key = ?").get(opts.project)
if (!project) throw new Error(`no project ${opts.project}`)

// Stores older than schema 50 have no deleted_at on links.
const live = db.prepare("SELECT 1 FROM pragma_table_info('links') WHERE name = 'deleted_at'").get()
  ? "AND deleted_at IS NULL"
  : ""
const GOLD = `FROM links WHERE kind = 'member-of' AND to_type = 'project' AND to_id = ${Number(project.id)}
  AND confirmed = 1 ${live} AND from_type IN ('chat', 'person', 'email_thread')`
db.exec(`CREATE TABLE _recall_gold AS SELECT * ${GOLD}`)
db.exec(`DELETE ${GOLD}`)
const refOf = db.prepare(`SELECT id, CASE g.from_type
  WHEN 'person' THEN 'person:' || g.from_id
  WHEN 'chat' THEN (SELECT 'chat:' || a.provider || '/' || a.external_id || '/' || c.external_id
    FROM chats c JOIN accounts a ON a.id = c.account_id WHERE c.id = g.from_id)
  WHEN 'email_thread' THEN (SELECT 'chat:email/' || a.external_id || '/' || t.external_id
    FROM email_threads t JOIN accounts a ON a.id = t.account_id WHERE t.id = g.from_id)
  END AS ref FROM _recall_gold g`)
const gold = new Map(refOf.all().map((row) => [row.ref, row.id]))
const confirm = db.prepare("INSERT INTO links SELECT * FROM _recall_gold WHERE id = ?")

const folder = `${path}.recall-home`
const env = {
  PATH: process.env.PATH,
  HOME: folder,
  XDG_CONFIG_HOME: join(folder, ".config"),
  XDG_DATA_HOME: join(folder, ".local", "share"),
  XDG_STATE_HOME: join(folder, ".local", "state"),
  XDG_CACHE_HOME: join(folder, ".cache"),
  MESSAGING_STORE: path,
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
}
mkdirSync(folder, { recursive: true })

const found = new Set()
const proposed = new Map()
const perRound = []
for (let round = 1; round <= rounds; round++) {
  const started = Date.now()
  const run = spawnSync(memo, ["relationships", "scan", project.key, "--source", opts.sources, "--json"], {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 2 ** 20,
  })
  if (run.status !== 0) throw new Error(`memo exited ${run.status}: ${run.stderr.slice(-500)}`)
  const out = JSON.parse(run.stdout)
  const scan = out.item.scans[0]
  let fresh = 0
  let freshGold = 0
  for (const proposal of scan.proposals) {
    if (!proposed.has(proposal.from)) fresh++
    proposed.set(
      proposal.from,
      proposal.signals.map((signal) => signal.scorer.split("@")[0]),
    )
    if (!gold.has(proposal.from) || found.has(proposal.from)) continue
    found.add(proposal.from)
    freshGold++
    confirm.run(gold.get(proposal.from))
  }
  perRound.push({
    round,
    listed: scan.proposals.length,
    new: fresh,
    new_in_gold: freshGold,
    recall: percent(found.size, gold.size),
    scan_ms: out.meta.duration_ms,
    wall_ms: Date.now() - started,
    skipped: scan.skipped,
  })
}
db.close()

const falseOnes = [...proposed.keys()].filter((ref) => !gold.has(ref))
const nameOnly = falseOnes.filter((ref) => proposed.get(ref).every((scorer) => NAME_SCORERS.has(scorer)))
const kinds = (refs) => ({
  chats: refs.filter((ref) => ref.startsWith("chat:")).length,
  people: refs.filter((ref) => ref.startsWith("person:")).length,
})
const missedTotals = (refs) => ({
  chats: Object.fromEntries(
    Object.entries(
      Object.groupBy(
        refs.filter((ref) => ref.startsWith("chat:")),
        (ref) => ref.split(/[:/]/)[1],
      ),
    ).map(([messenger, list]) => [messenger, list.length]),
  ),
  people: refs.filter((ref) => ref.startsWith("person:")).length,
})
const totals = (goldSize, hit) => ({
  gold: goldSize,
  found: hit,
  recall: percent(hit, goldSize),
  proposed: proposed.size,
  precision: percent(hit, proposed.size),
  false: proposed.size - hit,
})
const summary = {
  memo: spawnSync(memo, ["--version"], { encoding: "utf8" }).stdout.trim(),
  gold: { total: gold.size, ...kinds([...gold.keys()]) },
  rounds: perRound,
  result: { ...totals(gold.size, found.size), name_only_false: nameOnly.length },
  missed: missedTotals([...gold.keys()].filter((ref) => !found.has(ref))),
}
if (extraGold.size > 0) {
  const extraHit = [...proposed.keys()].filter((ref) => extraGold.has(ref) && !gold.has(ref)).length
  summary.with_extra_gold = totals(
    gold.size + [...extraGold].filter((ref) => !gold.has(ref)).length,
    found.size + extraHit,
  )
}
writeFileSync(
  `${path}.recall.json`,
  `${JSON.stringify({ ...summary, private: { proposed: Object.fromEntries(proposed), found: [...found], missed: [...gold.keys()].filter((ref) => !found.has(ref)) } }, null, 2)}\n`,
)
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
