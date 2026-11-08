// node fixture.mjs <store path> [--core <version>] — the invented project of recall.test.ts in cli-core, written to a
// store file so the installed memo can scan it. Gold: 8 chats and 7 people of project LKM. Messages are dated three
// weeks back, inside the scan's default 90 days.
import { args, installCore, loadCore } from "../../../store/integrity/lib.mjs"

const opts = args(process.argv.slice(2))
const [path] = opts._
const core = opts.core ?? "0.606.0"
installCore(core)
const { openStore } = await loadCore(core, "store/index.js")

const MAX = { provider: "max", account: "1" }
const TG = { provider: "telegram", account: "2" }
const DAY = 86_400_000
const base = Date.now() - 21 * DAY

const chat = (id, title, kind = "group") => ({
  id,
  title,
  kind,
  unreadCount: 0,
  lastMessageAt: new Date(base + DAY).toISOString(),
  participantsCount: null,
})

let next = 1
const messages = (chatId, senderId, count, text = "Synthetic note") =>
  Array.from({ length: count }, () => {
    const id = next++
    return {
      id: String(id),
      chatId,
      senderId,
      senderName: null,
      timestamp: new Date(base + id * 1000).toISOString(),
      editedAt: null,
      text,
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
  })

const store = await openStore({
  path,
  command: "link-recall-fixture",
  decisions: { agentDecisions: true, ruleProposalsOwnerOnly: true },
  warn: () => {},
})
for (const key of [MAX, TG]) await store.accounts.saveAccount(key, { name: null })
const project = await store.knowledge.addProject({ name: "Larkspur Medical", key: "LKM" })
const other = await store.knowledge.addProject({ name: "Quill Studio", key: "QST" })

const market = Array.from({ length: 36 }, (_, index) => String(300 + index))
await store.people.savePeople(MAX, [
  { id: "1000", name: "Owner Example" },
  { id: "101", name: "Stan Client" },
  { id: "102", name: "Mike Content" },
  { id: "103", name: "Dmitri Papers" },
  { id: "104", name: "Yaro Partner" },
  { id: "105", name: "Alex Ledger" },
  { id: "106", name: "Val Search" },
  { id: "107", name: "Quentin Sites" },
  { id: "108", name: "Kim Staff" },
  ...market.map((id) => ({ id, name: `Market ${id}` })),
])
await store.people.savePeople(TG, [
  { id: "2000", name: "Owner Example" },
  { id: "201", name: "Stan Client" },
  { id: "205", name: "Alex Ledger" },
  { id: "206", name: "Val Search" },
  { id: "208", name: "Reminder Bot" },
  { id: "209", name: "Alex Ledger" },
])
await store.people.linkToOwner({ provider: "max", id: "1000" })
await store.people.linkToOwner({ provider: "telegram", id: "2000" })
for (const [max, tg] of [
  ["101", "201"],
  ["105", "205"],
  ["106", "206"],
])
  await store.people.linkIdentities(
    { provider: "max", id: max },
    { provider: "telegram", id: tg },
    { method: "manual", by: "owner" },
  )

const dialogs = ["101", "102", "103", "104", "105"]
await store.chats.saveChats(MAX, [
  chat("-10", "Larkspur Medical site"),
  chat("-20", "Client requests"),
  chat("-30", "Questor sites"),
  chat("-40", "Neirox team"),
  chat("-50", "Rental market"),
  ...dialogs.map((id) => chat(`5${id}`, `dialog ${id}`, "dialog")),
])
const rosters = [
  ["-10", ["1000", "101", "102", "103", "104", "105"]],
  ["-20", ["1000", "101", "102", "106"]],
  ["-30", ["1000", "101", "102", "107"]],
  ["-40", ["1000", "104", "106", "108"]],
  ["-50", ["1000", "101", "102", ...market]],
  ...dialogs.map((id) => [`5${id}`, ["1000", id]]),
]
for (const [id, members] of rosters) await store.roster.saveMembers(MAX, id, members)
const said = [
  ["-10", "101", 8],
  ["-10", "102", 6],
  ["-10", "103", 5],
  ["-10", "104", 2],
  ["-10", "105", 1],
  ["-20", "101", 3],
  ["-20", "102", 2],
  ["-20", "106", 2],
  ["-30", "101", 2],
  ["-30", "107", 3],
  ["-40", "104", 3],
  ["-40", "106", 2],
  ["-40", "108", 3],
  ["-50", "101", 1],
  ["-50", "102", 1],
  ["-50", "300", 9],
  ...dialogs.map((id) => [`5${id}`, id, 2]),
]
for (const [id, sender, count] of said)
  await store.messages.saveMessages(MAX, id, messages(id, sender, count), { via: "history" })

await store.chats.saveChats(TG, [
  chat("205", "Alex Ledger", "dialog"),
  chat("206", "Val Search", "dialog"),
  chat("208", "Reminder Bot", "dialog"),
  chat("209", "Alex Ledger", "dialog"),
])
for (const [id, count] of [
  ["205", 2],
  ["206", 4],
  ["209", 3],
])
  await store.messages.saveMessages(TG, id, messages(id, id, count), { via: "history" })
await store.messages.saveMessages(TG, "208", messages("208", "208", 2, "Invoice reminder for LKM"), { via: "history" })

const person = async (provider, id) => `person:${(await store.people.personOf({ provider, id }))?.uid}`
for (const id of ["104", "108"])
  await store.knowledge.relate(null, { by: "owner", from: await person("max", id), to: other.ref, kind: "member-of" })

// The gold links are written confirmed, as the owner's store holds them; recall.mjs takes them out before round 1.
const gold = [
  "chat:max/1/-10",
  "chat:max/1/5101",
  "chat:max/1/-20",
  "chat:max/1/-30",
  "chat:max/1/5105",
  "chat:telegram/2/205",
  "chat:telegram/2/206",
  "chat:telegram/2/208",
  ...(await Promise.all(["101", "102", "103", "104", "105", "106", "107"].map((id) => person("max", id)))),
]
for (const from of gold) await store.knowledge.relate(null, { by: "owner", from, to: project.ref, kind: "member-of" })
await store.close()
process.stdout.write(
  `${JSON.stringify({ path, core, project: project.ref, key: "LKM", sources: "max:1,telegram:2", gold: gold.length })}\n`,
)
