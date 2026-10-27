// node nearest.mjs <cli-core checkout, built> <store.db> <questions.json>
// Times notes.nearest through the vector index, then with the index marked not ready (the scan), on the same
// store, and checks both give the same refs and scores. Prints only timings, counts and the comparison.
import { readFileSync } from "node:fs"

const [core, db, questionsFile] = process.argv.slice(2)
const { openStoreContext } = await import(`${core}/dist/store/sqlite/open-store.js`)
const { noteSearchOver } = await import(`${core}/dist/store/sqlite/note-search.js`)
const { openEmbedder, textModelsDirectory } = await import(`${core}/dist/embeddings/embed.js`)
const { textModel } = await import(`${core}/dist/embeddings/models.js`)

const context = await openStoreContext({ path: db })
const notes = noteSearchOver(context)
const embedder = await openEmbedder(textModel("e5-small"), textModelsDirectory())
const ready = (value) => context.database.prepare("UPDATE vector_indexes SET ready = ?").run(value)
const out = []
for (const question of JSON.parse(readFileSync(questionsFile, "utf8"))) {
  const [vector] = await embedder.embed([question], "query")
  const time = async () => {
    const start = performance.now()
    const found = await notes.nearest("local:e5-small:384", vector, { limit: 20 })
    return [performance.now() - start, found.map(({ ref, score }) => [ref, score])]
  }
  const [indexedMs, indexed] = await time()
  ready(0)
  const [scannedMs, scanned] = await time()
  ready(1)
  out.push({
    question: out.length + 1,
    indexed_ms: Math.round(indexedMs),
    scanned_ms: Math.round(scannedMs),
    hits: indexed.length,
    same: JSON.stringify(indexed) === JSON.stringify(scanned),
  })
}
process.stdout.write(`${JSON.stringify(out)}\n`)
process.exit(0)
