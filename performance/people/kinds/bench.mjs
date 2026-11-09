// What a person's kind, message count and newest contact cost cli-core's people list, read on every call.
// A synthetic store: the one ../ties/bench.mjs seeds, plus messages. No real data, no network, no account, no CLI run.
//   node ../ties/bench.mjs <cli-core checkout with dist> <store file>
//   node bench.mjs <cli-core checkout with dist> <the same store file>
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

const [core, path] = process.argv.slice(2)
if (!core || !path) throw new Error("usage: node bench.mjs <cli-core checkout with dist> <store file from ../ties>")
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openCache } = await load("store/open.js")
const { listPeople, similarPeople } = await load("store/sqlite/people-list.js")

const MESSAGES = Number(process.env.KINDS_MESSAGES ?? 1_500_000)
const RUNS = 7
const db = await openCache(path)

if (Number(db.prepare("SELECT count(*) AS n FROM messages").get()?.n) === 0) {
  // A third of the messages from anyone, the rest from 2,000 busy people; every seventh has no sender (a channel post).
  db.exec("PRAGMA foreign_keys = OFF")
  db.prepare(
    "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) " +
      "INSERT INTO messages (chat_id, account_id, external_id, sender_identity_id, sent_at, text, outgoing, " +
      "created_at, source, updated_at) SELECT 1 + (i % (SELECT count(*) FROM chats)), 1, 'm' || i, " +
      "CASE WHEN i % 7 = 0 THEN NULL WHEN i % 3 = 0 THEN 1 + abs(random()) % (SELECT count(*) FROM identities) " +
      "ELSE 1 + (i % 2000) END, 1700000000000 + i * 1000, 'hello', 0, 0, 'sync', 0 FROM n",
  ).run(MESSAGES)
}

const say = (line) => process.stdout.write(`${line}\n`)

const median = (label, work) => {
  work()
  const times = []
  for (let run = 0; run < RUNS; run++) {
    const began = performance.now()
    work()
    times.push(performance.now() - began)
  }
  times.sort((a, b) => a - b)
  say(`${label.padEnd(44)} ${times[RUNS >> 1].toFixed(0).padStart(5)} ms`)
}

const counts = (table) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
say(`persons ${counts("persons")}, identities ${counts("identities")}, messages ${counts("messages")}`)
median("kind:person, interactions, first 50", () => listPeople(db, { limit: 50 }))
median("kind:all, name, first 50", () => listPeople(db, { limit: 50, kind: "all", sort: "name" }))
median("kind:person, recent, first 50", () => listPeople(db, { limit: 50, sort: "recent" }))
median("kind:unsorted, limit 1 (a tab count)", () => listPeople(db, { limit: 1, kind: "unsorted" }))
median("name search, kind:all", () => listPeople(db, { limit: 50, kind: "all", query: "person 12" }))
median("similar, 8", () => similarPeople(db, "person 12", 8))
say(JSON.stringify(listPeople(db, { limit: 1 }).counts))
