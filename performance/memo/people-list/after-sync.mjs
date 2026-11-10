// What the next list costs after a message sync: 10,000 new messages from 2,000 senders, committed by another
// connection, then one `people list --limit 50`. Run on a store a list has already worked out.
//   node after-sync.mjs <cli-core dist folder> <store file>
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [dist, path] = process.argv.slice(2)
const { openStore } = await import(pathToFileURL(join(dist, "store/store.js")).href)
const store = await openStore({ env: { ...process.env, MESSAGING_STORE: path } })
await store.people.list({ limit: 50 })
const writer = new DatabaseSync(path)
writer.exec("PRAGMA foreign_keys = OFF")
const insert = writer.prepare(
  "INSERT INTO messages (chat_id, account_id, external_id, sender_identity_id, sent_at, text, outgoing, created_at, " +
    "source, updated_at) VALUES (?, 1, ?, ?, ?, 'hello', 0, 0, 'sync', 0)",
)
for (let run = 0; run < 3; run++) {
  writer.exec("BEGIN")
  for (let i = 0; i < 10_000; i++) insert.run(1 + (i % 50), `sync${run}-${i}`, 3_000 + ((i * 7) % 2_000), 1.9e12 + i)
  writer.exec("COMMIT")
  const stale = Number(writer.prepare("SELECT count(*) AS n FROM persons WHERE kind IS NULL").get()?.n)
  const began = performance.now()
  await store.people.list({ limit: 50 })
  process.stdout.write(
    `sync ${run + 1}: ${stale} people to work out, next list ${(performance.now() - began).toFixed(0)} ms\n`,
  )
}
writer.close()
await store.close()
