// One Gemma weight file (q4 | int8 | fp32) or e5-small: load RSS, peak RSS, chunks/s on short and long texts, and the
// vectors of every record's own text and of memo's chunk text with the sender line gone (cli-core a2a4cd615).
import { readFileSync, writeFileSync } from "node:fs"

const PKG = "/home/leemour/Projects/AI/cli-memo-wt-gemma-bench/node_modules/@wirecat/cli-core/dist"
const V = "/home/leemour/.cache/wirecat-bench/memo-src-vecstudy"
const STORE = "/home/leemour/.cache/wirecat-bench/memo-src-embeddinggemma-v3-paraphrased/memo/wirecat-state/models/text"
const E5 = "/home/leemour/.cache/wirecat-bench/memo-src-e5-small-v3-paraphrased/memo/wirecat-state/models/text"
const which = process.argv[2]
const { openEmbedder } = await import(`${PKG}/embeddings/embed.js`)
const { textModel } = await import(`${PKG}/embeddings/models.js`)
const files = {
  q4: [textModel("embeddinggemma"), STORE],
  int8: [
    {
      ...textModel("embeddinggemma"),
      id: "embeddinggemma-variants",
      onnx: "onnx/model_quantized.onnx",
      externalData: "onnx/model_quantized.onnx_data",
    },
    `${V}/models`,
  ],
  fp32: [
    {
      ...textModel("embeddinggemma"),
      id: "embeddinggemma-variants",
      onnx: "onnx/model.onnx",
      externalData: "onnx/model.onnx_data",
    },
    `${V}/models`,
  ],
  e5: [textModel("e5-small"), E5],
}
const hwm = () => Number(/VmHWM:\s+(\d+)/.exec(readFileSync("/proc/self/status", "utf8"))[1]) / 1024
const corpus = readFileSync("/home/leemour/.cache/wirecat-bench/kg-fixture-v3/corpus.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l))
const chunks = JSON.parse(readFileSync(`${V}/chunks.json`, "utf8"))
const textA = (c) => (c.kind === "mail" ? c.text.replace(/^[^:\n]+: /, "") : c.text)
const long = Array.from({ length: 200 }, (_, i) =>
  corpus
    .slice(i * 12, i * 12 + 12)
    .map((r) => r.text)
    .join(" ")
    .slice(0, 1200),
)
const [model, dir] = files[which]
const rss0 = process.memoryUsage().rss / 2 ** 20
const t = Date.now()
const embedder = await openEmbedder(model, dir, { threads: 8 })
await embedder.embed(["warm up"], "query")
const load = { seconds: (Date.now() - t) / 1000, rss_mb: Math.round(process.memoryUsage().rss / 2 ** 20 - rss0) }
const run = async (texts, kind) => {
  const out = new Float32Array(texts.length * model.dims)
  const started = Date.now()
  for (let i = 0; i < texts.length; i += 32) {
    const vs = await embedder.embed(texts.slice(i, i + 32), kind)
    for (const [j, v] of vs.entries()) out.set(v, (i + j) * model.dims)
  }
  return { out, perSecond: Math.round((texts.length / ((Date.now() - started) / 1000)) * 10) / 10 }
}
const longRun = await run(long, "passage")
const result = { which, load, long_1200_chars_per_s: longRun.perSecond }
if (which !== "e5") {
  const bare = await run(
    corpus.map((r) => r.text),
    "passage",
  )
  writeFileSync(`${V}/prec-${which}-bare.f32`, Buffer.from(bare.out.buffer))
  const a = await run(chunks.map(textA), "passage")
  writeFileSync(`${V}/prec-${which}-chunksA.f32`, Buffer.from(a.out.buffer))
  const qs = JSON.parse(readFileSync(`${V}/queries.json`, "utf8"))
  const qv = []
  for (const q of qs) qv.push(Array.from((await embedder.embed([q.question], "query"))[0]))
  writeFileSync(`${V}/prec-${which}-queries.json`, JSON.stringify(qv))
  Object.assign(result, { short_records_per_s: bare.perSecond, chunks_per_s: a.perSecond })
}
await embedder.close()
result.peak_rss_mb = Math.round(hwm())
process.stdout.write(`${JSON.stringify(result)}\n`)
