import { appendFileSync } from "node:fs"
import { it, vi } from "vitest"
import { searchStore } from "../src/services/messages-archive-search.js"
import { statsLucene } from "../src/services/messages-search.js"
import { openStore } from "../src/store/store.js"

vi.mock("../src/store/sqlite/note-index.js", async (original) => ({
  ...(await original<typeof import("../src/store/sqlite/note-index.js")>()),
  drainNoteIndex: () => undefined,
}))

const QUERIES = [
  "встреча",
  "встреча date>=30d",
  "встреча -date>=30d",
  "встреча (date>=30d OR date<=2020-01-01)",
  "date>=7d",
  "the",
]

it("messages", async () => {
  const store = await openStore({ path: process.env.MEASURE_STORE as string, readOnly: true })
  // Filling the word index is a write; this run searches the index as it stands.
  Object.assign(store.searchIndex, { fillSearchIndex: async () => undefined, fillStems: async () => undefined })
  const accounts = (await store.accounts.accounts()).filter(({ provider }) => provider === "telegram")
  const out = process.env.MEASURE_OUT as string
  appendFileSync(out, `${JSON.stringify({ telegram_accounts: accounts.length })}\n`)
  let account = accounts[0]
  let most = -1
  for (const one of accounts) {
    const held = (await store.chats.chatStats(one)).reduce((sum, { messages }) => sum + messages, 0)
    if (held > most) [account, most] = [one, held]
  }
  if (!account) return
  const cutoff = Date.now() - 30 * 86_400_000
  for (const text of QUERIES)
    for (const discover of [false, true]) {
      const request = { text, limit: 20, timezone: "Europe/Madrid", discover, accounts: [account] }
      const found = await searchStore(store, account, request).catch((e: Error) => ({ error: e.message }))
      if ("error" in found) {
        appendFileSync(out, `${JSON.stringify({ text, discover, error: found.error.slice(0, 120) })}\n`)
        continue
      }
      const stats = await statsLucene(store, account, { ...request, discover: undefined, by: "chat" }).catch(
        () => undefined,
      )
      const dated = (want: (at: number) => boolean) =>
        found.items.filter(({ timestamp }) => timestamp && !want(Date.parse(timestamp))).length
      appendFileSync(
        out,
        `${JSON.stringify({
          text,
          discover,
          ran_discovery: found.query?.discovery !== undefined,
          hits: found.items.length,
          total: found.total,
          direct_count: stats?.total ?? null,
          breaks_date: text.includes("-date>=30d")
            ? dated((at) => at < cutoff)
            : text === "budget date>=30d"
              ? dated((at) => at >= cutoff - 86_400_000)
              : null,
        })}\n`,
      )
    }
  await store.close()
}, 900_000)
