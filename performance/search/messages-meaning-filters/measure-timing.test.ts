import { appendFileSync } from "node:fs"
import { it } from "vitest"
import { DEFAULT_TEXT_MODEL } from "../src/embeddings/models.js"
import { embeddingTarget, withEmbedder } from "../src/services/embeddings-maintenance.js"
import { prepareLucene } from "../src/services/messages-search.js"
import { openStore } from "../src/store/store.js"

const [, , C, D] = (process.env.MEASURE_CHATS ?? "").split(",")
const FILTERS = [
  `chat:"${C}"`,
  `chat:"${D}"`,
  "date>=30d",
  "date>=90d",
  "date>=180d",
  "date>=365d",
  "date>=730d",
  "date>=1500d",
]

it("timing", async () => {
  const store = await openStore({ path: process.env.MEASURE_STORE as string, readOnly: true })
  const account = { provider: "telegram", account: process.env.MEASURE_ACCOUNT as string }
  const deps = { env: process.env, store: async () => store, messenger: { app: { command: "tg" } } }
  const target = embeddingTarget(deps as never, DEFAULT_TEXT_MODEL)
  const out = process.env.MEASURE_OUT as string
  await withEmbedder(deps as never, target, DEFAULT_TEXT_MODEL, {}, async (embedder) => {
    const [query] = (await embedder.embed(["встреча"], "query")) as Float32Array[]
    for (let run = 0; run < 3; run++) {
      let t = performance.now()
      await store.vectors.nearestMessages(account, { model: target.key, limit: 100, query: query as Float32Array })
      const nearest = performance.now() - t
      for (const text of FILTERS) {
        const { execution } = await prepareLucene(
          store,
          account,
          { text, limit: 1, timezone: "Europe/Madrid", accounts: [account] },
          {},
        )
        t = performance.now()
        const pks = (await store.queries.matchingPks(execution, 1_000_000)) ?? []
        const listed = performance.now() - t
        t = performance.now()
        const scored = await store.vectors.scoreMessages(account, {
          model: target.key,
          query: query as Float32Array,
          pks,
        })
        const scoring = performance.now() - t
        appendFileSync(
          out,
          `${JSON.stringify({ run, text, messages: pks.length, with_vectors: scored.length, list_ms: Math.round(listed), score_ms: Math.round(scoring), nearest_ms: Math.round(nearest) })}\n`,
        )
      }
    }
  })
  await store.close()
}, 900_000)
