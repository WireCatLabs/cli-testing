// Reranks memo's and drive's top 30 and compares vector models, in one long-lived process, as an MCP server would.
// Env: CM (an installed @wirecat/cli-messaging), QMD_MODULES (qmd's node_modules, for node-llama-cpp), NOTES_ROOT, PASSAGES_OVERRIDE.
// node rerank.mjs <BENCH_DIR> <RERANK_DIR> count | embed <e5-small|embeddinggemma> | rerank [mmarco|qwen3|none]

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [B, R, step, only] = process.argv.slice(2)
const CM = process.env.CM
const QMD_MODULES = process.env.QMD_MODULES
const NOTES_ROOT = process.env.NOTES_ROOT
const CHARS = 1200
const OVERLAP = 150
const DEPTH = 30

const cmImport = (p) => import(pathToFileURL(join(CM, p)).href)
const req = createRequire(join(CM, "package.json"))

const queries = JSON.parse(readFileSync(join(B, "queries.json"), "utf8"))
const candidates = JSON.parse(readFileSync(join(R, "candidates.json"), "utf8"))
const driveDocs = JSON.parse(readFileSync(join(B, "drive-docs.json"), "utf8"))
const notesAllowed = JSON.parse(readFileSync(join(R, "notes-allowed.json"), "utf8"))

const corpora = {
  notes: notesAllowed.map((id) => ({ id, text: readFileSync(join(NOTES_ROOT, id), "utf8") })),
  drive: driveDocs.map((d) => ({ id: d.ref, text: readFileSync(join(B, "drive-md", `${d.id}.md`), "utf8") })),
}

const chunk = (text) => {
  const out = []
  for (let start = 0; start < text.length; start += CHARS - OVERLAP) {
    out.push(text.slice(start, start + CHARS))
    if (start + CHARS >= text.length) break
  }
  return out.length ? out : [""]
}
// PASSAGES_OVERRIDE="document:85=6": a document edited after its vectors were made keeps its old passage count, so
// passage i still maps to the document it was embedded from.
const override = Object.fromEntries(
  (process.env.PASSAGES_OVERRIDE ?? "")
    .split(",")
    .filter(Boolean)
    .map((p) => p.split("=")),
)
const chunks = Object.fromEntries(
  Object.entries(corpora).map(([name, docs]) => [
    name,
    docs.flatMap((doc) =>
      chunk(doc.text)
        .slice(0, override[doc.id] ? Number(override[doc.id]) : undefined)
        .map((text, index) => ({ doc: doc.id, index, text })),
    ),
  ]),
)

if (step === "count") {
  for (const [name, list] of Object.entries(chunks))
    process.stdout.write(`${[name, corpora[name].length, "documents", list.length, "passages"].join(" ")}\n`)
  process.exit(0)
}

const vectorsFile = (model, corpus) => join(R, `vectors-${model}-${corpus}.json`)

if (step === "embed") {
  const { openEmbedder, textModelsDirectory } = await cmImport("dist/embeddings/embed.js")
  const { textModel } = await cmImport("dist/embeddings/models.js")
  const model = textModel(only)
  const embedder = await openEmbedder(model, textModelsDirectory())
  for (const [name, list] of Object.entries(chunks)) {
    const file = vectorsFile(only, name)
    if (existsSync(file)) continue
    const started = performance.now()
    const vectors = []
    for (let i = 0; i < list.length; i += 32) {
      for (const v of await embedder.embed(
        list.slice(i, i + 32).map((c) => c.text),
        "passage",
      ))
        vectors.push(Array.from(v))
      if (i % 640 === 0)
        process.stderr.write(
          `${[only, name, i, "/", list.length, Math.round((performance.now() - started) / 1000), "s"].join(" ")}\n`,
        )
    }
    const seconds = (performance.now() - started) / 1000
    writeFileSync(file, JSON.stringify({ seconds, vectors }))
    process.stdout.write(
      `${[only, name, list.length, "passages in", seconds.toFixed(0), "s =", (list.length / seconds).toFixed(1), "/s"].join(" ")}\n`,
    )
  }
  await embedder.close()
  process.exit(0)
}

// step === "rerank"
const { openEmbedder, textModelsDirectory } = await cmImport("dist/embeddings/embed.js")
const { textModel } = await cmImport("dist/embeddings/models.js")
const dot = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
const rows = []
const push = (row) => rows.push(row)

for (const modelId of ["e5-small", "embeddinggemma"]) {
  const ready = ["notes", "drive"].filter((corpus) => existsSync(vectorsFile(modelId, corpus)))
  if (!ready.length) continue
  const embedder = await openEmbedder(textModel(modelId), textModelsDirectory())
  for (const corpus of ready) {
    const { vectors } = JSON.parse(readFileSync(vectorsFile(modelId, corpus), "utf8"))
    for (const q of queries[corpus]) {
      const started = performance.now()
      const [qv] = await embedder.embed([q.q], "query")
      const best = new Map()
      for (const [i, c] of chunks[corpus].entries())
        best.set(c.doc, Math.max(best.get(c.doc) ?? -1, dot(qv, vectors[i])))
      const ranked = [...best]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id)
      push({
        corpus,
        engine: `vectors ${modelId}`,
        kind: q.kind,
        q: q.q,
        rel: q.rel,
        ranked,
        ms: performance.now() - started,
      })
    }
  }
  await embedder.close()
}

const textOf = new Map(
  Object.values(corpora)
    .flat()
    .map((d) => [d.id, d.text]),
)
const stemsOf = (query) =>
  query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2)
    .map((t) => t.slice(0, 5))
const bestPassage = (query, id) => {
  const terms = stemsOf(query)
  let best = null
  let score = -1
  for (const text of chunk(textOf.get(id))) {
    const lower = text.toLowerCase()
    const s = terms.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0)
    if (s > score) {
      score = s
      best = text
    }
  }
  return best
}
const blend = (order, scores) =>
  order
    .map((id, i) => {
      const rank = i + 1
      const w = rank <= 3 ? 0.75 : rank <= 10 ? 0.6 : 0.4
      return [id, w * (1 / rank) + (1 - w) * scores.get(id)]
    })
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)

const rerankers = {
  mmarco: async () => {
    const dir = join(R, "models", "mmarco")
    const tokenizers = await import(pathToFileURL(req.resolve("@huggingface/tokenizers")).href)
    const Tokenizer = tokenizers.Tokenizer ?? tokenizers.default?.Tokenizer
    const onnx = await import(pathToFileURL(req.resolve("@wirecat/cli-messaging-onnx")).href)
    const ort = onnx.InferenceSession ? onnx : onnx.default
    const tokenizer = new Tokenizer(
      JSON.parse(readFileSync(join(dir, "tokenizer.json"), "utf8")),
      JSON.parse(readFileSync(join(dir, "tokenizer_config.json"), "utf8")),
    )
    ort.env.wasm.numThreads = 8
    const session = await ort.InferenceSession.create(readFileSync(join(dir, "onnx/model_quint8_avx2.onnx")))
    return {
      score: async (query, passages) => {
        const out = []
        for (const passage of passages) {
          let ids = tokenizer.encode(query, { text_pair: passage }).ids
          if (ids.length > 512) ids = [...ids.slice(0, 511), ids.at(-1)]
          const shape = [1, ids.length]
          const result = await session.run({
            input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), shape),
            attention_mask: new ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), shape),
          })
          out.push(1 / (1 + Math.exp(-Number(result.logits.data[0]))))
        }
        return out
      },
      close: () => session.release(),
    }
  },
  qwen3: async () => {
    const { getLlama } = await import(pathToFileURL(join(QMD_MODULES, "node-llama-cpp/dist/index.js")).href)
    const llama = await getLlama()
    const model = await llama.loadModel({
      modelPath: join(process.env.HOME, ".cache/qmd/models/hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf"),
    })
    const context = await model.createRankingContext({ contextSize: 4096 })
    return { score: (query, passages) => context.rankAll(query, passages), close: () => model.dispose() }
  },
}

for (const name of only === "none" ? [] : only ? [only] : Object.keys(rerankers)) {
  const loadStarted = performance.now()
  const reranker = await rerankers[name]()
  const loadMs = performance.now() - loadStarted
  for (const c of candidates) {
    const top = c.ranked.slice(0, DEPTH)
    const started = performance.now()
    const scores = await reranker.score(
      c.q,
      top.map((id) => bestPassage(c.q, id)),
    )
    const ms = performance.now() - started
    const map = new Map(top.map((id, i) => [id, scores[i]]))
    const pure = [...top].sort((a, b) => map.get(b) - map.get(a))
    const base = { corpus: c.corpus, kind: c.kind, q: c.q, rel: c.rel, ms, loadMs }
    push({ ...base, engine: `${c.engine} + ${name}`, ranked: pure.slice(0, 10) })
    push({ ...base, engine: `${c.engine} + ${name} blend`, ranked: blend(top, map).slice(0, 10) })
  }
  await reranker.close()
}
for (const c of candidates)
  rows.push({
    corpus: c.corpus,
    engine: `${c.engine} (top 40 run)`,
    kind: c.kind,
    q: c.q,
    rel: c.rel,
    ranked: c.ranked.slice(0, 10),
    ms: c.ms,
  })
writeFileSync(join(R, `runs-rerank${only ? `-${only}` : ""}.json`), JSON.stringify(rows))
process.stdout.write(`${[rows.length, "rows"].join(" ")}\n`)
