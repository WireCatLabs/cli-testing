// node spread-time.mjs build <store> [--core 0.612.0]
// node spread-time.mjs <store> --core <version> [--rounds 2]
//
// PERF-80: how long one `relationships scan` takes with the project's confirmed links in the store and with them taken
// out, as recall.mjs does between rounds. The store is synthetic (2 600 chats, 560k messages, 17 confirmed links); the
// run works on a fresh copy beside it, so the built store is never changed. Prints times, store call counts and a hash
// of the proposals, so two cli-core versions can be compared on the same store.
import { createHash } from "node:crypto"
import { existsSync, rmSync } from "node:fs"
import { backup, DatabaseSync } from "node:sqlite"
import { args, installCore, loadCore } from "../../../store/integrity/lib.mjs"

const opts = args(process.argv.slice(2))
const core = opts.core ?? "0.612.0"
installCore(core)
const { openStore } = await loadCore(core, "store/index.js")
const MAX = { provider: "max", account: "1" }
const TG = { provider: "telegram", account: "2" }
const DAY = 86_400_000
const base = Date.now() - 60 * DAY
const SINCE = new Date(base - DAY).toISOString()
const open = (path) =>
  openStore({
    path,
    command: "spread-time",
    decisions: { agentDecisions: true, ruleProposalsOwnerOnly: true },
    warn: () => {},
  })

const chat = (id, title, kind = "group") => ({
  id,
  title,
  kind,
  unreadCount: 0,
  lastMessageAt: new Date(base + DAY).toISOString(),
  participantsCount: null,
})
let next = 1
const messages = (chatId, senders, count) =>
  Array.from({ length: count }, (_, index) => {
    const id = next++
    return {
      id: String(id),
      chatId,
      senderId: senders[index % senders.length] ?? "1000",
      senderName: null,
      timestamp: new Date(base + id * 1000).toISOString(),
      editedAt: null,
      text: `Synthetic note ${id} about delivery and invoices`,
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
  })

const build = async (path) => {
  if (existsSync(path)) throw new Error(`${path} exists`)
  const store = await open(path)
  for (const key of [MAX, TG]) await store.accounts.saveAccount(key, { name: null })
  const project = await store.knowledge.addProject({ name: "Larkspur Medical", key: "LKM" })
  const people = Array.from({ length: 600 }, (_, index) => String(100 + index))
  for (const [key, owner] of [
    [MAX, "1000"],
    [TG, "2000"],
  ]) {
    await store.people.savePeople(key, [{ id: owner, name: "Owner" }, ...people.map((id) => ({ id, name: `P ${id}` }))])
    await store.people.linkToOwner({ provider: key.provider, id: owner })
  }
  for (const id of people.slice(0, 60))
    await store.people.linkIdentities(
      { provider: "max", id },
      { provider: "telegram", id },
      { method: "manual", by: "owner" },
    )
  const project8 = people.slice(0, 8)
  const sales = people.slice(0, 150)
  const groups = [chat("-1", "Larkspur Medical site"), chat("-2", "LKM sales")]
  for (let index = 0; index < 1500; index++) groups.push(chat(String(-100 - index), `Group ${index}`))
  await store.chats.saveChats(MAX, [...groups, ...people.map((id) => chat(`5${id}`, `dialog ${id}`, "dialog"))])
  await store.chats.saveChats(
    TG,
    Array.from({ length: 1000 }, (_, index) => chat(String(-5000 - index), `TG group ${index}`)).concat(
      people.slice(0, 200).map((id) => chat(id, `tg ${id}`, "dialog")),
    ),
  )
  await store.roster.saveMembers(MAX, "-1", ["1000", ...project8])
  await store.messages.saveMessages(MAX, "-1", messages("-1", project8, 3000), { via: "history" })
  await store.roster.saveMembers(MAX, "-2", ["1000", ...sales])
  for (let batch = 0; batch < 20; batch++)
    await store.messages.saveMessages(MAX, "-2", messages("-2", sales.slice(0, 40), 2000), { via: "history" })
  for (let index = 0; index < 1500; index++) {
    const id = String(-100 - index)
    const members = Array.from({ length: index % 3 === 0 ? 6 : 40 }, (_, k) => people[(index * 7 + k) % people.length])
    await store.roster.saveMembers(MAX, id, ["1000", ...members])
    await store.messages.saveMessages(MAX, id, messages(id, members, 200), { via: "history" })
  }
  for (const id of people) {
    await store.roster.saveMembers(MAX, `5${id}`, ["1000", id])
    await store.messages.saveMessages(MAX, `5${id}`, messages(`5${id}`, [id, "1000"], 100), { via: "history" })
  }
  for (let index = 0; index < 1000; index++) {
    const id = String(-5000 - index)
    const members = Array.from({ length: 8 }, (_, k) => people[(index * 5 + k) % 200])
    await store.roster.saveMembers(TG, id, ["2000", ...members])
    await store.messages.saveMessages(TG, id, messages(id, members, 150), { via: "history" })
  }
  for (const id of people.slice(0, 200))
    await store.messages.saveMessages(TG, id, messages(id, [id], 50), { via: "history" })
  const person = async (id) => `person:${(await store.people.personOf({ provider: "max", id }))?.uid}`
  const gold = [
    "chat:max/1/-1",
    "chat:max/1/-2",
    ...(await Promise.all([...project8, ...people.slice(20, 27)].map(person))),
  ]
  for (const from of gold) await store.knowledge.relate(null, { by: "owner", from, to: project.ref, kind: "member-of" })
  await store.close()
  return { path, core, gold: gold.length }
}

const counted = (store, tally) =>
  new Proxy(store, {
    get(object, key) {
      const value = Reflect.get(object, key)
      if (!["messages", "people", "chats"].includes(String(key))) return value
      return new Proxy(value, {
        get(inner, name) {
          const method = Reflect.get(inner, name)
          if (typeof method !== "function") return method
          return (...rest) => {
            const label = `${String(key)}.${String(name)}`
            tally[label] = (tally[label] ?? 0) + 1
            return method.apply(inner, rest)
          }
        },
      })
    },
  })

const scan = async (path, linked) => {
  const { scanProjectLinks } = await loadCore(core, "services/index.js")
  const store = await open(path)
  const tally = {}
  const started = performance.now()
  const result = await scanProjectLinks(counted(store, tally), {
    project: "LKM",
    sources: [MAX, TG],
    since: SINCE,
    write: false,
  })
  const ms = Math.round(performance.now() - started)
  await store.close()
  const shape = result.proposals.map(({ from, score, why, evidence }) => [from, score, why, evidence])
  return {
    confirmed_links: linked,
    scan_ms: ms,
    proposals: result.proposals.length,
    proposals_hash: createHash("sha1").update(JSON.stringify(shape)).digest("hex").slice(0, 10),
    person_lookups: tally["people.personOf"] ?? 0,
    message_page_reads: tally["messages.messages"] ?? 0,
    member_chat_reads: tally["chats.chatsWith"] ?? 0,
  }
}

if (opts._[0] === "build") {
  process.stdout.write(`${JSON.stringify(await build(opts._[1]))}\n`)
  process.exit(0)
}

const [built] = opts._
if (!built) throw new Error("usage: spread-time.mjs <store> --core <version>")
const path = `${built}.run-${core}.db`
for (const one of [path, `${path}-wal`, `${path}-shm`]) rmSync(one, { force: true })
const source = new DatabaseSync(built, { readOnly: true })
await backup(source, path)
source.close()

const db = new DatabaseSync(path)
db.exec("PRAGMA busy_timeout = 5000")
const GOLD = "FROM links WHERE kind = 'member-of' AND to_type = 'project' AND confirmed = 1 AND deleted_at IS NULL"
const rows = []
for (let round = 1; round <= Number(opts.rounds ?? 2); round++) {
  rows.push(await scan(path, true))
  db.exec(`CREATE TABLE IF NOT EXISTS _gold AS SELECT * ${GOLD}`)
  db.exec(`DELETE ${GOLD}`)
  rows.push(await scan(path, false))
  db.exec("INSERT INTO links SELECT * FROM _gold")
  db.exec("DROP TABLE _gold")
}
db.close()
for (const one of [path, `${path}-wal`, `${path}-shm`]) rmSync(one, { force: true })
process.stdout.write(`${JSON.stringify({ core, node: process.version, rows }, null, 2)}\n`)
