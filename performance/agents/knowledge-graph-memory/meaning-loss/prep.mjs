// Query texts and vectors exactly as memo 0.131.50 builds them, plus each store chunk's text and corpus id.
import { readFileSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const PKG = `${process.env.HOME}/.cache/wirecat-bench/memo-pkg-0.131.50/node_modules/@wirecat/cli-core/dist`
const BENCH = `${process.env.HOME}/.cache/wirecat-bench`
const STORE = process.argv[2] ?? `${BENCH}/memo-0.131.50-search-v3-paraphrased`
const OUT = process.argv[3]
const HERE = new URL(".", import.meta.url).pathname

const { openEmbedder } = await import(`${PKG}/embeddings/embed.js`)
const { textModel } = await import(`${PKG}/embeddings/models.js`)
const { plainQuery } = await import(`${PKG}/search/lucene/plain.js`)
const { plainWords } = await import(`${PKG}/services/pictures.js`)
const { questionText, questionLookup } = await import(`${PKG}/search/question-plan.js`)
const { meaningWords } = await import(`${PKG}/search/lucene/meaning-parts.js`)
const { parseLucene } = await import(`${PKG}/../../cli-base/dist/query/index.js`).catch(
  () => import("@wirecat/cli-base/query"),
)
const { validateFields } = await import(`${PKG}/search/lucene/registry.js`)
const { SEARCH_QUERY } = await import(`${PKG}/search/lucene/types.js`)
const { threadPieces } = await import(`${PKG}/store/sqlite/email-index.js`)
const { noteIndexText } = await import(`${PKG}/store/sqlite/note-index.js`)

const plain = JSON.parse(readFileSync(`${BENCH}/kg-fixture-v3/queries.json`, "utf8"))
const other = Object.fromEntries(
  JSON.parse(readFileSync(`${BENCH}/kg-fixture-v3-paraphrased/queries.json`, "utf8")).map((q) => [q.id, q.question]),
)
const oracle = Object.fromEntries(
  JSON.parse(readFileSync(`${BENCH}/kg-fixture-v3/oracle.json`, "utf8")).map((r) => [r.id, r.required_citations]),
)
const corpus = readFileSync(`${BENCH}/kg-fixture-v3/corpus.jsonl`, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l))
const nameToId = Object.fromEntries(corpus.map((r, i) => [`r${String(i + 1).padStart(4, "0")}`, r.id]))

const notesText = (question) => {
  const query = plainQuery(plainQuery(question))
  const lookup = questionLookup(query)
  const parsed = validateFields(
    parseLucene(lookup === undefined ? query : questionText(query), { ...SEARCH_QUERY, defaultField: "text" }),
  ).root
  return meaningWords(parsed)
}

const asked = plain
  .filter((q) => oracle[q.id].length)
  .map((q) => {
    const typed = other[q.id]
    return {
      id: q.id,
      reworded: typed !== q.question,
      question: typed,
      mail_text: plainWords(plainQuery(typed)),
      notes_text: notesText(typed),
      lookup: questionLookup(plainQuery(typed)) ?? null,
      sources: oracle[q.id],
    }
  })

const db = new DatabaseSync(`${STORE}/memo/wirecat-state/wirecat.db`, { readOnly: true })
const chunks = []
for (const row of db
  .prepare("SELECT id, chunkable_id, position, content_hash FROM chunks WHERE chunkable_type = 'document'")
  .all()) {
  const doc = db.prepare("SELECT title, body FROM documents WHERE id = ?").get(row.chunkable_id)
  chunks.push({
    chunk: Number(row.id),
    hash: row.content_hash,
    kind: "notes",
    id: nameToId[doc.title],
    text: noteIndexText(doc.title, doc.body),
  })
}
const threads = db.prepare("SELECT DISTINCT chunkable_id AS t FROM chunks WHERE chunkable_type = 'email_thread'").all()
for (const { t } of threads) {
  const pieces = threadPieces(db, Number(t))
  const rows = db
    .prepare(
      "SELECT id, position, content_hash FROM chunks WHERE chunkable_type = 'email_thread' AND chunkable_id = ? ORDER BY position",
    )
    .all(t)
  for (const row of rows) {
    const piece = pieces[Number(row.position)]
    const email = db.prepare("SELECT subject FROM emails WHERE id = ?").get(Number(piece.lastId))
    chunks.push({
      chunk: Number(row.id),
      hash: row.content_hash,
      kind: "mail",
      id: nameToId[email.subject],
      text: piece.text,
      hash_ok: piece.hash === row.content_hash,
      emails_in_piece: piece.firstId === piece.lastId ? 1 : 2,
    })
  }
}

const models = {
  int8: [textModel("e5-small"), `${STORE}/memo/wirecat-state/models/text`],
  fp32: [{ ...textModel("e5-small"), id: "e5-fp32", onnx: "onnx/model.onnx" }, HERE],
}
for (const [name, [model, dir]] of Object.entries(models)) {
  const embedder = await openEmbedder(model, dir, { threads: 4 })
  for (const q of asked) {
    const [m, n, r] = await embedder.embed([q.mail_text, q.notes_text, q.question], "query")
    q[`${name}_mail`] = Array.from(m)
    q[`${name}_notes`] = Array.from(n)
    q[`${name}_raw`] = Array.from(r)
  }
  await embedder.close()
}
writeFileSync(`${OUT}/queries.json`, JSON.stringify(asked))
writeFileSync(`${OUT}/chunks.json`, JSON.stringify(chunks))
process.stdout.write(
  `${[asked.length, "questions,", chunks.length, "chunks,", chunks.filter((c) => c.hash_ok === false).length, "bad hashes"].join(" ")}\n`,
)
