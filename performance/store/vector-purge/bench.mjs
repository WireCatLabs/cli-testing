// Usage: node bench.mjs <wirecat.db> [texts]
// Opens a store read-only and times the two lookups purgeVectorHashes makes for each old chunk text, as cli-core
// wrote them before and after WireCatLabs/cli-core#3118. Prints the query plans and totals only.
import { DatabaseSync } from "node:sqlite"

const [path, textsArg = "200"] = process.argv.slice(2)
const texts = Number(textsArg)
const db = new DatabaseSync(path, { readOnly: true })

const candidates = (plus) => `SELECT k.chunkable_id, r.first_message_id, r.last_message_id, r.text_start, r.text_end
  FROM chunks k JOIN chunk_messages r ON r.chunk_id = k.id
  JOIN conversations c ON ${plus}k.chunkable_type = 'conversation' AND c.id = k.chunkable_id
  JOIN conversation_state s ON s.chat_id = c.chat_id AND s.current_build = c.build
  WHERE k.content_hash = ? ORDER BY k.chunkable_id, k.position LIMIT 100 OFFSET 0`
const byHash = "SELECT count(*) FROM embeddings WHERE content_hash = ?"
const byKey = "SELECT count(*) FROM embeddings WHERE model = ? AND content_hash = ?"

const count = (sql) => Number(Object.values(db.prepare(sql).get())[0])
const hashes = db
  .prepare("SELECT content_hash AS hash FROM chunks WHERE chunkable_type = 'conversation' ORDER BY id LIMIT ?")
  .all(texts)
  .map(({ hash }) => hash)
const models = db
  .prepare("SELECT DISTINCT model FROM embeddings")
  .all()
  .map(({ model }) => model)
const say = (line) => process.stdout.write(`${line}\n`)
say(
  `conversation chunks ${count("SELECT count(*) FROM chunks WHERE chunkable_type = 'conversation'")}, ` +
    `vectors ${count("SELECT count(*) FROM embeddings")}, models ${models.length}, texts timed ${hashes.length}`,
)

const plan = (sql, ...args) =>
  db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...args)
    .map(({ detail }) => detail)[0]
const time = (label, sql, run) => {
  const statement = db.prepare(sql)
  const started = performance.now()
  for (const hash of hashes) run(statement, hash)
  const each = (performance.now() - started) / hashes.length
  say(`${label}: ${each.toFixed(2)} ms per text — ${plan(sql, ...(sql === byKey ? ["m", "h"] : ["h"]))}`)
}

time("candidates before", candidates(""), (statement, hash) => statement.all(hash))
time("candidates after", candidates("+"), (statement, hash) => statement.all(hash))
time("vector lookup before", byHash, (statement, hash) => statement.get(hash))
time("vector lookup after", byKey, (statement, hash) => {
  for (const model of models) statement.get(model, hash)
})
