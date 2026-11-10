// Usage: node bench.mjs <cli-core checkout with dist> [messages] [chats]
// Synthetic data only. Times `projectActivity`: every project's linked chats and their messages in a window.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [core, messagesArg = "412000", chatsArg = "2632"] = process.argv.slice(2)
const MESSAGES = Number(messagesArg)
const CHATS = Number(chatsArg)
const load = (path) => import(pathToFileURL(join(core, "dist", path)).href)
const { openStore } = await load("store/index.js")
const { projectActivity } = await load("services/project-activity.js")

const DAY = 86_400_000
const NOW = Date.parse("2026-11-10T12:00:00Z")
const ACCOUNTS = [
  { provider: "telegram", account: "100" },
  { provider: "telegram", account: "200" },
  { provider: "max", account: "300" },
  { provider: "whatsapp", account: "400" },
]
const chatAccount = (i) => ACCOUNTS[i % ACCOUNTS.length]
// Projects 1 and 2 get 12 and 10 chats, as on the owner's store; 3 to 5 none.
const LINKED = [
  ...Array.from({ length: 12 }, (_, i) => [1, i * 7 + 1]),
  ...Array.from({ length: 10 }, (_, i) => [2, i * 11 + 500]),
]

const path = join(mkdtempSync(join(tmpdir(), "project-activity-bench-")), "wirecat.db")
let store = await openStore({ path })
for (const account of ACCOUNTS) {
  const chats = []
  for (let i = 0; i < CHATS; i++)
    if (chatAccount(i) === account)
      chats.push({ id: String(i), title: `Chat ${i}`, kind: i % 3 ? "group" : "dialog", muted: i % 6 === 0 })
  await store.chats.saveChats(account, chats)
}
await store.close()

const db = new DatabaseSync(path)
const chatPk = new Map(
  db
    .prepare("SELECT c.id, c.external_id FROM chats c")
    .all()
    .map((row) => [Number(row.external_id), Number(row.id)]),
)
const accountPk = new Map(
  db
    .prepare("SELECT id, provider, external_id FROM accounts")
    .all()
    .map((r) => [`${r.provider}/${r.external_id}`, r.id]),
)
let seed = 11
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const linkedChats = LINKED.map(([, chat]) => chat)
const insert = db.prepare(
  "INSERT INTO messages (chat_id, account_id, external_id, sent_at, text, outgoing, created_at, updated_at, source) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bench')",
)
db.exec("BEGIN")
for (let i = 0; i < MESSAGES; i++) {
  // About 4% of messages land in linked chats, like the owner's 16k of 412k.
  const chat = random() < 0.04 ? linkedChats[Math.floor(random() * linkedChats.length)] : Math.floor(random() * CHATS)
  const account = chatAccount(chat)
  const at = NOW - Math.floor(random() * 730 * DAY)
  insert.run(
    chatPk.get(chat),
    accountPk.get(`${account.provider}/${account.account}`),
    String(i),
    at,
    "x",
    random() < 0.3 ? 1 : 0,
    at,
    at,
  )
}
db.exec("COMMIT")
db.close()

store = await openStore({ path })
const projects = []
for (let p = 1; p <= 5; p++) projects.push(await store.knowledge.addProject({ name: `Project ${p}`, key: `PR${p}` }))
for (const [project, chat] of LINKED) {
  const account = chatAccount(chat)
  await store.knowledge.relate(null, {
    by: "owner",
    from: `chat:${account.provider}/${account.account}/${chat}`,
    to: projects[project - 1].ref,
    kind: "member-of",
    confirmed: true,
  })
}

const say = (line) => process.stdout.write(`${line}\n`)

const time = async (label, input) => {
  const runs = []
  let found
  for (let round = 0; round < 11; round++) {
    const start = performance.now()
    found = await projectActivity(store, { ...input, until: NOW, limit: 20, offset: 0 })
    runs.push(performance.now() - start)
  }
  runs.sort((a, b) => a - b)
  const top = found.items[0]
  say(
    `${label.padEnd(10)} median ${runs[5].toFixed(1)} ms, max ${runs[10].toFixed(1)} ms · ` +
      `first: ${top.key} ${top.chats} chats (${top.muted} muted), ${top.messages} messages`,
  )
}

say(`${MESSAGES} messages, ${CHATS} chats, 5 projects, ${LINKED.length} linked chats`)
await time("7 days", { since: NOW - 7 * DAY })
await time("30 days", { since: NOW - 30 * DAY })
await time("all time", { since: 0 })
await store.close()
