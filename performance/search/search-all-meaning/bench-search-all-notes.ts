// Copy into the root of a cli-core checkout, then: npx tsx bench-search-all-notes.ts <state dir made by bench-search-all.ts> [add-notes]
import { join } from "node:path"
const state = process.argv[2] as string
process.env.WIRECAT_STATE_DIR = state
const root = process.cwd()
const { openStore } = await import(join(root, "src/store/store.js"))
const { storedDeps } = await import(join(root, "src/services/deps.js"))
const { meaningLane } = await import(join(root, "src/services/messages-meaning.js"))
const { searchAll } = await import(join(root, "src/services/search-all.js"))
const { embedNotes } = await import(join(root, "src/services/notes-search.js"))
const store = await openStore({ path: join(state, "m.db") })
if (process.argv[3] === "add-notes") {
  const vocab = "invoice payment meeting flight hotel train budget report dinner coffee doctor holiday".split(" ")
  for (let i = 0; i < 200; i++) await store.notes.addNote({ text: `note ${i}: ${vocab[i % vocab.length]} ${vocab[(i * 7) % vocab.length]} plans` })
  console.log("notes embedded:", (await embedNotes(store, {})).embedded)
}
const account = { provider: "test", account: "1" }
const lane = meaningLane(storedDeps({ provider: "test", app: { command: "chat" } } as never, store, account, {} as never))
const queries = ["paying the bill", "trip abroad", "cat", "doctor appointment", "release bug"]
const t = () => performance.now()
const times: number[] = []
let last: { messages?: unknown; notes?: unknown; searched: string[] } | undefined
for (let round = 0; round < 3; round++)
  for (const q of queries) {
    const s = t()
    last = await searchAll(store, account, { text: q, limit: 20, env: process.env }, {}, undefined, lane)
    times.push(t() - s)
  }
times.sort((a, b) => a - b)
console.log(`search all, messages + notes, both by meaning: median ${times[7]?.toFixed(0)} ms, max ${times.at(-1)?.toFixed(0)} ms (n=15)`)
console.log("last:", JSON.stringify(last?.messages), JSON.stringify(last?.notes), last?.searched.join(","))
await store.close()
