// What `*word*` in message text costs through the store's trigram index of message text (`messages_fts`), against
// reading the whole word list (`message_words_vocab`), as cli-core does today.
//   node bench.mjs <rows> <scratch dir> [chat|mail]     e.g. node bench.mjs 1000000 /var/tmp/substring-messages
// `mail` writes email-sized rows (1-6 KB) to price a trigram index that mail does not have yet.
// Prints one JSON line per step and per query.
import { mkdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { text } from "../substring-notes/gen.mjs"

const count = Number(process.argv[2] ?? 100000)
const dir = process.argv[3] ?? "/var/tmp/substring-messages"
const kind = process.argv[4] ?? "chat"
const bytes = (id) => (kind === "mail" ? 1000 + ((id * 37) % 5000) : 40 + ((id * 37) % 200))
mkdirSync(dir, { recursive: true })
const file = join(dir, `${kind}-${count}.db`)
rmSync(file, { force: true })
const db = new DatabaseSync(file)
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA page_size=4096;")
const log = (o) => process.stdout.write(`${JSON.stringify({ kind, rows: count, ...o })}\n`)
const size = () => {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  return statSync(file).size
}
const timed = (fn) => {
  const t = performance.now()
  const out = fn()
  return [performance.now() - t, out]
}
// The word index gets JS-normalized text: lower case, е for ё.
const fold = (s) => s.normalize("NFC").toLowerCase().replaceAll("ё", "е")

db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY, text TEXT);
CREATE VIRTUAL TABLE message_words USING fts5(normalized_text, content = '', contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '3');
CREATE VIRTUAL TABLE message_words_vocab USING fts5vocab(message_words, 'col');`)
const insert = db.prepare("INSERT INTO messages (id, text) VALUES (?, ?)")
const words = db.prepare("INSERT INTO message_words (rowid, normalized_text) VALUES (?, ?)")
const [built] = timed(() => {
  db.exec("BEGIN")
  for (let id = 1; id <= count; id++) {
    const body = text(id, bytes(id), 1)
    insert.run(id, body)
    words.run(id, fold(body))
    if (id % 50000 === 0) {
      db.exec("COMMIT")
      db.exec("BEGIN")
    }
  }
  db.exec("COMMIT")
})
const before = size()
const terms = db.prepare("SELECT count(*) AS n FROM message_words_vocab WHERE col = 'normalized_text'").get().n
const textBytes = db.prepare("SELECT sum(length(CAST(text AS BLOB))) AS n FROM messages").get().n
log({ step: "rows and word index", ms: Math.round(built), bytes: before, text_bytes: textBytes, distinct_words: terms })

// For chat messages the table exists in every store since 2026-09-29; this times building it over rows stored.
const [trigram] = timed(() => {
  db.exec(`CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='id', tokenize='trigram');
INSERT INTO messages_fts (messages_fts) VALUES ('rebuild');`)
})
const after = size()
log({
  step: "trigram index of message text",
  ms: Math.round(trigram),
  bytes: after,
  growth_bytes: after - before,
  growth_pct: Math.round(((after - before) / before) * 1000) / 10,
})

const quoted = (s) => `"${s.replaceAll('"', '""')}"`
const newest = db.prepare(
  "SELECT id FROM messages WHERE id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?) ORDER BY id DESC LIMIT 51",
)
const all = db.prepare("SELECT count(*) AS n FROM messages_fts WHERE messages_fts MATCH ?")
const vocab = db.prepare("SELECT term FROM message_words_vocab WHERE col = 'normalized_text'")
const byWords = (match) =>
  db
    .prepare("SELECT rowid AS id FROM message_words WHERE message_words MATCH ? ORDER BY rowid DESC LIMIT 51")
    .all(match)
const p50 = (fn) => {
  const runs = Array.from({ length: 7 }, () => timed(fn))
  runs.sort((a, b) => a[0] - b[0])
  return [Math.round(runs[3][0] * 100) / 100, runs[3][1]]
}
for (const q of ["тартус", "артусск", "ТАРТУСС", "bernet", "ёлкин", "елкин", "договор", "ени", "про", "щюфыжд"]) {
  const [trigramMs, rows] = p50(() => newest.all(quoted(q)))
  const [, total] = p50(() => all.get(quoted(q)).n)
  const [vocabMs, found] = p50(() => {
    const wanted = fold(q)
    const fits = vocab.all().flatMap(({ term }) => (String(term).includes(wanted) ? [quoted(String(term))] : []))
    if (fits.length === 0) return [0, 0]
    if (fits.length > 10000) return [fits.length, -1]
    return [fits.length, byWords(fits.join(" OR ")).length]
  })
  log({
    query: q,
    trigram_ms: trigramMs,
    trigram_rows: rows.length,
    trigram_total: total,
    vocab_ms: vocabMs,
    vocab_words: found[0],
    vocab_rows: found[1],
  })
}
db.close()
rmSync(file, { force: true })
rmSync(`${file}-wal`, { force: true })
rmSync(`${file}-shm`, { force: true })
