// Times a whole message search and the coverage step on a synthetic store, for one cli-core build.
//   node bench.mjs <cli-core checkout>/dist <store file> <label>
// The store comes from ../infix-chat-text/bench.mjs gen. Nothing here opens the owner's store.
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [root, path, label] = process.argv.slice(2)
const load = (file) => import(pathToFileURL(join(root, file)).href)
const { openStore } = await load("store/store.js")
const { searchStore } = await load("services/messages-archive-search.js")
const account = { provider: "telegram", account: "1" }
const store = await openStore({ path })
const p50 = async (run) => {
  const runs = []
  let outcome
  for (let at = 0; at < 7; at++) {
    const began = performance.now()
    try {
      outcome = await run()
    } catch (error) {
      outcome = { refused: error?.details?.reason ?? error?.code, budget: error?.details?.budget }
    }
    runs.push(performance.now() - began)
  }
  runs.sort((a, b) => a - b)
  return { p50_ms: Math.round(runs[3] * 10) / 10, ...outcome }
}
const out = (row) => process.stdout.write(`${JSON.stringify({ label, ...row })}\n`)
out({ step: "chatStats", ...(await p50(async () => ({ chats: (await store.chats.chatStats(account)).length }))) })
if (store.chats.chatsNewest)
  out({ step: "chatsNewest", ...(await p50(async () => ({ chats: (await store.chats.chatsNewest(account)).length }))) })
for (const query of ["договор*", "договор", "*договор*", "договор AND chat:12", "*ени", "*ени*", "*ость"]) {
  out({
    query,
    ...(await p50(async () => {
      const found = await searchStore(store, account, { text: query, limit: 50 })
      return { hits: found.items.length, has_more: found.hasMore }
    })),
  })
}
await store.close()
