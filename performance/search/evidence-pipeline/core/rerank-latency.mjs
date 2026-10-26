// Times Core discovery with a reranker on a synthetic 100k-message store; fresh state dir per run.
// Usage: node rerank-latency.mjs <cli-core dist> <models dir> <mmarco|bge-reranker-v2-m3> <inprocess|warm> [rounds] [question]
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const say = (...parts) =>
  process.stdout.write(`${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`)

const [dist, models, id, mode] = process.argv.slice(2)
const state = mkdtempSync(join(tmpdir(), "rerank-latency-"))
process.env.WIRECAT_STATE_DIR = state
process.env.HOME = state
mkdirSync(join(state, "models", "text"), { recursive: true })
symlinkSync(join(models, id === "mmarco" ? "mmarco" : "bge-int8"), join(state, "models", "text", id))
const { openStore } = await import(`${dist}/store/store.js`)
const { storedDeps } = await import(`${dist}/services/deps.js`)
const { searchStore } = await import(`${dist}/services/messages-archive-search.js`)
const { rerankLane } = await import(`${dist}/services/messages-rerank.js`)
const { warmEmbedders } = await import(`${dist}/embeddings/embed.js`)
const store = await openStore({ path: join(state, "m.db") })
const account = { provider: "test", account: "1" }
let seed = 7
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
const vocab =
  "the a we they price hosting subscription deploy release meeting budget client invoice design review backlog bug server database team week monday approved moved cancelled because cost doubled plan agreed decision euros customers app login payment schedule"
    .split(" ")
    .concat(Array.from({ length: 3000 }, (_, i) => `w${i.toString(36)}`))
const chats = 20,
  per = 5000
await store.chats.saveChats(
  account,
  Array.from({ length: chats }, (_, c) => ({
    id: String(c + 1),
    title: `Chat ${c + 1}`,
    kind: "group",
    unreadCount: 0,
    lastMessageAt: null,
    participantsCount: null,
  })),
)
for (let c = 1; c <= chats; c++)
  await store.messages.saveMessages(
    account,
    String(c),
    Array.from({ length: per }, (_, i) => ({
      id: String(i + 1),
      chatId: String(c),
      senderId: String(100 + (i % 7)),
      senderName: `Person ${i % 7}`,
      timestamp: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 600_000).toISOString(),
      editedAt: null,
      text: Array.from({ length: 8 + Math.floor(rnd() * 40) }, () => vocab[Math.floor(rnd() ** 2 * vocab.length)]).join(
        " ",
      ),
      outgoing: false,
      attachments: [],
      replyTo: null,
      replyToId: i > 3 && rnd() < 0.2 ? String(i - 2) : undefined,
      forwardedFrom: null,
      reactions: null,
    })),
    { via: "history" },
  )
await store.searchIndex.fillSearchIndex({})
await store.searchIndex.fillStems({})
const warm = mode === "warm" ? warmEmbedders() : undefined
const deps = {
  ...storedDeps({ provider: "test", app: { command: "chat" } }, store, account, {}),
  reranker: id,
  ...(warm ? { embedders: warm } : {}),
}
const questions = [
  "why did the price change for hosting?",
  "who approved the subscription budget in the client meeting?",
  "when was the payment schedule agreed?",
  "what did the team decide about the login bug?",
]
const rounds = Number(process.argv[6] ?? 2)
const only = process.argv[7]
for (let round = 0; round < rounds; round++)
  for (const text of only === undefined ? questions : [questions[Number(only)]]) {
    let load = 0,
      score = 0
    const base = rerankLane(deps)
    const lane = async () => {
      const t = performance.now()
      const r = await base()
      load = performance.now() - t
      if ("skipped" in r) return r
      return {
        ...r,
        score: async (q, p) => {
          const s = performance.now()
          try {
            return await r.score(q, p)
          } finally {
            score += performance.now() - s
          }
        },
      }
    }
    const t = performance.now()
    const found = await searchStore(
      store,
      account,
      { text, discover: true, limit: 20, timezone: "UTC" },
      {},
      undefined,
      lane,
    )
    const total = performance.now() - t
    say(
      JSON.stringify({
        id,
        mode,
        round,
        total: Math.round(total),
        load: Math.round(load),
        score: Math.round(score),
        words: Math.round(total - load - score),
        reranked: found.query?.discovery?.rerank,
        skipped: found.rerankSkipped?.reason,
      }),
    )
  }
say(JSON.stringify({ id, mode, maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024) }))
await warm?.close()
await store.close()
