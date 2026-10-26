// Measures cli-core's own vector index (store version 34) against its scan, on a synthetic store.
//   node core-index.mjs build <dir> <n> <cli-core checkout>
//   node core-index.mjs query <dir> <cli-core checkout> mode=index|scan case=all|recent|chat label=… queries=5
// `build` writes the store through cli-core's openStoreContext (so its migrations and triggers), `query` opens it in a
// new process and prints one JSON line. Synthetic data only: random vectors around 1,500 centres, 384 dimensions.
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const print = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const [command, dir, ...rest] = process.argv.slice(2)
const DIMS = 384
const MODEL = "local:invented-e5:384"
const LIMIT = 100

let seed = 42
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
  return seed / 2_147_483_648
}
const normal = () => Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random())
const normalize = (vector) => {
  const norm = Math.hypot(...vector)
  return vector.map((value) => value / norm)
}
const centres = Array.from({ length: 1_500 }, () => normalize(Float32Array.from({ length: DIMS }, normal)))
const near = (spread) => {
  const centre = centres[Math.floor(random() * centres.length)]
  return normalize(centre.map((value) => value + spread * normal()))
}

const core = async (checkout) => ({
  open: (await import(join(checkout, "dist/store/sqlite/open-store.js"))).openStoreContext,
  index: await import(join(checkout, "dist/store/sqlite/vector-index.js")),
  messages: await import(join(checkout, "dist/store/sqlite/message-chunks.js")),
})

const build = async (n, checkout) => {
  mkdirSync(dir, { recursive: true })
  const { open, index } = await core(checkout)
  const context = await open({ path: join(dir, "wirecat.db"), now: () => 1 })
  const { database } = context
  const run = (sql, ...values) => database.prepare(sql).run(...values)
  const get = (sql, ...values) => database.prepare(sql).get(...values)
  const accounts = [0, 1, 2, 3].map(
    (n) =>
      get(
        "INSERT INTO accounts (provider, external_id, created_at, updated_at) VALUES ('example', ?, 1, 1) RETURNING id",
        `a${n}`,
      ).id,
  )
  const share = [0.55, 0.25, 0.15, 0.05]
  const chats = []
  for (let c = 0; c < 2_000; c++) {
    const account = accounts[c < 1_100 ? 0 : c < 1_600 ? 1 : c < 1_900 ? 2 : 3]
    chats.push({
      account,
      id: get(
        `INSERT INTO chats (account_id, external_id, kind, searchable, created_at, updated_at)
          VALUES (?, ?, 'group', ?, 1, 1) RETURNING id`,
        account,
        `c${c}`,
        c % 20 === 7 ? 0 : 1,
      ).id,
    })
  }
  const chatsOf = accounts.map((account) => chats.filter((chat) => chat.account === account))
  const pickAccount = () => {
    let r = random()
    for (let a = 0; a < 4; a++) {
      r -= share[a]
      if (r < 0) return a
    }
    return 3
  }
  const insertMessage = database.prepare(
    `INSERT INTO messages (chat_id, account_id, external_id, sent_at, text, source, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'x', 'synthetic', ?, 1, 1) RETURNING id`,
  )
  const insertChunk = database.prepare(
    `INSERT INTO chunks (chunkable_type, chunkable_id, position, start_offset, end_offset, content_hash, account_id,
        occurred_at, created_at, updated_at) VALUES ('message', ?, 0, 0, 1, ?, ?, ?, 1, 1)`,
  )
  const insertVector = database.prepare(
    "INSERT INTO embeddings (model, content_hash, dims, vector, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)",
  )
  let written = 0
  const write = (count) => {
    const started = performance.now()
    database.exec("BEGIN IMMEDIATE")
    for (let i = 0; i < count; i++, written++) {
      const a = pickAccount()
      const chat = chatsOf[a][Math.floor(random() * chatsOf[a].length)]
      const at = 1_700_000_000_000 + written * 1_000
      const message = insertMessage.get(chat.id, chat.account, `m${written}`, at, written % 50 === 3 ? 5 : null).id
      const hash = `${written.toString(16).padStart(16, "0")}${"0".repeat(48)}`
      insertChunk.run(message, hash, chat.account, at)
      const vector = near(0.35)
      insertVector.run(MODEL, hash, DIMS, new Uint8Array(vector.buffer))
    }
    database.exec("COMMIT")
    return performance.now() - started
  }
  const report = {}
  let total = 0
  // Without an index first, as an older store holds its vectors: the model has no `vector_indexes` row yet.
  for (let done = 0; done < n - 20_000; done += 5_000) total += write(Math.min(5_000, n - 20_000 - done))
  report.write_without_index_ms_per_1000 = +(write(10_000) / 10).toFixed(1)
  total += report.write_without_index_ms_per_1000 * 10
  report.write_without_index_total_s = +(total / 1000).toFixed(1)
  let started = performance.now()
  index.fillVectorIndexes(database)
  report.fill_s = +((performance.now() - started) / 1000).toFixed(1)
  report.write_with_index_ms_per_1000 = +(write(10_000) / 10).toFixed(1)
  started = performance.now()
  database.exec("BEGIN IMMEDIATE")
  run("DELETE FROM chunks WHERE id IN (SELECT id FROM chunks ORDER BY id DESC LIMIT 1000)")
  database.exec("COMMIT")
  report.delete_1000_chunks_ms = +(performance.now() - started).toFixed(1)
  report.counts = index.vectorIndexCounts(database)
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  // The partitions and the filters the queries use.
  const account = accounts[0]
  const chat = get(
    `SELECT m.chat_id AS id, count(*) AS n FROM messages m JOIN chats ch ON ch.id = m.chat_id
      WHERE m.account_id = ? AND ch.searchable = 1 GROUP BY m.chat_id ORDER BY n DESC LIMIT 1 OFFSET 500`,
    account,
  )
  const recent = get(
    "SELECT sent_at AS at FROM messages WHERE account_id = ? ORDER BY sent_at DESC LIMIT 1 OFFSET ?",
    account,
    Math.floor(n * 0.55 * 0.01),
  ).at
  report.params = { account, chat: chat.id, chat_messages: chat.n, since: recent }
  report.messages = n
  database.close()
  print(JSON.stringify({ build: report }))
}

const query = async (checkout, options) => {
  const { open, messages } = await core(checkout)
  const started = performance.now()
  const context = await open({ path: join(dir, "wirecat.db"), now: () => 1 })
  const opened = performance.now() - started
  const { account, chat, since } = JSON.parse(options.params)
  const filter = options.case === "chat" ? { chatKey: chat } : options.case === "recent" ? { since } : {}
  if (options.mode === "scan") context.database.prepare("UPDATE vector_indexes SET ready = 0").run()
  const times = []
  const answers = []
  try {
    for (let q = 0; q < Number(options.queries ?? 5); q++) {
      seed = 1_000 + q
      const query = near(0.35)
      const t = performance.now()
      const found = messages.nearestMessages(context, account, { model: MODEL, limit: LIMIT, query, ...filter })
      times.push(performance.now() - t)
      answers.push(found.map(({ messageId }) => messageId).join(","))
    }
  } finally {
    if (options.mode === "scan") context.database.prepare("UPDATE vector_indexes SET ready = 1").run()
    context.database.close()
  }
  const sorted = times.slice(1).sort((a, b) => a - b)
  print(
    JSON.stringify({
      mode: options.mode,
      case: options.case,
      label: options.label,
      open_ms: +opened.toFixed(1),
      first_ms: +times[0].toFixed(1),
      median_ms: +(sorted[Math.floor(sorted.length / 2)] ?? times[0]).toFixed(1),
      answers,
    }),
  )
}

if (command === "build") await build(Number(rest[0]), rest[1])
else if (command === "query")
  await query(rest[0], Object.fromEntries(rest.slice(1).map((arg) => arg.split(/=(.*)/s).slice(0, 2))))
else throw new Error("usage: core-index.mjs build <dir> <n> <cli-core> | query <dir> <cli-core> key=value…")
