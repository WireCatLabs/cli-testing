// Copy into the root of a cli-core checkout, then: npx tsx bench-search-all.ts <empty scratch dir>
// Needs e5-small at ~/.local/share/WireCat/models/text/e5-small (symlinked into a temp state dir; nothing downloaded).
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
const scratch = process.argv[2] as string
const state = mkdtempSync(join(scratch, "state-"))
mkdirSync(join(state, "models", "text"), { recursive: true })
symlinkSync(join(homedir(), ".local/share/WireCat/models/text/e5-small"), join(state, "models", "text", "e5-small"))
process.env.WIRECAT_STATE_DIR = state
const { openStore } = await import("./src/store/store.js")
const { storedDeps } = await import("./src/services/deps.js")
const { embeddingsService } = await import("./src/services/embeddings.js")
const { meaningLane } = await import("./src/services/messages-meaning.js")
const { searchAll } = await import("./src/services/search-all.js")

const vocab = "cat dog kitten fish invoice payment meeting flight hotel train budget report dinner coffee doctor holiday contract design deploy server bug release kitchen garden weather music book film birthday school".split(" ")
let seed = 7
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
const sentence = () => Array.from({ length: 6 + Math.floor(rand() * 10) }, () => vocab[Math.floor(rand() * vocab.length)]).join(" ")
const store = await openStore({ path: join(state, "m.db") })
const accounts = [{ provider: "test", account: "1" }, { provider: "test", account: "2" }]
const first = accounts[0] as { provider: string; account: string }
const PER_CHAT = 500
for (const account of accounts)
  for (let c = 0; c < 10; c++) {
    const chatId = String(c)
    await store.chats.saveChats(account, [{ id: chatId, title: `Chat ${c}`, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null }])
    await store.messages.saveMessages(account, chatId, Array.from({ length: PER_CHAT }, (_, i) => ({
      id: String(i + 1), chatId, senderId: "100", senderName: null,
      timestamp: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 60_000).toISOString(), editedAt: null,
      text: sentence(), outgoing: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: null,
    })), { via: "history" })
  }
await store.searchIndex.fillSearchIndex({})
await store.searchIndex.fillStems({})
const t = () => performance.now()
let s = t()
for (const account of accounts) {
  const deps = storedDeps({ provider: "test", app: { command: "chat" } } as never, store, account, {} as never)
  for (;;) {
    const r = await embeddingsService(deps).refresh({ build: false, maxChunks: 5000 })
    if (!r.messages?.left) break
  }
}
console.log(`messages: ${accounts.length * 10 * PER_CHAT}, embed all: ${((t() - s) / 1000).toFixed(1)} s`)
const deps = storedDeps({ provider: "test", app: { command: "chat" } } as never, store, first, {} as never)
const lane = meaningLane(deps)
const queries = ["paying the bill", "trip abroad", "cat", "doctor appointment chat:3", "release bug"]
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]?.toFixed(0)
const run = async (label: string, f: (q: string) => Promise<unknown>) => {
  const times: number[] = []
  for (let round = 0; round < 3; round++) for (const q of queries) { s = t(); await f(q); times.push(t() - s) }
  console.log(`${label}: median ${median(times)} ms, max ${Math.max(...times).toFixed(0)} ms (n=${times.length})`)
}
s = t(); await lane("warm up", accounts); console.log(`first lane call (model load + query): ${(t() - s).toFixed(0)} ms`)
await run("lane alone (embed query + nearest x2 accounts)", (q) => lane(q, accounts))
await run("search all, words only", (q) => searchAll(store, first, { text: q, limit: 20, only: ["messages"] }))
await run("search all, words + meaning", (q) => searchAll(store, first, { text: q, limit: 20, only: ["messages"] }, {}, undefined, lane))
const found = await searchAll(store, first, { text: "paying the bill", limit: 10, only: ["messages"] }, {}, undefined, lane)
console.log("example:", JSON.stringify(found.messages), found.items.slice(0, 5).map((i) => i.foundBy.join("+")).join(", "))
await store.close()
