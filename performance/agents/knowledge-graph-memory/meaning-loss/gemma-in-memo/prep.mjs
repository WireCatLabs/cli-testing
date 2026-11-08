// Store chunks (text, record id) and query vectors as memo builds them; with "bare", also each record's own text embedded.
import { readFileSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const PKG = "/home/leemour/Projects/AI/cli-memo-wt-gemma-bench/node_modules/@wirecat/cli-core/dist"
const BENCH = `/home/leemour/.cache/wirecat-bench`
const [STORE, OUT, mode] = process.argv.slice(2)
const { openEmbedder } = await import(`${PKG}/embeddings/embed.js`)
const { textModel } = await import(`${PKG}/embeddings/models.js`)
const { plainWords } = await import(`${PKG}/services/pictures.js`)
const { questionText, questionLookup } = await import(`${PKG}/search/question-plan.js`)
const { meaningWords } = await import(`${PKG}/search/lucene/meaning-parts.js`)
const { parseLucene } = await import(
  "/home/leemour/Projects/AI/cli-memo-wt-gemma-bench/node_modules/@wirecat/cli-base/dist/query/index.js"
)
const { validateFields } = await import(`${PKG}/search/lucene/registry.js`)
const { SEARCH_QUERY } = await import(`${PKG}/search/lucene/types.js`)
const { threadPieces } = await import(`${PKG}/store/sqlite/email-index.js`)
const { noteIndexText } = await import(`${PKG}/store/sqlite/note-index.js`)

const meaningText = (question) => {
  try {
    const text = questionLookup(question) === undefined ? question : questionText(question)
    return (
      meaningWords(validateFields(parseLucene(text, { ...SEARCH_QUERY, defaultField: "text" })).root) ||
      plainWords(question)
    )
  } catch {
    return plainWords(question)
  }
}
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
const asked = plain
  .filter((q) => oracle[q.id].length)
  .map((q) => ({
    id: q.id,
    reworded: other[q.id] !== q.question,
    question: other[q.id],
    meaning_text: meaningText(other[q.id]),
    sources: oracle[q.id],
  }))

const db = new DatabaseSync(`${STORE}/memo/wirecat-state/wirecat.db`, { readOnly: true })
const chunks = []
for (const row of db.prepare("SELECT chunkable_id, content_hash FROM chunks WHERE chunkable_type = 'document'").all()) {
  const doc = db.prepare("SELECT title, body FROM documents WHERE id = ?").get(row.chunkable_id)
  chunks.push({
    hash: row.content_hash,
    kind: "notes",
    ids: [nameToId[doc.title]],
    text: noteIndexText(doc.title, doc.body),
  })
}
const ext = db.prepare("SELECT external_id FROM emails WHERE id = ?")
const name = (id) => nameToId[`r${String(Number(ext.get(Number(id)).external_id) - 1e15 + 1).padStart(4, "0")}`]
for (const { t } of db
  .prepare("SELECT DISTINCT chunkable_id AS t FROM chunks WHERE chunkable_type = 'email_thread'")
  .all()) {
  const pieces = threadPieces(db, Number(t))
  for (const row of db
    .prepare(
      "SELECT position, content_hash FROM chunks WHERE chunkable_type = 'email_thread' AND chunkable_id = ? ORDER BY position",
    )
    .all(t)) {
    const piece = pieces[Number(row.position)]
    const ids = [...new Set([name(piece.firstId), name(piece.lastId)])]
    chunks.push({
      hash: row.content_hash,
      kind: "mail",
      ids,
      text: piece.text,
      hash_ok: piece.hash === row.content_hash,
    })
  }
}
writeFileSync(`${OUT}/chunks.json`, JSON.stringify(chunks))
const model = textModel("embeddinggemma")
const embedder = await openEmbedder(model, `${STORE}/memo/wirecat-state/models/text`, { threads: 8 })
for (const q of asked) {
  const [r, m] = await embedder.embed([q.question, q.meaning_text], "query")
  q.raw = Array.from(r)
  q.meaning = Array.from(m)
}
writeFileSync(`${OUT}/queries.json`, JSON.stringify(asked))
if (mode === "bare") {
  const out = new Float32Array(corpus.length * model.dims)
  for (let i = 0; i < corpus.length; i += 32) {
    const vs = await embedder.embed(
      corpus.slice(i, i + 32).map((r) => r.text),
      "passage",
    )
    for (const [j, v] of vs.entries()) out.set(v, (i + j) * model.dims)
  }
  writeFileSync(`${OUT}/bare-q4.f32`, Buffer.from(out.buffer))
  const nor = new Float32Array(chunks.length * model.dims)
  const texts = chunks.map((c) => c.text.replace(/^r\d{4}\n\n/, ""))
  for (let i = 0; i < texts.length; i += 32) {
    const vs = await embedder.embed(texts.slice(i, i + 32), "passage")
    for (const [j, v] of vs.entries()) nor.set(v, (i + j) * model.dims)
  }
  writeFileSync(`${OUT}/nor-q4.f32`, Buffer.from(nor.buffer))
}
await embedder.close()
process.stdout.write(
  `${asked.length} questions, ${chunks.length} chunks, ${chunks.filter((c) => c.hash_ok === false).length} bad hashes\n`,
)
