// Embeds every store chunk as a passage: argv model (int8|fp32), text (memo|bare); writes float32 rows in chunks.json order.
import { readFileSync, writeFileSync } from "node:fs"

const PKG = `${process.env.HOME}/.cache/wirecat-bench/memo-pkg-0.131.50/node_modules/@wirecat/cli-core/dist`
const HERE = new URL(".", import.meta.url).pathname
const [model, mode] = process.argv.slice(2)
const { openEmbedder } = await import(`${PKG}/embeddings/embed.js`)
const { textModel } = await import(`${PKG}/embeddings/models.js`)
const base = textModel("e5-small")
const embedder =
  model === "int8"
    ? await openEmbedder(base, `${HERE}/store/memo/wirecat-state/models/text`, { threads: 4 })
    : await openEmbedder({ ...base, id: "e5-fp32", onnx: "onnx/model.onnx" }, HERE, { threads: 4 })
const chunks = JSON.parse(readFileSync(`${HERE}/chunks.json`, "utf8"))
const corpus = Object.fromEntries(
  readFileSync(`${process.env.HOME}/.cache/wirecat-bench/kg-fixture-v3/corpus.jsonl`, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .map((r) => [r.id, r.text]),
)
const out = new Float32Array(chunks.length * 384)
const started = Date.now()
for (const [i, c] of chunks.entries()) {
  const [v] = await embedder.embed(
    [
      mode === "memo"
        ? c.text
        : mode === "nor"
          ? c.text.replace(/(^|: )r\d+\n\n/, "$1")
          : mode === "nosender"
            ? c.text.replace(/^Synthetic Sender: /, "")
            : mode === "neither"
              ? c.text.replace(/^Synthetic Sender: /, "").replace(/^r\d+\n\n/, "")
              : corpus[c.id],
    ],
    "passage",
  )
  out.set(v, i * 384)
  if (i % 2000 === 0)
    process.stderr.write(`${[model, mode, i, Math.round((Date.now() - started) / 1000), "s"].join(" ")}\n`)
}
await embedder.close()
writeFileSync(`${HERE}/corpus-${model}-${mode}.f32`, Buffer.from(out.buffer))
process.stderr.write(`${["done", model, mode, Math.round((Date.now() - started) / 1000), "s"].join(" ")}\n`)
