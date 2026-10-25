// Peak memory of one cold `--discover` the way the CLI runs it: e5 in-process for meaning, then the reranker.
// Synthetic 1,000-message store, fresh state dir. Usage: node memory.mjs <dist> <models dir> prepare  -> prints the state dir;
// then STATE=<dir> node memory.mjs <dist> <models dir> <off|mmarco|bge-reranker-v2-m3>, a fresh process per model.
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const say = (...parts) =>
  process.stdout.write(`${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`)

const [dist, models, id] = process.argv.slice(2)
const prepare = id === "prepare"
const state = prepare ? mkdtempSync(join(tmpdir(), "rerank-memory-")) : process.env.STATE
process.env.WIRECAT_STATE_DIR = state
process.env.HOME = state
mkdirSync(join(state, "models", "text"), { recursive: true })
if (prepare) symlinkSync(join(models, "e5-small"), join(state, "models", "text", "e5-small"))
if (!prepare && id !== "off")
  symlinkSync(join(models, id === "mmarco" ? "mmarco" : "bge-int8"), join(state, "models", "text", id))
const { openStore } = await import(`${dist}/store/store.js`)
const { storedDeps } = await import(`${dist}/services/deps.js`)
const { embeddingsService } = await import(`${dist}/services/embeddings.js`)
const { searchStore } = await import(`${dist}/services/messages-archive-search.js`)
const { meaningLane } = await import(`${dist}/services/messages-meaning.js`)
const { rerankLane } = await import(`${dist}/services/messages-rerank.js`)
const store = await openStore({ path: join(state, "m.db") })
const account = { provider: "test", account: "1" }
const words =
  "the price hosting subscription deploy release meeting budget client invoice design review backlog bug server database team week approved moved cancelled because cost doubled plan agreed decision euros customers app login payment schedule".split(
    " ",
  )
let seed = 3
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
if (prepare) {
  await store.chats.saveChats(account, [
    { id: "1", title: "Team", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await store.messages.saveMessages(
    account,
    "1",
    Array.from({ length: 1000 }, (_, i) => ({
      id: String(i + 1),
      chatId: "1",
      senderId: String(i % 5),
      senderName: `Person ${i % 5}`,
      timestamp: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 600_000).toISOString(),
      editedAt: null,
      text: Array.from({ length: 10 + Math.floor(rnd() * 30) }, () => words[Math.floor(rnd() * words.length)]).join(
        " ",
      ),
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    })),
    { via: "history" },
  )
  await store.searchIndex.fillSearchIndex({})
  await store.searchIndex.fillStems({})
}
const deps = { ...storedDeps({ provider: "test", app: { command: "chat" } }, store, account, {}), reranker: id }
if (prepare) {
  await embeddingsService(deps).refresh({ threads: 8 })
  say(state)
  await store.close()
  process.exit(0)
}
const before = Math.round(process.resourceUsage().maxRSS / 1024)
const t = performance.now()
const found = await searchStore(
  store,
  account,
  { text: "why did the hosting price change?", discover: true, limit: 20, timezone: "UTC" },
  {},
  meaningLane(deps),
  rerankLane(deps),
)
say(
  JSON.stringify({
    id,
    ms: Math.round(performance.now() - t),
    meaning: found.query?.discovery?.meaning,
    rerank: found.query?.discovery?.rerank,
    skipped: found.rerankSkipped?.reason,
    maxRssBeforeSearchMB: before,
    maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
  }),
)
await store.close()
