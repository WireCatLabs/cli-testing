// What counting a chat's message senders as its people costs cli-core's people ties, for everyone and for a page.
// A synthetic store; no real data, no network, no account, no CLI run.
//   node bench.mjs <folder holding node_modules/@wirecat/cli-core, or a cli-core checkout with dist>
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

const [where] = process.argv.slice(2)
if (!where) throw new Error("usage: node bench.mjs <folder with node_modules/@wirecat/cli-core or a cli-core checkout>")
const installed = join(where, "node_modules", "@wirecat", "cli-core")
const core = existsSync(join(installed, "dist")) ? installed : where
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openCache } = await load("store/open.js")
const { shownReasons } = await load("store/sqlite/person-ties.js")
const { openStore } = await load("store/store.js")

const PEOPLE = 40_000
const CHATS = 3_000
const MESSAGES = Number(process.env.TIES_MESSAGES ?? 400_000)
const RUNS = 7
const NOW = Date.parse("2026-11-01T12:00:00Z")
const TG = { provider: "telegram", account: "1" }

const path = join(mkdtempSync(join(tmpdir(), "people-ties-senders-")), "wirecat.db")
const store = await openStore({ path })
await store.people.savePeople(TG, [{ id: "1", name: "Me" }])
await store.people.linkToOwner({ provider: "telegram", id: "1" })
for (let at = 0; at < PEOPLE; at += 5_000)
  await store.people.savePeople(
    TG,
    Array.from({ length: 5_000 }, (_, n) => ({ id: String(100 + at + n), name: `Person ${at + n}` })),
  )
// Every third chat is a group, half of them small (5 members) and half large (500); the rest are one-to-one.
await store.chats.saveChats(
  TG,
  Array.from({ length: CHATS }, (_, n) => ({
    id: `c${n}`,
    title: `c${n}`,
    kind: n % 3 === 0 ? "group" : "dialog",
    unreadCount: 0,
    lastMessageAt: null,
    participantsCount: n % 3 === 0 ? (n % 2 ? 5 : 500) : 2,
  })),
)
const db = await openCache(path)
const account = Number(db.prepare("SELECT id FROM accounts WHERE provider = 'telegram'").get()?.id)
const identities = db
  .prepare("SELECT id FROM identities WHERE provider = 'telegram'")
  .all()
  .map((row) => Number(row.id))
const chats = db
  .prepare("SELECT id FROM chats")
  .all()
  .map((row) => Number(row.id))
const insert = db.prepare(
  "INSERT INTO messages (chat_id, account_id, external_id, sender_identity_id, sent_at, text, created_at, " +
    "updated_at, source, outgoing) VALUES (?, ?, ?, ?, ?, 'hi', ?, ?, 'sync', ?)",
)
db.exec("BEGIN")
for (let n = 0; n < MESSAGES; n += 1)
  insert.run(
    chats[n % chats.length],
    account,
    `m${n}`,
    identities[(n * 7_919) % identities.length],
    NOW + n,
    NOW,
    NOW,
    n % 2,
  )
db.exec("COMMIT")
db.exec("ANALYZE")

const median = (run) => {
  run()
  const times = []
  for (let n = 0; n < RUNS; n += 1) {
    const start = performance.now()
    run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return Math.round(times[Math.floor(RUNS / 2)] * 10) / 10
}
const personOf = db.prepare("SELECT person_id FROM identity_links WHERE identity_id = ?")
const page = identities.slice(1_000, 1_050).map((identity) => Number(personOf.get(identity)?.person_id))
const listFirst = performance.now()
await store.people.list({ limit: 50, kind: "person", sort: "interactions" })
const listCold = Math.round((performance.now() - listFirst) * 10) / 10
const listTimes = []
for (let n = 0; n < RUNS; n += 1) {
  const start = performance.now()
  await store.people.list({ limit: 50, kind: "person", sort: "interactions" })
  listTimes.push(performance.now() - start)
}
listTimes.sort((a, b) => a - b)
const tied = shownReasons(db).size

process.stdout.write(
  `${JSON.stringify({
    core,
    identities: identities.length,
    chats: chats.length,
    messages: MESSAGES,
    tied,
    msEveryone: median(() => shownReasons(db)),
    msPageOf50: median(() => shownReasons(db, page)),
    msListFirstCall: listCold,
    msListPage: Math.round(listTimes[Math.floor(RUNS / 2)] * 10) / 10,
  })}\n`,
)
await store.close()
await db.close()
