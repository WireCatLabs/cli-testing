// Copies one model's vectors from another store by text hash. Through cli-core's own connection, since inserting into
// embeddings fires the vector-index triggers, which need the sqlite-vec extension Python's sqlite lacks.
import { pathToFileURL } from "node:url"

const [core, target, source, model] = process.argv.slice(2)
const { openCache } = await import(pathToFileURL(`${core}/dist/store/open.js`).href)
const database = await openCache(target)
try {
  database.prepare("ATTACH DATABASE ? AS other").run(source)
  const done = database
    .prepare("INSERT OR IGNORE INTO embeddings SELECT * FROM other.embeddings WHERE model = ?")
    .run(model)
  process.stdout.write(`${JSON.stringify({ copied: Number(done.changes) })}\n`)
} finally {
  database.close()
}
