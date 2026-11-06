// node bench.mjs <cli-core checkout with dist> <memo.js> [<memo.js> ...]
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [core, ...memos] = process.argv.slice(2)
const { openStore } = await import(join(core, "dist/store/index.js"))
const root = mkdtempSync(join(tmpdir(), "topicless-replies-"))
const env = {
  ...process.env,
  MESSAGING_STORE: join(root, "store.db"),
  MEMO_CONFIG_DIR: join(root, "config"),
  XDG_STATE_HOME: join(root, "state"),
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
}

const TOPICS = [
  ["price list sync", "the price list sync"],
  ["warehouse stock export", "the warehouse stock export"],
  ["invoice template", "the new invoice template"],
  ["delivery map", "the delivery map"],
  ["catalog photos", "the catalog photos"],
  ["contract renewal", "the contract renewal"],
  ["landing page", "the landing page"],
  ["payment reminder", "the payment reminder"],
  ["courier schedule", "the courier schedule"],
  ["review widget", "the review widget"],
]
const REPLIES = ["Let us leave that until summer", "Not this week, maybe later", "Agreed, after the holidays"]
const FILLER = "Thanks, received. Call me tomorrow. Good morning. Ok. See you at ten. Sent the file.".split(". ")

const message = (id, text, at, extra = {}) => ({
  id: String(id),
  chatId: "7",
  senderId: extra.outgoing ? "1" : "9",
  senderName: null,
  timestamp: new Date(Date.UTC(2026, 9, 1) + at * 600_000).toISOString(),
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
  ...extra,
})
const messages = []
let id = 1
TOPICS.forEach(([, phrase], n) => {
  for (let f = 0; f < 20; f++) messages.push(message(id++, FILLER[(n + f) % FILLER.length], id))
  const parent = id++
  messages.push(message(parent, `Could you set up ${phrase} for the Quillmark shop?`, parent, { outgoing: true }))
  messages.push(message(id++, REPLIES[n % REPLIES.length], id, { replyToId: String(parent) }))
})
const store = await openStore({ env })
await store.messages.saveMessages({ provider: "max", account: "2" }, "7", messages, { via: "bench" })
await store.close()
const replies = new Set(messages.filter((m) => m.replyToId).map((m) => `msg:max/2/7/${m.id}`))

const asks = {
  words: ([topic]) => topic,
  question: ([topic]) => `when will the ${topic} be ready?`,
}
for (const memo of memos) {
  const row = { memo: memo.split("/").slice(-4, -2).join("/") }
  for (const [kind, ask] of Object.entries(asks)) {
    let found = 0
    let ms = 0
    for (const [n, topic] of TOPICS.entries()) {
      const t0 = performance.now()
      const out = execFileSync("node", [memo, "search", "messages", ask(topic), "--limit", "10", "--json"], { env })
      ms += performance.now() - t0
      const refs = JSON.parse(out.toString()).items.map(({ ref }) => ref)
      const reply = [...replies][n]
      if (refs.includes(reply)) found++
    }
    row[kind] = `${found}/${TOPICS.length}`
    row[`${kind}_ms_avg`] = Math.round(ms / TOPICS.length)
  }
  process.stdout.write(`${JSON.stringify(row)}\n`)
}
