// The holdout pairs from python_native.py through one Node runtime, scored one pair per run, timed per question.
// Usage: node pairs.mjs <@wirecat/cli-core dir> <node_modules with onnxruntime-node> <wasm|native> <threads>
//   <pairs.json | -> <out.json | ->; with `-` the pairs come on stdin and only scores and times go to stdout,
//   so private text never reaches a file
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const [core, modules, runtime, threadArg, pairsFile, out] = process.argv.slice(2)
const threads = Number(threadArg)
const resolve = createRequire(join(modules, "index.js")).resolve
const commonJs = async (name) => {
  const loaded = await import(resolve(name))
  return loaded.default ?? loaded
}
const { textModelsDirectory } = await import(`${core}/dist/embeddings/embed.js`)
const { Tokenizer } = await commonJs("@huggingface/tokenizers")
const dir = join(textModelsDirectory(), "mmarco")
const ort =
  runtime === "native" ? await commonJs("onnxruntime-node") : await import(join(core, "../cli-core-onnx/index.js"))
if (runtime === "wasm") ort.env.wasm.numThreads = threads
const tokenizer = new Tokenizer(
  JSON.parse(readFileSync(join(dir, "tokenizer.json"), "utf8")),
  JSON.parse(readFileSync(join(dir, "tokenizer_config.json"), "utf8")),
)
let started = performance.now()
const options = runtime === "native" ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : {}
const session = await ort.InferenceSession.create(readFileSync(join(dir, "onnx/model_quint8_avx2.onnx")), options)
const loadMs = performance.now() - started
const { pairs } = JSON.parse(readFileSync(pairsFile === "-" ? 0 : pairsFile, "utf8"))
const perQuestion = {}
for (const p of pairs) {
  started = performance.now()
  let ids = tokenizer.encode(p.query, { text_pair: p.passage }).ids
  if (ids.length > 512) ids = [...ids.slice(0, 511), ids.at(-1)]
  const shape = [1, ids.length]
  const result = await session.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), shape),
    attention_mask: new ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), shape),
  })
  p[runtime] = result.logits.data[0]
  perQuestion[p.q] = (perQuestion[p.q] ?? 0) + performance.now() - started
}
if (out === "-") {
  const scores = pairs.map((p) => p[runtime])
  process.stdout.write(
    `${JSON.stringify({ runtime, threads, load_ms: loadMs, per_question_ms: perQuestion, scores })}\n`,
  )
  process.exit(0)
}
writeFileSync(out, JSON.stringify({ runtime, threads, load_ms: loadMs, per_question_ms: perQuestion, pairs }))
const sorted = Object.values(perQuestion).sort((a, b) => a - b)
process.stdout.write(
  `${JSON.stringify({ runtime, threads, load_ms: Math.round(loadMs), per_question_ms: sorted.map(Math.round) })}\n`,
)
process.exit(0)
