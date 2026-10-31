import { appendFileSync } from "node:fs"
import { it, vi } from "vitest"
import { DEFAULT_TEXT_MODEL, textModel, vectorModelKey } from "../src/embeddings/models.js"
import { storeQuery } from "../src/services/notes-search.js"
import { openStore } from "../src/store/store.js"

vi.mock("../src/store/sqlite/note-index.js", async (original) => ({
  ...(await original<typeof import("../src/store/sqlite/note-index.js")>()),
  drainNoteIndex: () => undefined,
}))

it("timing", async () => {
  const store = await openStore({ path: process.env.MEASURE_STORE as string, readOnly: true })
  const key = vectorModelKey(textModel(DEFAULT_TEXT_MODEL))
  const { root } = await storeQuery(store, "in:notes")
  const all = await store.notes.matchingRefs({ root, limit: 50_000 })
  const vector = new Float32Array(384).map(() => Math.random() - 0.5)
  const norm = Math.hypot(...vector)
  for (let i = 0; i < vector.length; i++) vector[i] = (vector[i] as number) / norm
  const lines: unknown[] = [{ notes: all.refs.length }]
  for (const n of [150, 500, 1000, all.refs.length]) {
    const refs = all.refs.slice(0, n)
    const runs: number[] = []
    for (let r = 0; r < 3; r++) {
      const t = performance.now()
      await store.notes.scoreNotes(key, vector, refs)
      runs.push(Math.round(performance.now() - t))
    }
    lines.push({ notes: n, ms: runs })
  }
  const g: number[] = []
  for (let r = 0; r < 3; r++) {
    const t = performance.now()
    await store.notes.nearest(key, vector, { limit: 50 })
    g.push(Math.round(performance.now() - t))
  }
  lines.push({ global_nearest_50_ms: g })
  const c: number[] = []
  for (let r = 0; r < 3; r++) {
    const t = performance.now()
    await store.notes.matchingRefs({ root, limit: 10_000 })
    c.push(Math.round(performance.now() - t))
  }
  lines.push({ count_all_ms: c })
  appendFileSync(process.env.MEASURE_OUT as string, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`)
  await store.close()
}, 900_000)
