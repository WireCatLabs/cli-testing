// Embeds every chunk the store's chosen model lacks, notes then mail, in one process: memo's own sync bounds a run to
// a few dozen chunks with EmbeddingGemma, so one load of the model here saves hundreds of starts. Enrichment stays off.
import { pathToFileURL } from "node:url"

const core = process.argv[2]
const { openStore } = await import(pathToFileURL(`${core}/dist/store/index.js`).href)
const { embedMail, embedNotes } = await import(pathToFileURL(`${core}/dist/services/index.js`).href)
const store = await openStore({ env: process.env })
try {
  const started = Date.now()
  const notes = await embedNotes(store, { env: process.env, maxChunks: Number.POSITIVE_INFINITY })
  const mail = await embedMail(store, { env: process.env, maxChunks: Number.POSITIVE_INFINITY })
  process.stdout.write(`${JSON.stringify({ notes, mail, seconds: (Date.now() - started) / 1000 })}\n`)
} finally {
  await store.close()
}
