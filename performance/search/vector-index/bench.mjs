// Vector search over Core's SQLite store: synthetic data, one measurement per process.
// usage: node|bun bench.mjs <command> <dir> [options as key=value]
//   build   dir n=100000 core=<cli-core checkout>   store.db with Core's schema and synthetic rows
//   scan    dir case=<conversation|image|account> variant=<…>
//   vec0    dir build | case=… variant=vec0-f32|vec0-i8 k=…
//   ann     dir build | case=… lib=usearch|usearch-i8|hnswlib k=… load=load|view
//   packed  dir build | case=…
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { loadavg } from "node:os"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const [command, dir, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => a.split("=")))
const isBun = "Bun" in globalThis
const runtime = isBun ? `bun ${Bun.version}` : `node ${process.version}`
const D = 384
const MODEL = "multilingual-e5-small"
const PAGE = 5_000
const ACCOUNT = 1
const QUERIES = Number(opt.queries ?? 20)
const now = () => performance.now()
const round = (x) => Math.round(x * 10) / 10
const rssMB = () => Math.round(process.memoryUsage().rss / 2 ** 20)
const emit = (o) => process.stdout.write(`${JSON.stringify({ runtime, command, ...o })}\n`)

const open = async (path, { extensions = false } = {}) => {
  if (isBun) {
    const { Database } = await import("bun:sqlite")
    const db = new Database(path)
    const cache = new Map()
    const stmt = (s) => cache.get(s) ?? cache.set(s, db.query(s)).get(s)
    return {
      exec: (s) => db.exec(s),
      all: (s, ...p) => stmt(s).all(...p),
      get: (s, ...p) => stmt(s).get(...p),
      run: (s, ...p) => stmt(s).run(...p),
      load: (p) => db.loadExtension(p),
      close: () => db.close(),
    }
  }
  const { DatabaseSync } = await import("node:sqlite")
  const db = new DatabaseSync(path, { allowExtension: extensions, enableForeignKeyConstraints: false })
  const cache = new Map()
  const stmt = (s) => cache.get(s) ?? cache.set(s, db.prepare(s)).get(s)
  return {
    exec: (s) => db.exec(s),
    all: (s, ...p) => stmt(s).all(...p),
    get: (s, ...p) => stmt(s).get(...p),
    run: (s, ...p) => stmt(s).run(...p),
    load: (p) => db.loadExtension(p),
    close: () => db.close(),
  }
}

// Deterministic generator, so every runtime and every candidate sees the same store and queries.
let seed = 7
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
const normalize = (v) => {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  s = Math.sqrt(s)
  for (let i = 0; i < v.length; i++) v[i] /= s
  return v
}
const CLUSTERS = 1500
const SPREAD = 1.0
const centroids = () => Array.from({ length: CLUSTERS }, () => normalize(Float32Array.from({ length: D }, gauss)))
const near = (center, spread) => {
  const v = new Float32Array(D)
  const k = spread / Math.sqrt(D)
  for (let i = 0; i < D; i++) v[i] = center[i] + k * gauss()
  return normalize(v)
}
const bytes = (v) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength)

// int8 with a per-vector scale in the first 4 bytes: the scale differs per vector, so it has to travel with it.
const quantize = (v) => {
  let max = 0
  for (let i = 0; i < D; i++) max = Math.max(max, Math.abs(v[i]))
  const out = new Uint8Array(4 + D)
  new DataView(out.buffer).setFloat32(0, max / 127, true)
  const q = new Int8Array(out.buffer, 4)
  for (let i = 0; i < D; i++) q[i] = Math.round((v[i] / max) * 127)
  return out
}
// One fixed scale for sqlite-vec's int8 column, which stores no per-vector scale.
const VEC0_SCALE = 127 / 0.25
const quantizeFixed = (v) => Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round(x * VEC0_SCALE))))

const hash = (i) => createHash("sha256").update(`chunk ${i}`).digest("hex")

// Shares of the chunks, by type and by account.
const TYPES = [
  ["conversation", 0.7],
  ["document", 0.15],
  ["email", 0.1],
  ["image", 0.05],
]
const ACCOUNTS = [0.55, 0.25, 0.15, 0.05]
const pick = (shares) => {
  let r = rand()
  for (let i = 0; i < shares.length; i++) {
    r -= shares[i]
    if (r < 0) return i
  }
  return shares.length - 1
}

const build = async () => {
  const n = Number(opt.n)
  mkdirSync(dir, { recursive: true })
  const { GENERATED } = await import(join(opt.core, "src/store/sqlite/migrations.generated.ts"))
  const db = await open(join(dir, "store.db"))
  db.exec("PRAGMA journal_mode = WAL")
  for (const { statements } of GENERATED) for (const s of statements) db.exec(s)
  // Candidate 4 only: the same vectors as int8, beside the float ones so both read the same chunks.
  db.exec(
    "CREATE TABLE embeddings_i8 (model text NOT NULL, content_hash text NOT NULL, vector blob NOT NULL, PRIMARY KEY (model, content_hash))",
  )
  const at = 1_700_000_000_000
  db.exec("BEGIN")
  ACCOUNTS.forEach((_, a) => {
    db.run(
      "INSERT INTO accounts (id, provider, external_id, created_at, updated_at) VALUES (?, 'telegram', ?, ?, ?)",
      a + 1,
      `acct${a + 1}`,
      at,
      at,
    )
  })
  const chatsPerAccount = ACCOUNTS.map((share) => Math.max(5, Math.round((n * share) / 300)))
  const chats = []
  chatsPerAccount.forEach((count, a) => {
    for (let c = 0; c < count; c++) {
      const id = chats.length + 1
      // One chat in twenty is hidden from search (`searchable = 0`), so the join filters something.
      const searchable = rand() < 0.05 ? 0 : 1
      db.run(
        `INSERT INTO chats (id, account_id, external_id, kind, title, updated_at, created_at, searchable)
          VALUES (?, ?, ?, 'group', ?, ?, ?, ?)`,
        id,
        a + 1,
        `chat${id}`,
        `Chat ${id}`,
        at,
        at,
        searchable,
      )
      db.run(
        "INSERT INTO conversation_state (chat_id, enabled_at, built_at, algorithm_version, current_build) VALUES (?, ?, ?, 1, 2)",
        id,
        at,
        at,
      )
      chats.push({ id, account: a + 1 })
    }
  })
  const byAccount = ACCOUNTS.map((_, a) => chats.filter((c) => c.account === a + 1))
  const centers = centroids()
  const text =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna."
  let messageId = 0
  let conversationId = 0
  let attachmentId = 0
  let conversation = null
  const insertMessage = (chat, deleted) => {
    messageId++
    db.run(
      `INSERT INTO messages (id, chat_id, account_id, external_id, sender_name, sent_at, deleted_at, text, created_at,
          source, updated_at) VALUES (?, ?, ?, ?, 'Someone', ?, ?, ?, ?, 'sync', ?)`,
      messageId,
      chat.id,
      chat.account,
      `m${messageId}`,
      at + messageId,
      deleted ? at : null,
      text,
      at,
      at,
    )
    return messageId
  }
  const t0 = now()
  for (let i = 1; i <= n; i++) {
    const type = TYPES[pick(TYPES.map(([, s]) => s))][0]
    const account = pick(ACCOUNTS) + 1
    const pool = byAccount[account - 1]
    const chat = pool[Math.floor(rand() * pool.length)]
    let chunkableId
    let position = 0
    if (type === "conversation") {
      // About three chunks per conversation; an old build's conversation now and then, which the search skips.
      if (!conversation || conversation.chat !== chat || conversation.position >= 2 || rand() < 0.3) {
        conversationId++
        const first = insertMessage(chat, false)
        const build = rand() < 0.03 ? 1 : 2
        db.run(
          `INSERT INTO conversations (id, chat_id, first_message_id, build, first_at, last_at, message_count, built_at,
              algorithm_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 3, ?, 1, ?, ?)`,
          conversationId,
          chat.id,
          first,
          build,
          at,
          at,
          at,
          at,
          at,
        )
        conversation = { id: conversationId, chat, position: -1, first }
      }
      conversation.position++
      chunkableId = conversation.id
      position = conversation.position
    } else if (type === "image") {
      const message = insertMessage(chat, rand() < 0.02)
      attachmentId++
      db.run(
        `INSERT INTO attachments (id, attachable_type, attachable_id, position, kind, mime, name, created_at, updated_at)
          VALUES (?, 'message', ?, 0, 'photo', 'image/jpeg', ?, ?, ?)`,
        attachmentId,
        message,
        `IMG_${attachmentId}.jpg`,
        at,
        at,
      )
      chunkableId = attachmentId
    } else {
      chunkableId = i
    }
    const h = hash(i)
    db.run(
      `INSERT INTO chunks (id, chunkable_type, chunkable_id, position, start_offset, end_offset, content_hash, scope,
          account_id, occurred_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 400, ?, 'personal', ?, ?, ?, ?)`,
      i,
      type,
      chunkableId,
      position,
      h,
      account,
      at + i,
      at,
      at,
    )
    if (type === "conversation") {
      const last = insertMessage(chat, false)
      db.run(
        "INSERT INTO chunk_messages (chunk_id, first_message_id, last_message_id) VALUES (?, ?, ?)",
        i,
        conversation.first,
        last,
      )
    }
    const v = near(centers[Math.floor(rand() * CLUSTERS)], SPREAD)
    db.run(
      "INSERT INTO embeddings (model, content_hash, dims, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      MODEL,
      h,
      D,
      bytes(v),
      at,
      at,
    )
    db.run("INSERT INTO embeddings_i8 (model, content_hash, vector) VALUES (?, ?, ?)", MODEL, h, quantize(v))
    if (i % 100_000 === 0) {
      db.exec("COMMIT; BEGIN")
      process.stderr.write(`${i} rows, ${Math.round((now() - t0) / 1000)} s\n`)
    }
  }
  db.exec("COMMIT")
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.exec("ANALYZE")
  // Queries are perturbed stored vectors: each has real neighbours, as a question about something said has.
  const queries = new Float32Array(QUERIES * 4 * D)
  for (let q = 0; q < QUERIES * 4; q++) queries.set(near(centers[Math.floor(rand() * CLUSTERS)], SPREAD * 1.2), q * D)
  writeFileSync(join(dir, "queries.f32"), bytes(queries))
  const counts = db.all("SELECT chunkable_type AS type, account_id AS account, count(*) AS n FROM chunks GROUP BY 1, 2")
  db.close()
  emit({ n, ms: Math.round(now() - t0), fileMB: Math.round(statSync(join(dir, "store.db")).size / 2 ** 20), counts })
}

const queriesOf = () => {
  const buf = readFileSync(join(dir, "queries.f32"))
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  return Array.from({ length: QUERIES }, (_, q) => all.slice(q * D, (q + 1) * D))
}

// Core's `dot` as of cli-core db1bdf8e: copies every blob before reading it.
const dotCopy = (query, blob) => {
  const vector = new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))
  let sum = 0
  for (let index = 0; index < query.length; index++) sum += query[index] * vector[index]
  return sum
}
// node:sqlite and bun:sqlite both hand each blob its own ArrayBuffer at offset 0, so a view needs no copy.
const dotView = (query, blob) => {
  const vector =
    blob.byteOffset % 4 === 0
      ? new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
      : new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))
  let sum = 0
  for (let index = 0; index < query.length; index++) sum += query[index] * vector[index]
  return sum
}
const dotInt8 = (query, blob) => {
  const scale = new DataView(blob.buffer, blob.byteOffset, 4).getFloat32(0, true)
  const vector = new Int8Array(blob.buffer, blob.byteOffset + 4, D)
  let sum = 0
  for (let index = 0; index < D; index++) sum += query[index] * vector[index]
  return sum * scale
}

const topK = (k) => {
  const items = []
  return {
    push(score, item) {
      if (items.length === k && score <= items[k - 1].score) return
      let i = items.length === k ? k - 1 : items.length
      if (items.length < k) items.push(null)
      while (i > 0 && items[i - 1].score < score) {
        items[i] = items[i - 1]
        i--
      }
      items[i] = { score, ...item }
    },
    items,
  }
}

// The two searches as written in cli-core db1bdf8e (vectors.ts nearestChunks, image-chunks.ts nearestImages),
// with no optional filter but the default `searchable`, and the column list swappable for the time split.
const CONVERSATION_SQL = (columns, accountFilter = "ch.account_id = ?") => `SELECT ${columns} FROM chunks k
  CROSS JOIN conversations c ON c.id = k.chunkable_id
  JOIN chunk_messages r ON r.chunk_id = k.id
  JOIN conversation_state s ON s.chat_id = c.chat_id AND s.current_build = c.build
  JOIN chats ch ON ch.id = c.chat_id
  JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash
  WHERE k.chunkable_type = 'conversation' AND ${accountFilter}
    AND ch.searchable = 1
    AND (k.chunkable_id, k.position) > (?, ?) ${sinceSql}
  ORDER BY k.chunkable_id, k.position LIMIT ${PAGE}`
const CONVERSATION_COLUMNS = `k.chunkable_id AS conversation, k.position AS ordinal, r.first_message_id AS first,
  r.last_message_id AS last, r.text_start AS start, r.text_end AS end, k.content_hash AS hash`
const IMAGE_SQL = (columns, accountFilter = "ch.account_id = ?") => `SELECT ${columns}
  FROM chunks k CROSS JOIN attachments a ON a.id = k.chunkable_id AND a.attachable_type = 'message'
    JOIN messages m ON m.id = a.attachable_id AND m.deleted_at IS NULL
    JOIN chats ch ON ch.id = m.chat_id
    JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash
  WHERE k.chunkable_type = 'image' AND k.position = 0 AND ${accountFilter}
    AND k.id > ? AND ch.searchable = 1
  ORDER BY k.id LIMIT ${PAGE}`
const IMAGE_COLUMNS = "k.id, ch.external_id AS chatId, m.external_id AS messageId"

// Score first, join later: walk only chunks + embeddings, keep a shortlist, then check the shortlist's rows.
const SHORTLIST_SQL = (type, table = "embeddings") => `SELECT k.id, v.vector FROM chunks k
  JOIN ${table} v ON v.model = ? AND v.content_hash = k.content_hash
  WHERE k.account_id = ? ${type ? "AND k.chunkable_type = ?" : ""} AND k.id > ?
  ORDER BY k.id LIMIT ${PAGE}`

const CONVERSATION_DETAIL = `SELECT k.id, k.chunkable_id AS conversation FROM chunks k
  JOIN conversations c ON c.id = k.chunkable_id
  JOIN conversation_state s ON s.chat_id = c.chat_id AND s.current_build = c.build
  JOIN chats ch ON ch.id = c.chat_id
  WHERE k.id IN (SELECT value FROM json_each(?)) AND k.chunkable_type = 'conversation'
    AND ch.account_id = ? AND ch.searchable = 1`
const IMAGE_DETAIL = `SELECT k.id, ch.external_id AS chatId, m.external_id AS messageId FROM chunks k
  JOIN attachments a ON a.id = k.chunkable_id AND a.attachable_type = 'message'
  JOIN messages m ON m.id = a.attachable_id AND m.deleted_at IS NULL
  JOIN chats ch ON ch.id = m.chat_id
  WHERE k.id IN (SELECT value FROM json_each(?)) AND k.chunkable_type = 'image' AND k.position = 0
    AND ch.account_id = ? AND ch.searchable = 1`
const ACCOUNT_DETAIL = `SELECT k.id, k.chunkable_type || ':' || k.chunkable_id AS item FROM chunks k
  WHERE k.id IN (SELECT value FROM json_each(?)) AND k.account_id = ?`

const LIMIT = 50

// since=0.1 keeps the newest tenth of the chunks: a narrow filter, which a shortlist scored first can run dry on.
let sinceSql = ""
const applySince = (db) => {
  if (!opt.since) return
  const { low, high } = db.get("SELECT min(occurred_at) AS low, max(occurred_at) AS high FROM chunks")
  sinceSql = `AND k.occurred_at >= ${Math.round(high - (high - low) * Number(opt.since))}`
}

// Turns scored chunk ids (best first) into the search's answer: rows that pass the filters, one per item.
const finish = (db, kind, ranked) => {
  const ids = ranked.map((r) => r.id)
  const detail = kind === "conversation" ? CONVERSATION_DETAIL : kind === "image" ? IMAGE_DETAIL : ACCOUNT_DETAIL
  const rows = new Map(db.all(`${detail} ${sinceSql}`, JSON.stringify(ids), ACCOUNT).map((row) => [row.id, row]))
  const seen = new Set()
  const out = []
  for (const r of ranked) {
    const row = rows.get(r.id)
    if (!row) continue
    const item = kind === "conversation" ? row.conversation : kind === "image" ? r.id : row.item
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
    if (out.length === LIMIT) break
  }
  return out
}

const scanCurrent = (db, kind, variant, query, split) => {
  const sqlOnly = variant === "sql-only"
  const vector = sqlOnly ? "v.rowid AS vector" : "v.vector"
  const dot = variant === "current" || sqlOnly || variant === "read-only" ? dotCopy : dotView
  const accountFilter = variant === "account-direct" ? "k.account_id = ?" : "ch.account_id = ?"
  if (kind === "conversation") {
    const best = new Map()
    let after = { conversation: 0, ordinal: -1 }
    const sql = CONVERSATION_SQL(`${CONVERSATION_COLUMNS}, ${vector}`, accountFilter)
    for (;;) {
      let t = now()
      const rows = db.all(sql, MODEL, ACCOUNT, after.conversation, after.ordinal)
      split.sql += now() - t
      t = now()
      if (!sqlOnly && variant !== "read-only")
        for (const row of rows) {
          const score = dot(query, row.vector)
          const held = best.get(row.conversation)
          if (!held || score > held.score) best.set(row.conversation, { conversation: row.conversation, score })
        }
      split.score += now() - t
      split.rows += rows.length
      const last = rows.at(-1)
      if (!last || rows.length < PAGE) break
      after = { conversation: last.conversation, ordinal: last.ordinal }
    }
    const t = now()
    const out = [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT)
      .map((r) => r.conversation)
    split.sort += now() - t
    return out
  }
  const found = []
  let after = 0
  const sql = IMAGE_SQL(`${IMAGE_COLUMNS}, ${vector}`, accountFilter)
  for (;;) {
    let t = now()
    const rows = db.all(sql, MODEL, ACCOUNT, after)
    split.sql += now() - t
    t = now()
    if (!sqlOnly && variant !== "read-only")
      for (const row of rows) found.push({ id: row.id, score: dot(query, row.vector) })
    split.score += now() - t
    split.rows += rows.length
    const last = rows.at(-1)
    if (!last || rows.length < PAGE) break
    after = last.id
  }
  const t = now()
  const out = found
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((r) => r.id)
  split.sort += now() - t
  return out
}

// Shortlist size: enough that dropping hidden chats, old builds, deleted messages and repeat conversations
// still leaves LIMIT answers. Checked against the exact answer as recall, not assumed.
const SHORTLIST = Number(opt.shortlist ?? 400)

const scanShortlist = (db, kind, variant, query, split) => {
  const int8 = variant === "shortlist-i8" || variant === "shortlist-i8-rescore"
  const table = int8 ? "embeddings_i8" : "embeddings"
  const dot = int8 ? dotInt8 : dotView
  const rescore = variant === "shortlist-i8-rescore"
  const best = topK(rescore ? SHORTLIST * 2 : SHORTLIST)
  const sql = SHORTLIST_SQL(kind === "account" ? null : kind, table)
  let after = 0
  for (;;) {
    let t = now()
    const rows = kind === "account" ? db.all(sql, MODEL, ACCOUNT, after) : db.all(sql, MODEL, ACCOUNT, kind, after)
    split.sql += now() - t
    t = now()
    for (const row of rows) best.push(dot(query, row.vector), { id: row.id })
    split.score += now() - t
    split.rows += rows.length
    const last = rows.at(-1)
    if (!last || rows.length < PAGE) break
    after = last.id
  }
  const t = now()
  let ranked = best.items
  if (rescore) {
    const vectors = db.all(
      `SELECT k.id, v.vector FROM chunks k JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash
        WHERE k.id IN (SELECT value FROM json_each(?))`,
      MODEL,
      JSON.stringify(ranked.map((r) => r.id)),
    )
    ranked = vectors.map((r) => ({ id: r.id, score: dotView(query, r.vector) })).sort((a, b) => b.score - a.score)
  }
  const out = finish(db, kind, ranked)
  split.finish += now() - t
  return out
}

// Exact answers, from the float scan, for recall: written by `scan variant=current`, read by the lossy ones.
const truthPath = (kind) => join(dir, `truth-${kind}${opt.since ? `-since${opt.since}` : ""}.json`)
const recall = (kind, answers) => {
  if (!existsSync(truthPath(kind))) return undefined
  const truth = JSON.parse(readFileSync(truthPath(kind), "utf8"))
  const at = (k) =>
    round(
      (100 *
        answers.reduce((sum, a, q) => sum + a.slice(0, k).filter((x) => truth[q].slice(0, k).includes(x)).length, 0)) /
        answers.reduce((sum, _, q) => sum + Math.min(k, truth[q].length), 0),
    )
  return { at10: at(10), at50: at(50) }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const measure = (kind, variant, run, extra = {}) => {
  const queries = queriesOf()
  const times = []
  const answers = []
  const splits = []
  for (const query of queries) {
    const split = { sql: 0, score: 0, sort: 0, finish: 0, rows: 0 }
    const t = now()
    answers.push(run(query, split))
    times.push(now() - t)
    splits.push(split)
  }
  if (variant.startsWith("current") && kind !== "account") writeFileSync(truthPath(kind), JSON.stringify(answers))
  if (variant === "exact" && kind === "account") writeFileSync(truthPath(kind), JSON.stringify(answers))
  const mid = splits[Math.floor(splits.length / 2)]
  emit({
    dir,
    case: kind,
    variant,
    ...(opt.label ? { label: opt.label } : {}),
    firstMs: round(times[0]),
    warmMs: round(median(times.slice(1))),
    split: {
      sqlMs: round(mid.sql),
      scoreMs: round(mid.score),
      sortMs: round(mid.sort),
      finishMs: round(mid.finish),
      rows: mid.rows,
    },
    recall: ["current", "sql-only", "read-only", "embeddings-only", "exact"].includes(variant.split(" ")[0])
      ? undefined
      : recall(kind, answers),
    rssMB: rssMB(),
    load: round(loadavg()[0]),
    ...extra,
  })
}

const scan = async () => {
  const db = await open(join(dir, "store.db"))
  applySince(db)
  const { case: kind, variant } = opt
  if (opt.index === "type-position")
    db.exec("CREATE INDEX IF NOT EXISTS chunks_by_type_position ON chunks (chunkable_type, position, id)")
  if (opt.index === "account-type")
    db.exec("CREATE INDEX IF NOT EXISTS chunks_by_account_type ON chunks (account_id, chunkable_type)")
  if (opt.index === "drop") {
    db.exec("DROP INDEX IF EXISTS chunks_by_type_position")
    db.exec("DROP INDEX IF EXISTS chunks_by_account_type")
  }
  if (opt.explain) {
    const sql = variant.startsWith("shortlist")
      ? SHORTLIST_SQL(kind === "account" ? null : kind)
      : kind === "conversation"
        ? CONVERSATION_SQL(
            `${CONVERSATION_COLUMNS}, v.vector`,
            variant === "account-direct" ? "k.account_id = ?" : undefined,
          )
        : IMAGE_SQL(`${IMAGE_COLUMNS}, v.vector`, variant === "account-direct" ? "k.account_id = ?" : undefined)
    const params = variant.startsWith("shortlist")
      ? kind === "account"
        ? [MODEL, ACCOUNT, 0]
        : [MODEL, ACCOUNT, kind, 0]
      : kind === "conversation"
        ? [MODEL, ACCOUNT, 0, -1]
        : [MODEL, ACCOUNT, 0]
    emit({
      case: kind,
      variant,
      index: opt.index ?? "none",
      plan: db.all(`EXPLAIN QUERY PLAN ${sql}`, ...params).map((r) => r.detail),
    })
    return
  }
  if (variant === "embeddings-only") {
    // The floor: every vector of the model, no join at all.
    measure(kind, variant, (query, split) => {
      const best = topK(LIMIT)
      let t = now()
      const rows = db.all("SELECT rowid AS id, vector FROM embeddings WHERE model = ?", MODEL)
      split.sql += now() - t
      t = now()
      for (const row of rows) best.push(dotView(query, row.vector), { id: row.id })
      split.score += now() - t
      split.rows = rows.length
      return best.items.map((r) => r.id)
    })
    return
  }
  if (variant.startsWith("shortlist") || (kind === "account" && variant === "exact")) {
    measure(kind, variant, (query, split) =>
      variant === "exact" ? scanShortlistExact(db, query, split) : scanShortlist(db, kind, variant, query, split),
    )
    return
  }
  measure(kind, `${variant}${opt.since ? ` since=${opt.since}` : ""}`, (query, split) =>
    scanCurrent(db, kind, variant, query, split),
  )
}

// Every chunk of the account scored, for the account-wide truth: there is no such search in Core yet.
const scanShortlistExact = (db, query, split) => {
  const scored = []
  let after = 0
  const sql = SHORTLIST_SQL(null)
  for (;;) {
    let t = now()
    const rows = db.all(sql, MODEL, ACCOUNT, after)
    split.sql += now() - t
    t = now()
    for (const row of rows) scored.push({ id: row.id, score: dotView(query, row.vector) })
    split.score += now() - t
    split.rows += rows.length
    const last = rows.at(-1)
    if (!last || rows.length < PAGE) break
    after = last.id
  }
  scored.sort((a, b) => b.score - a.score)
  return finish(db, "account", scored.slice(0, 4 * LIMIT))
}

const vecPath = () => require("sqlite-vec").getLoadablePath()

const vec0 = async () => {
  const db = await open(join(dir, "store.db"), { extensions: true })
  let t = now()
  db.load(vecPath())
  const loadMs = now() - t
  const int8 = opt.variant === "vec0-i8"
  const table = int8 ? "vec_chunks_i8" : "vec_chunks"
  if (opt.build) {
    const column = int8 ? `embedding int8[${D}]` : `embedding float[${D}] distance_metric=cosine`
    t = now()
    db.exec(`DROP TABLE IF EXISTS ${table}`)
    db.exec(
      `CREATE VIRTUAL TABLE ${table} USING vec0(chunk_id integer primary key, account_id integer partition key,
        kind text partition key, ${column})`,
    )
    db.exec("BEGIN")
    let after = 0
    for (;;) {
      const rows = db.all(
        `SELECT k.id, k.account_id AS account, k.chunkable_type AS kind, v.vector FROM chunks k
          JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash WHERE k.id > ? ORDER BY k.id LIMIT ${PAGE}`,
        MODEL,
        after,
      )
      for (const row of rows) {
        const f = new Float32Array(row.vector.buffer, row.vector.byteOffset, D)
        if (int8)
          db.run(
            `INSERT INTO ${table} (chunk_id, account_id, kind, embedding) VALUES (?, ?, ?, vec_int8(?))`,
            BigInt(row.id),
            BigInt(row.account),
            row.kind,
            bytes(quantizeFixed(f)),
          )
        else
          db.run(
            `INSERT INTO ${table} (chunk_id, account_id, kind, embedding) VALUES (?, ?, ?, ?)`,
            BigInt(row.id),
            BigInt(row.account),
            row.kind,
            row.vector,
          )
      }
      if (rows.length < PAGE) break
      after = rows.at(-1).id
    }
    db.exec("COMMIT")
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    emit({
      dir,
      variant: opt.variant,
      buildMs: Math.round(now() - t),
      fileMB: Math.round(statSync(join(dir, "store.db")).size / 2 ** 20),
    })
    return
  }
  const kind = opt.case
  const k = Number(opt.k ?? 400)
  const sql = `SELECT chunk_id AS id, distance FROM ${table}
    WHERE embedding MATCH ${int8 ? "vec_int8(?)" : "?"} AND k = ? AND account_id = ? ${kind === "account" ? "" : "AND kind = ?"}`
  measure(
    kind,
    `${opt.variant} k=${k}`,
    (query, split) => {
      let t2 = now()
      const q = int8 ? bytes(quantizeFixed(query)) : bytes(query)
      // vec0 refuses a partition key bound as a float, which is how node:sqlite binds a plain number.
      const rows = kind === "account" ? db.all(sql, q, k, BigInt(ACCOUNT)) : db.all(sql, q, k, BigInt(ACCOUNT), kind)
      split.sql += now() - t2
      split.rows = rows.length
      t2 = now()
      const out = finish(db, kind, rows)
      split.finish += now() - t2
      return out
    },
    { extensionLoadMs: round(loadMs) },
  )
}

const annFile = (lib, account, kind) => join(dir, "ann", `${lib}-${account}-${kind}.idx`)

const ann = async () => {
  const lib = opt.lib
  const kinds = ["conversation", "document", "email", "image"]
  if (opt.build) {
    mkdirSync(join(dir, "ann"), { recursive: true })
    const db = await open(join(dir, "store.db"))
    const t = now()
    let sizeMB = 0
    // One index per account and type: the account is never mixed, and a type search reads only its own file.
    for (const kind of kinds) {
      const rows = db.all(
        `SELECT k.id, v.vector FROM chunks k JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash
          WHERE k.account_id = ? AND k.chunkable_type = ?`,
        MODEL,
        ACCOUNT,
        kind,
      )
      const keys = new BigUint64Array(rows.map((r) => BigInt(r.id)))
      const matrix = new Float32Array(rows.length * D)
      rows.forEach((r, i) => {
        matrix.set(new Float32Array(r.vector.buffer, r.vector.byteOffset, D), i * D)
      })
      const file = annFile(lib, ACCOUNT, kind)
      if (lib.startsWith("usearch")) {
        const usearch = require("usearch")
        const index = new usearch.Index({
          dimensions: D,
          metric: "ip",
          quantization: lib === "usearch-i8" ? "i8" : "f32",
          connectivity: 16,
          expansion_add: 128,
          expansion_search: Number(opt.ef ?? 64),
        })
        index.add(keys, matrix)
        index.save(file)
      } else {
        const { HierarchicalNSW } = require("hnswlib-node")
        const index = new HierarchicalNSW("ip", D)
        index.initIndex(rows.length, 16, 128)
        rows.forEach((r, i) => {
          index.addPoint(Array.from(matrix.subarray(i * D, (i + 1) * D)), r.id)
        })
        index.writeIndexSync(file)
      }
      sizeMB += statSync(file).size / 2 ** 20
    }
    emit({ dir, lib, buildMs: Math.round(now() - t), indexMB: Math.round(sizeMB), rssMB: rssMB() })
    return
  }
  const kind = opt.case
  const k = Number(opt.k ?? 400)
  const ef = Number(opt.ef ?? 64)
  const mode = opt.load ?? "view"
  const db = await open(join(dir, "store.db"))
  const t = now()
  const searchKinds = kind === "account" ? kinds : [kind]
  const indexes = searchKinds.map((kd) => {
    const file = annFile(lib, ACCOUNT, kd)
    if (lib.startsWith("usearch")) {
      const usearch = require("usearch")
      const index = new usearch.Index({
        dimensions: D,
        metric: "ip",
        quantization: lib === "usearch-i8" ? "i8" : "f32",
        connectivity: 16,
        expansion_search: ef,
      })
      mode === "view" ? index.view(file) : index.load(file)
      return { search: (q, n) => index.search(q, Math.min(n, index.size())) }
    }
    const { HierarchicalNSW } = require("hnswlib-node")
    const index = new HierarchicalNSW("ip", D)
    index.readIndexSync(file)
    index.setEf(Math.max(ef, k))
    return { search: (q, n) => index.searchKnn(Array.from(q), Math.min(n, index.getCurrentCount())) }
  })
  const openMs = now() - t
  measure(
    kind,
    `${lib} k=${k} ef=${ef} ${mode}`,
    (query, split) => {
      let t2 = now()
      const hits = []
      for (const index of indexes) {
        const found = index.search(query, k)
        const ids = found.keys ? Array.from(found.keys, Number) : found.neighbors
        ids.forEach((id, i) => {
          hits.push({ id, score: -found.distances[i] })
        })
      }
      hits.sort((a, b) => b.score - a.score)
      split.sql += now() - t2
      split.rows = hits.length
      t2 = now()
      const out = finish(db, kind, hits)
      split.finish += now() - t2
      return out
    },
    { openIndexMs: round(openMs) },
  )
}

// vec0's layout without the extension: a plain table, one row per block of BLOCK vectors of one account and type,
// so JavaScript gets a few hundred rows instead of one per chunk.
const BLOCK = 1024

const packed = async () => {
  const db = await open(join(dir, "store.db"))
  applySince(db)
  if (opt.build) {
    const t = now()
    db.exec("DROP TABLE IF EXISTS packed_vectors")
    db.exec(`CREATE TABLE packed_vectors (account_id integer NOT NULL, kind text NOT NULL, block integer NOT NULL,
      ids blob NOT NULL, vectors blob NOT NULL, PRIMARY KEY (account_id, kind, block))`)
    db.exec("BEGIN")
    for (const { account, kind } of db.all(
      "SELECT DISTINCT account_id AS account, chunkable_type AS kind FROM chunks ORDER BY 1, 2",
    )) {
      let block = 0
      let after = 0
      for (;;) {
        const rows = db.all(
          `SELECT k.id, v.vector FROM chunks k JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash
            WHERE k.account_id = ? AND k.chunkable_type = ? AND k.id > ? ORDER BY k.id LIMIT ${BLOCK}`,
          MODEL,
          account,
          kind,
          after,
        )
        if (rows.length === 0) break
        const ids = new Int32Array(rows.length)
        const vectors = new Float32Array(rows.length * D)
        rows.forEach((row, i) => {
          ids[i] = row.id
          vectors.set(new Float32Array(row.vector.buffer, row.vector.byteOffset, D), i * D)
        })
        db.run(
          "INSERT INTO packed_vectors (account_id, kind, block, ids, vectors) VALUES (?, ?, ?, ?, ?)",
          account,
          kind,
          block++,
          bytes(ids),
          bytes(vectors),
        )
        after = rows.at(-1).id
      }
    }
    db.exec("COMMIT")
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    emit({ dir, variant: "packed", buildMs: Math.round(now() - t) })
    return
  }
  const kind = opt.case
  const sql =
    kind === "account"
      ? "SELECT ids, vectors FROM packed_vectors WHERE account_id = ?"
      : "SELECT ids, vectors FROM packed_vectors WHERE account_id = ? AND kind = ?"
  measure(kind, `packed shortlist=${SHORTLIST}${opt.since ? ` since=${opt.since}` : ""}`, (query, split) => {
    const best = topK(SHORTLIST)
    let t = now()
    const blocks = kind === "account" ? db.all(sql, ACCOUNT) : db.all(sql, ACCOUNT, kind)
    split.sql += now() - t
    t = now()
    for (const { ids, vectors } of blocks) {
      const id = new Int32Array(ids.buffer, ids.byteOffset, ids.byteLength / 4)
      const matrix = new Float32Array(vectors.buffer, vectors.byteOffset, vectors.byteLength / 4)
      for (let i = 0; i < id.length; i++) {
        let sum = 0
        const offset = i * D
        for (let j = 0; j < D; j++) sum += query[j] * matrix[offset + j]
        best.push(sum, { id: id[i] })
      }
      split.rows += id.length
    }
    split.score += now() - t
    t = now()
    const out = finish(db, kind, best.items)
    split.finish += now() - t
    return out
  })
}

// What keeping a derived copy current costs: 1,000 new vectors in, then out, for one account and type.
const maintain = async () => {
  const db = await open(join(dir, "store.db"), { extensions: true })
  db.load(vecPath())
  const fresh = Array.from({ length: 1000 }, () => normalize(Float32Array.from({ length: D }, gauss)))
  const base = 10_000_000
  let t = now()
  db.exec("BEGIN")
  fresh.forEach((v, i) => {
    db.run(
      "INSERT INTO vec_chunks (chunk_id, account_id, kind, embedding) VALUES (?, ?, 'conversation', ?)",
      BigInt(base + i),
      BigInt(ACCOUNT),
      bytes(v),
    )
  })
  db.exec("COMMIT")
  const vec0InsertMs = now() - t
  t = now()
  db.exec("BEGIN")
  for (let i = 0; i < fresh.length; i++) db.run("DELETE FROM vec_chunks WHERE chunk_id = ?", BigInt(base + i))
  db.exec("COMMIT")
  const vec0DeleteMs = now() - t

  t = now()
  db.exec("BEGIN")
  const last = db.get(
    "SELECT block, ids, vectors FROM packed_vectors WHERE account_id = ? AND kind = 'conversation' ORDER BY block DESC LIMIT 1",
    ACCOUNT,
  )
  const held = last.ids.byteLength / 4
  const ids = new Int32Array(held + fresh.length)
  const vectors = new Float32Array((held + fresh.length) * D)
  ids.set(new Int32Array(last.ids.buffer, last.ids.byteOffset, held))
  vectors.set(new Float32Array(last.vectors.buffer, last.vectors.byteOffset, held * D))
  fresh.forEach((v, i) => {
    ids[held + i] = base + i
    vectors.set(v, (held + i) * D)
  })
  db.run("DELETE FROM packed_vectors WHERE account_id = ? AND kind = 'conversation' AND block = ?", ACCOUNT, last.block)
  for (let start = 0, block = last.block; start < ids.length; start += BLOCK, block++)
    db.run(
      "INSERT INTO packed_vectors (account_id, kind, block, ids, vectors) VALUES (?, 'conversation', ?, ?, ?)",
      ACCOUNT,
      block,
      bytes(ids.subarray(start, start + BLOCK)),
      bytes(vectors.subarray(start * D, (start + BLOCK) * D)),
    )
  db.exec("COMMIT")
  const packedAppendMs = now() - t

  // Removing from blocks means rewriting them: here the whole account-and-type partition, read back from embeddings.
  t = now()
  db.exec("BEGIN")
  db.run("DELETE FROM packed_vectors WHERE account_id = ? AND kind = 'conversation'", ACCOUNT)
  let block = 0
  let after = 0
  for (;;) {
    const rows = db.all(
      `SELECT k.id, v.vector FROM chunks k JOIN embeddings v ON v.model = ? AND v.content_hash = k.content_hash
        WHERE k.account_id = ? AND k.chunkable_type = 'conversation' AND k.id > ? ORDER BY k.id LIMIT ${BLOCK}`,
      MODEL,
      ACCOUNT,
      after,
    )
    if (rows.length === 0) break
    const blockIds = new Int32Array(rows.length)
    const blockVectors = new Float32Array(rows.length * D)
    rows.forEach((row, i) => {
      blockIds[i] = row.id
      blockVectors.set(new Float32Array(row.vector.buffer, row.vector.byteOffset, D), i * D)
    })
    db.run(
      "INSERT INTO packed_vectors (account_id, kind, block, ids, vectors) VALUES (?, 'conversation', ?, ?, ?)",
      ACCOUNT,
      block++,
      bytes(blockIds),
      bytes(blockVectors),
    )
    after = rows.at(-1).id
  }
  db.exec("COMMIT")
  const packedRebuildMs = now() - t
  emit({
    dir,
    vec0InsertMs: round(vec0InsertMs),
    vec0DeleteMs: round(vec0DeleteMs),
    packedAppendMs: round(packedAppendMs),
    packedRebuildPartitionMs: round(packedRebuildMs),
    partitionBlocks: block,
  })
}

const commands = { build, scan, vec0, ann, packed, maintain }
await commands[command]()
