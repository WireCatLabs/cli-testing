// The same pairs through Core's WebAssembly runtime: rank agreement with native and time per pair.
// Usage (from a cli-core checkout): node rerank-agreement.mjs <model dir> <onnx file> <pairs.json> <threads>
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const say = (...parts) =>
  process.stdout.write(`${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`)

const require = createRequire(`${process.cwd()}/package.json`)
const { Tokenizer } = require("@huggingface/tokenizers")
const ort = await import(`${process.cwd()}/node_modules/@wirecat/cli-core-onnx/index.js`)
const [dir, onnx, pairsFile, threads] = process.argv.slice(2)
const tok = new Tokenizer(
  JSON.parse(readFileSync(`${dir}/tokenizer.json`, "utf8")),
  JSON.parse(readFileSync(`${dir}/tokenizer_config.json`, "utf8")),
)
ort.env.wasm.numThreads = Number(threads)
const session = await ort.InferenceSession.create(readFileSync(`${dir}/${onnx}`))
const pairs = JSON.parse(readFileSync(pairsFile, "utf8"))
const times = []
const byQ = new Map()
for (const p of pairs) {
  const t = performance.now()
  let ids = tok.encode(p.query, { text_pair: p.passage }).ids
  if (ids.length > 512) ids = [...ids.slice(0, 511), ids.at(-1)]
  const shape = [1, ids.length]
  const out = await session.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), shape),
    attention_mask: new ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), shape),
  })
  p.wasm = out.logits.data[0]
  times.push(performance.now() - t)
  byQ.set(p.q, [...(byQ.get(p.q) ?? []), p])
}
const rank = (xs) => {
  const o = xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0])
  const r = []
  for (const [k, [, i]] of o.entries()) r[i] = k
  return r
}
for (const [q, ps] of byQ) {
  const a = rank(ps.map((p) => p.native)),
    b = rank(ps.map((p) => p.wasm)),
    n = ps.length
  const rho = 1 - (6 * a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0)) / (n * (n * n - 1))
  const top = (r) =>
    new Set(
      r
        .map((x, i) => [x, i])
        .filter(([x]) => x < 3)
        .map(([, i]) => i),
    )
  const ta = top(a),
    tb = top(b)
  const maxdiff = Math.max(...ps.map((p) => Math.abs(p.native - p.wasm)))
  say(
    q,
    "spearman",
    rho.toFixed(3),
    "top3 same",
    `${[...ta].filter((i) => tb.has(i)).length}/3`,
    "max |diff|",
    maxdiff.toFixed(2),
  )
}
times.sort((x, y) => x - y)
say(
  "ms per pair median",
  times[times.length >> 1].toFixed(1),
  "=> 50 pairs ~",
  (times[times.length >> 1] * 50).toFixed(0),
  "ms",
)
