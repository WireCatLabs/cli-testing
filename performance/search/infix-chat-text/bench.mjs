// `*word*` in chat-message text, timed through cli-core's own search (`searchStore`) on a synthetic store.
//   node bench.mjs gen   <cli-core checkout with dist/> <store file> <messages>
//   node bench.mjs query <cli-core checkout with dist/> <store file> <label>
// `gen` writes the store through the store's own API and fills its word index; `query` prints one JSON line per query:
// p50 of 7 warm runs, the hits on the first page, or the refusal's reason. Nothing here opens the owner's store.
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { text } from "../substring-notes/gen.mjs"

const [mode, root, path, arg] = process.argv.slice(2)
if (!mode || !root || !path) throw new Error("usage: node bench.mjs gen|query <cli-core> <store file> <n|label>")
const load = (file) => import(pathToFileURL(join(root, "dist", file)).href)
const { openStore } = await load("store/store.js")
const { searchStore } = await load("services/messages-archive-search.js")
const account = { provider: "telegram", account: "1" }
const CHATS = 100
const store = await openStore({ path })

if (mode === "gen") {
  const count = Number(arg)
  const start = Date.UTC(2025, 0, 1)
  await store.chats.saveChats(
    account,
    Array.from({ length: CHATS }, (_, at) => ({
      id: String(at + 1),
      title: `Chat ${at + 1}`,
      kind: "group",
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    })),
  )
  const began = performance.now()
  const batch = 5000
  for (let from = 1; from <= count; from += batch) {
    const byChat = new Map()
    for (let id = from; id < Math.min(from + batch, count + 1); id++) {
      const chatId = String((id % CHATS) + 1)
      const list = byChat.get(chatId) ?? []
      list.push({
        id: String(id),
        chatId,
        senderId: String(1000 + (id % 50)),
        senderName: `Person ${id % 50}`,
        timestamp: new Date(start + id * 60_000).toISOString(),
        editedAt: null,
        text: text(id, 40 + ((id * 37) % 200), 1),
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      })
      byChat.set(chatId, list)
    }
    for (const [chatId, list] of byChat) await store.messages.saveMessages(account, chatId, list, { via: "history" })
  }
  const saved = performance.now()
  let fill
  do fill = await store.searchIndex.fillSearchIndex()
  while (fill.normalized || fill.indexed)
  process.stdout.write(
    `${JSON.stringify({ step: "gen", messages: count, save_s: Math.round((saved - began) / 1000), index_s: Math.round((performance.now() - saved) / 1000) })}\n`,
  )
} else {
  const QUERIES = [
    "*тартус*",
    "*артусск*",
    "*ТАРТУСС*",
    "*bernet*",
    "*ёлкин*",
    "*договор*",
    "*ени*",
    "*про*",
    "*щюфыжд*",
    "*договор* AND chat:12",
    "*ени* AND chat:12",
    "*ени* AND date:[2025-02-01 TO 2025-02-07]",
    "NOT *договор* AND chat:12",
    "*арендой* OR *ёлкин*",
    "*ость",
    "*ени",
    "*ени AND chat:12",
    "*дог?вор*",
    "договор*",
  ]
  for (const query of QUERIES) {
    const runs = []
    let outcome
    for (let run = 0; run < 7; run++) {
      const began = performance.now()
      try {
        const found = await searchStore(store, account, { text: query, limit: 50 })
        outcome = { hits: found.items.length, has_more: found.hasMore }
      } catch (error) {
        outcome = { refused: error?.details?.reason ?? error?.code ?? String(error), budget: error?.details?.budget }
      }
      runs.push(performance.now() - began)
    }
    runs.sort((a, b) => a - b)
    process.stdout.write(
      `${JSON.stringify({ label: arg, query, p50_ms: Math.round(runs[3] * 10) / 10, ...outcome })}\n`,
    )
  }
}
await store.close()
