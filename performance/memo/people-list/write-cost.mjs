// What the version 62 triggers add to a sync: 50,000 messages inserted one statement at a time in one transaction,
// rolled back, three times. SENDERS spreads them over that many identities (default 110,000).
//   node write-cost.mjs <store file>
import { DatabaseSync } from "node:sqlite"

const db = new DatabaseSync(process.argv[2])
db.exec("PRAGMA foreign_keys = OFF")
const insert = db.prepare(
  "INSERT INTO messages (chat_id, account_id, external_id, sender_identity_id, sent_at, text, outgoing, created_at, source, updated_at) VALUES (?, 1, ?, ?, ?, 'hello', 0, 0, 'sync', 0)",
)
const runs = []
for (let r = 0; r < 3; r++) {
  const b = performance.now()
  db.exec("BEGIN")
  for (let i = 0; i < 50_000; i++)
    insert.run(
      1 + (i % 9000),
      `w${r}-${i}`,
      1 + ((i * 7919) % Number(process.env.SENDERS ?? 110000)),
      1800000000000 + i,
    )
  db.exec("ROLLBACK")
  runs.push(performance.now() - b)
}
process.stdout.write(`${runs.map((x) => x.toFixed(0)).join(" ")} ms\n`)
