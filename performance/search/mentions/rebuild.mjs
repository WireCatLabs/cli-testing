// Times `rebuildMentions` on a copy of a store and prints totals only: no value, no text, no name.
//   node rebuild.mjs <cli-messaging checkout, built> <copy of a store>

import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const [checkout, path] = process.argv.slice(2)
const { openStore } = await import(join(checkout, "dist/store/store.js"))

let at = performance.now()
const store = await openStore({ path })
const upgradeMs = performance.now() - at
const runs = []
for (let run = 0; run < 3; run++) {
  at = performance.now()
  const done = await store.rebuildMentions()
  runs.push({ ms: performance.now() - at, ...done })
}
await store.close()

const db = new DatabaseSync(path, { readOnly: true })
const byKind = db
  .prepare(
    "SELECT kind, count(*) AS mentions, count(DISTINCT value) AS values_, round(avg(confidence), 2) AS confidence " +
      "FROM mentions GROUP BY kind ORDER BY kind",
  )
  .all()
const bare = db.prepare("SELECT count(*) AS n FROM mentions WHERE kind = 'url' AND confidence < 0.9").get().n
const sites = db.prepare("SELECT count(DISTINCT domain) AS n FROM mentions WHERE kind = 'url'").get().n
const bytes = db
  .prepare("SELECT sum(pgsize) AS n FROM dbstat WHERE name LIKE 'mention%' OR name = 'sqlite_autoindex_mentions_1'")
  .get().n
const sorted = runs.map(({ ms }) => ms).sort((a, b) => a - b)
process.stdout.write(
  `${JSON.stringify(
    {
      upgradeMs: Math.round(upgradeMs),
      messages: runs[0].messages,
      mentions: runs[0].mentions,
      rebuildMsMedian: Math.round(sorted[1]),
      byKind,
      linksWithoutScheme: bare,
      sites,
      bytes,
    },
    null,
    1,
  )}\n`,
)
