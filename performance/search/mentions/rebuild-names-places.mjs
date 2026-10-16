// Rebuilds names and places on a copy of a store and prints totals only: no value, no text, no name.
//   node rebuild-names-places.mjs <cli-core checkout, built> <copy of a store>
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const [checkout, path] = process.argv.slice(2)
const { openStore } = await import(join(checkout, "dist/store/store.js"))
const db0 = new DatabaseSync(path, { readOnly: true })
const before = db0
  .prepare("SELECT kind, count(*) AS n FROM mentions WHERE kind IN ('person-name','place') GROUP BY kind")
  .all()
db0.close()
const store = await openStore({ path })
const at = performance.now()
const done = await store.rebuildMentions({ kinds: ["person-name", "place"] })
const ms = Math.round(performance.now() - at)
await store.close()
const db = new DatabaseSync(path, { readOnly: true })
const rows = db
  .prepare(
    "SELECT kind, source_type, status, confidence, count(*) AS mentions, count(DISTINCT value) AS values_, " +
      "count(DISTINCT source_id) AS texts FROM mentions WHERE kind IN ('person-name','place') " +
      "GROUP BY kind, source_type, status, confidence ORDER BY kind, source_type, status, confidence",
  )
  .all()
const texts = Object.fromEntries(
  ["messages", "attachments", "documents", "notes", "emails"].map((t) => [
    t,
    db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n,
  ]),
)
process.stdout.write(`${JSON.stringify({ ms, done, before, texts, rows }, null, 1)}\n`)
