// Copy into the root of a cli-core checkout, then: npx tsx bench-split.ts <state dir made by bench-search-all.ts>
import { join } from "node:path"
const state = process.argv[2] as string
process.env.WIRECAT_STATE_DIR = state
const { openStore } = await import("./src/store/store.js")
const { storedDeps } = await import("./src/services/deps.js")
const { embeddingTarget } = await import("./src/services/embeddings-maintenance.js")
const store = await openStore({ path: join(state, "m.db") })
const accounts = [{ provider: "test", account: "1" }, { provider: "test", account: "2" }]
const first = accounts[0] as { provider: string; account: string }
const deps = storedDeps({ provider: "test", app: { command: "chat" } } as never, store, first, {} as never)
const target = embeddingTarget(deps, "e5-small")
const t = () => performance.now()
const opens: number[] = [], embeds: number[] = [], nears: number[] = []
let vector: Float32Array | undefined
for (let i = 0; i < 10; i++) {
  let s = t()
  const embedder = await target.open({})
  opens.push(t() - s)
  s = t()
  ;[vector] = (await embedder.embed([`question number ${i} about paying the bill`], "query")) as Float32Array[]
  embeds.push(t() - s)
  await embedder.close()
  s = t()
  for (const one of accounts) await store.vectors.nearestMessages(one, { model: target.key, limit: 100, query: vector as Float32Array })
  nears.push(t() - s)
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]?.toFixed(0)
console.log(`open e5-small: median ${med(opens)} ms; embed one query: ${med(embeds)} ms; nearestMessages x2 accounts (10k vectors): ${med(nears)} ms`)
await store.close()
