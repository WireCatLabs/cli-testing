// Usage: node bench.mjs <cli-core checkout with dist> [chat counts, comma-separated]
// Synthetic data only. Times reading every chat id of one account, as `storedChats` gets them when `feed` starts.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, countsArg = "5000,20000,50000"] = process.argv.slice(2)
const { openStore } = await import(pathToFileURL(join(core, "dist", "store", "index.js")).href)
const account = { provider: "whatsapp", account: "500" }
const other = { provider: "whatsapp", account: "600" }

for (const n of countsArg.split(",").map(Number)) {
  const store = await openStore({ path: join(mkdtempSync(join(tmpdir(), "stored-chat-ids-")), "wirecat.db") })
  const chats = Array.from({ length: n }, (_, i) => ({
    id: `${34600000000 + i}@s.whatsapp.net`,
    title: `Person number ${i} with a long-ish name`,
    kind: "dialog",
    unreadCount: 0,
    lastMessageAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    participantsCount: 2,
    providerMetadata: { pinned: null, muted: false, archived: false, about: "x".repeat(80) },
  }))
  for (let i = 0; i < n; i += 1000) await store.chats.saveChats(account, chats.slice(i, i + 1000))
  await store.chats.saveChats(other, chats.slice(0, 100))
  const scoped = store.forAccount(account)
  const times = []
  let ids = []
  for (let run = 0; run < 5; run++) {
    const started = performance.now()
    ids = (await scoped.chats.chats({})).items.map((chat) => chat.id)
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  const count = (value) => value.toLocaleString("en")
  process.stdout.write(
    `| ${count(n)} | ${count(ids.length)} | ${times[2].toFixed(1)} ms | ${times[0].toFixed(1)} ms |\n`,
  )
  await store.close()
}
