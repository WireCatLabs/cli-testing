// Times the readiness queries of `search conversations` (cli-core 0.672.0 against the CROSS JOIN order of
// cli-core#3002) on a store, read only. Prints totals, timings and the query plans' shape; never a row.
// usage: node bench.mjs <wirecat.db> <embedding model key> [runs]
import { createHash } from "node:crypto"
import { DatabaseSync } from "node:sqlite"

const [path, model, runs = "3"] = process.argv.slice(2)
if (!path || !model) throw new Error("usage: node bench.mjs <wirecat.db> <embedding model key> [runs]")
const db = new DatabaseSync(path, { readOnly: true })

const current = (crossJoin) =>
  crossJoin
    ? `SELECT k.content_hash FROM conversations c
        CROSS JOIN chunks k ON k.chunkable_type = 'conversation' AND k.chunkable_id = c.id
        JOIN chunk_messages r ON r.chunk_id = k.id
        WHERE c.chat_id = :chat AND c.build = :build`
    : `SELECT k.content_hash FROM chunks k JOIN chunk_messages r ON r.chunk_id = k.id
        JOIN conversations c ON k.chunkable_type = 'conversation' AND c.id = k.chunkable_id
        WHERE c.chat_id = :chat AND c.build = :build`

const edited = (pk) =>
  `EXISTS (SELECT 1 FROM message_revisions r WHERE r.message_id = ${pk} AND r.created_at >= :builtAt)`
const member = (pk) => `EXISTS (SELECT 1 FROM conversation_messages cm JOIN conversations c ON c.id = cm.conversation_id
  WHERE cm.message_id = ${pk} AND c.build = :build)`

const pending = `SELECT sum(m.deleted_at IS NULL AND NOT ${member("m.id")}) AS new,
    sum(m.deleted_at IS NULL AND ${edited("m.id")} AND ${member("m.id")}) AS edited,
    sum(m.deleted_at IS NOT NULL AND ${member("m.id")}) AS deleted
  FROM messages m WHERE m.chat_id = :chat`

const vectors = (crossJoin) => `WITH changed AS (SELECT m.id, m.sent_at, cm.conversation_id FROM messages m
    JOIN conversation_messages cm ON cm.message_id = m.id
    JOIN conversations c ON c.id = cm.conversation_id AND c.build = :build
    WHERE m.chat_id = :chat AND (m.deleted_at IS NOT NULL OR ${edited("m.id")})),
  stale AS (SELECT DISTINCT k.content_hash AS hash FROM changed g
    ${crossJoin ? "CROSS JOIN" : "JOIN"} chunks k ON k.chunkable_type = 'conversation' AND k.chunkable_id = g.conversation_id
    JOIN chunk_messages r ON r.chunk_id = k.id
    JOIN messages f ON f.id = r.first_message_id JOIN messages l ON l.id = r.last_message_id
    WHERE (g.sent_at, g.id) >= (f.sent_at, f.id) AND (g.sent_at, g.id) <= (l.sent_at, l.id)),
  hashes AS (SELECT DISTINCT h.content_hash AS hash,
      EXISTS (SELECT 1 FROM embeddings v WHERE v.model = :model AND v.content_hash = h.content_hash) AS vector,
      h.content_hash IN (SELECT hash FROM stale) AS stale
    FROM (${current(crossJoin)}) h)
  SELECT count(*) AS chunks, sum(vector) AS embedded, sum(vector AND NOT stale) AS current, sum(stale) AS stale
  FROM hashes`

const chats = db
  .prepare(
    "SELECT chat_id AS chat, current_build AS build, built_at AS builtAt FROM conversation_state WHERE built_at IS NOT NULL",
  )
  .all()
const total = (sql) => db.prepare(sql).get().n
process.stdout.write(
  `${JSON.stringify({
    sqlite: db.prepare("SELECT sqlite_version() AS v").get().v,
    statistics: total("SELECT count(*) AS n FROM sqlite_master WHERE name = 'sqlite_stat1'") > 0,
    builtChats: chats.length,
    messages: total("SELECT count(*) AS n FROM messages"),
    chunks: total("SELECT count(*) AS n FROM chunks"),
  })}\n`,
)

for (const [name, sql] of [
  ["pending", pending],
  ["vectors, before", vectors(false)],
  ["vectors, after", vectors(true)],
]) {
  const statement = db.prepare(sql)
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
  for (const one of [statement, plan]) one.setAllowUnknownNamedParameters(true)
  const storeWide = plan
    .all({ chat: 0, build: 0, builtAt: 0, model })
    .some(({ detail }) => detail === "SEARCH k USING INDEX sqlite_autoindex_chunks_1 (chunkable_type=?)")
  const times = []
  let answers = ""
  for (let run = 0; run < Number(runs); run++) {
    const start = performance.now()
    answers = JSON.stringify(chats.map((chat) => statement.get({ ...chat, model })))
    times.push(Math.round(performance.now() - start))
  }
  const hash = createHash("sha256").update(answers).digest("hex").slice(0, 12)
  process.stdout.write(
    `${JSON.stringify({ query: name, storeWideChunkSearch: storeWide, ms: times, answers: hash })}\n`,
  )
}
