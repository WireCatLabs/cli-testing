// One runtime in one fresh process, so loading is timed cold: Core's WebAssembly build or onnxruntime-node.
// Usage: node runtime.mjs <@wirecat/cli-core dir> <node_modules with onnxruntime-node and @huggingface/tokenizers>
//   <wasm|native> <threads> <vectors out>
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, join } from "node:path"

const [core, modules, runtime, threadArg, vectorsOut] = process.argv.slice(2)
const resolve = createRequire(join(modules, "index.js")).resolve
const threads = Number(threadArg)
const started = performance.now()
const now = () => performance.now()
const { textModelsDirectory, truncated, meanOf, unit } = await import(`${core}/dist/embeddings/embed.js`)
const models = await import(`${core}/dist/embeddings/models.js`)
const commonJs = async (name) => {
  const loaded = await import(resolve(name))
  return loaded.default ?? loaded
}
const { Tokenizer } = await commonJs("@huggingface/tokenizers")
const dir = textModelsDirectory()
const out = { runtime, threads }

let t = now()
const ort =
  runtime === "native" ? await commonJs("onnxruntime-node") : await import(join(core, "../cli-core-onnx/index.js"))
out.import_ms = now() - t
if (runtime === "wasm") ort.env.wasm.numThreads = threads

const load = async (model) => {
  const path = (name) => join(dir, model.id, name)
  const tokenizer = new Tokenizer(
    JSON.parse(readFileSync(path("tokenizer.json"), "utf8")),
    JSON.parse(readFileSync(path("tokenizer_config.json"), "utf8")),
  )
  const options = runtime === "native" ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : {}
  if (model.externalData)
    options.externalData = [{ path: basename(model.externalData), data: readFileSync(path(model.externalData)) }]
  const session = await ort.InferenceSession.create(readFileSync(path(model.onnx)), options)
  return { tokenizer, session }
}
const int64 = (rows, width, fill) => {
  const a = new BigInt64Array(rows.length * width).fill(fill)
  for (const [r, row] of rows.entries()) for (const [c, v] of row.entries()) a[r * width + c] = BigInt(v)
  return a
}

const words =
  "сайт заявка клиент цена схема блог видео звонок анализ номер одобрение пост страница реклама поиск".split(" ")
const text = (n, seed) => Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(" ")
const question = text(8, 3)

const e5 = models.TEXT_MODELS.find((m) => m.id === "e5-small")
t = now()
const embedder = await load(e5)
out.e5_load_ms = now() - t
const embed = async (s) => {
  const ids = truncated(embedder.tokenizer.encode(s).ids, e5.maxTokens)
  const shape = [1, ids.length]
  const feeds = {
    input_ids: new ort.Tensor("int64", int64([ids], ids.length, 0n), shape),
    attention_mask: new ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), shape),
  }
  if (embedder.session.inputNames.includes("token_type_ids"))
    feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(ids.length), shape)
  const hidden = (await embedder.session.run(feeds)).last_hidden_state
  return unit(meanOf(hidden.data, ids.length, hidden.dims.at(-1)))
}
t = now()
const queryVector = await embed(`${e5.prefix.query}${question}`)
out.e5_query_ms = now() - t
const passagesForVectors = Array.from({ length: 20 }, (_, i) => text(10 + ((i * 37) % 240), i))
t = now()
const vectors = [Array.from(queryVector)]
for (const p of passagesForVectors) vectors.push(Array.from(await embed(`${e5.prefix.passage}${p}`)))
out.e5_20_passages_ms = now() - t
writeFileSync(vectorsOut, JSON.stringify(vectors))

const mm = models.RERANK_MODELS.find((m) => m.id === "mmarco")
t = now()
const reranker = await load(mm)
out.mmarco_load_ms = now() - t
const score = async (pairs) => {
  const ids = pairs.map((p) => truncated(reranker.tokenizer.encode(question, { text_pair: p }).ids, mm.maxTokens))
  const width = Math.max(...ids.map((x) => x.length))
  const shape = [ids.length, width]
  const feeds = {
    input_ids: new ort.Tensor("int64", int64(ids, width, 1n), shape),
    attention_mask: new ort.Tensor(
      "int64",
      int64(
        ids.map((row) => row.map(() => 1)),
        width,
        0n,
      ),
      shape,
    ),
  }
  return Array.from((await reranker.session.run(feeds)).logits.data)
}
const oneByOne = async (passages) => {
  const scores = []
  for (const p of passages) scores.push((await score([p]))[0])
  return scores
}
for (const n of [40, 120, 300]) {
  t = now()
  await oneByOne(Array.from({ length: 50 }, (_, i) => text(n, i)))
  out[`one_by_one_50_of_${n}_words_ms`] = now() - t
}
const mixed = Array.from({ length: 50 }, (_, i) => text(10 + ((i * 37) % 240), i))
t = now()
out.mixed_scores = await oneByOne(mixed)
out.mixed_one_by_one_ms = now() - t
const order = mixed.map((_, i) => i).sort((a, b) => mixed[a].length - mixed[b].length)
t = now()
const batched = []
for (let i = 0; i < order.length; i += 10) {
  const part = order.slice(i, i + 10)
  for (const [j, s] of (await score(part.map((k) => mixed[k]))).entries()) batched[part[j]] = s
}
out.mixed_batch_10_by_length_ms = now() - t
out.batch_largest_score_change = Math.max(...batched.map((s, i) => Math.abs(s - out.mixed_scores[i])))
const a = text(40, 1)
out.same_pair = { alone: (await score([a]))[0], beside_another_pair: (await score([a, text(40, 2)]))[0] }
out.total_ms = now() - started
out.peak_rss_mb = process.resourceUsage().maxRSS / 1024
const rounded = JSON.stringify(out, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))
process.stdout.write(`${rounded}\n`)
process.exit(0)
