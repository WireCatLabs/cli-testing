// Run with Bun from anywhere:
//   bun bench.ts --cli-core <cli-core checkout> --model embeddinggemma --batch 0|16|32 --texts 3000 --out <file.f32>
//   bun bench.ts --compare <a.f32> <b.f32> --dims 768
// --batch 0 is one text per session.run, as memo did before batching. Otherwise each window of --window texts (as a
// caller fetches them; 0 = all at once) is sorted by token count and run --batch at a time, right-padded and masked.
// Prints one JSON line: seconds, texts, tokens.
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "cli-core": { type: "string" },
    model: { type: "string", default: "embeddinggemma" },
    batch: { type: "string", default: "0" },
    window: { type: "string", default: "0" },
    texts: { type: "string", default: "3000" },
    threads: { type: "string", default: "8" },
    out: { type: "string" },
    compare: { type: "boolean", default: false },
    dims: { type: "string" },
  },
})

if (values.compare) {
  const dims = Number(values.dims)
  const [a, b] = positionals.map((file) => new Float32Array(readFileSync(file as string).buffer.slice(0)))
  if (!a || !b || a.length !== b.length) throw new Error("vector files differ in size")
  let min = 1
  let below = 0
  for (let at = 0; at < a.length; at += dims) {
    let dot = 0
    for (let dim = 0; dim < dims; dim++) dot += (a[at + dim] as number) * (b[at + dim] as number)
    min = Math.min(min, dot)
    if (dot < 0.9999) below++
  }
  process.stdout.write(`${JSON.stringify({ vectors: a.length / dims, minCosine: min, below09999: below })}\n`)
  process.exit(0)
}

// Seeded, so every run embeds the same texts: short chat lines, mid-size notes and long emails, English and Russian.
const random = (() => {
  let seed = 20261109
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
})()
const words = [
  ..."the deadline moves to friday because the supplier sent the invoice late and the budget review is still open".split(
    " ",
  ),
  ..."please confirm the meeting with the client tomorrow at ten we need the contract draft and the price list".split(
    " ",
  ),
  ..."срок переносится на пятницу потому что поставщик прислал счёт поздно а проверка бюджета ещё не закрыта".split(
    " ",
  ),
  ..."подтвердите пожалуйста встречу с клиентом завтра в десять нужен черновик договора и прайс".split(" "),
]
const sentence = (chars: number) => {
  let text = ""
  while (text.length < chars) text += `${words[Math.floor(random() * words.length)]} `
  return text.trim()
}
const synthetic = (count: number) =>
  Array.from({ length: count }, () => {
    const kind = random()
    if (kind < 0.5) return sentence(20 + random() * 180)
    if (kind < 0.8) return sentence(200 + random() * 800)
    return sentence(1_000 + random() * 5_000)
  })

const cliCore = values["cli-core"] ?? "."
const { textModel } = await import(join(cliCore, "src/embeddings/models.ts"))
const { loadModel, truncated, unit, meanOf } = await import(join(cliCore, "src/embeddings/embed.ts"))
const model = textModel(values.model)
const directory = join(homedir(), ".local/share/WireCat/models/text")
const { ort, tokenizer, session } = await loadModel(model, directory, Number(values.threads))
const config = JSON.parse(readFileSync(join(directory, model.id, "tokenizer_config.json"), "utf8"))
const pad = tokenizer.token_to_id(config.pad_token) ?? 0
const typeIds = session.inputNames.includes("token_type_ids")

const run = async (rows: number[][]): Promise<Float32Array[]> => {
  const width = Math.max(...rows.map((ids) => ids.length))
  const shape = [rows.length, width]
  const ids = new BigInt64Array(rows.length * width).fill(BigInt(pad))
  const mask = new BigInt64Array(rows.length * width)
  rows.forEach((row, at) => {
    row.forEach((id, column) => {
      ids[at * width + column] = BigInt(id)
      mask[at * width + column] = 1n
    })
  })
  const feeds: Record<string, unknown> = {
    input_ids: new ort.Tensor("int64", ids, shape),
    attention_mask: new ort.Tensor("int64", mask, shape),
  }
  if (typeIds) feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(rows.length * width), shape)
  const output = await session.run(feeds)
  if (model.pooling === "sentence_embedding") {
    const data = output.sentence_embedding.data as Float32Array
    return rows.map((_, at) => unit(data.slice(at * model.dims, (at + 1) * model.dims)))
  }
  const hidden = output.last_hidden_state
  const dims = hidden.dims.at(-1) as number
  const data = hidden.data as Float32Array
  return rows.map((row, at) => unit(meanOf(data.subarray(at * width * dims), row.length, dims)))
}

const texts = synthetic(Number(values.texts)).map((text) => `${model.prefix.passage}${text}`)
const batch = Number(values.batch)
const started = performance.now()
const encoded = texts.map((text) => truncated(tokenizer.encode(text).ids, model.maxTokens))
const vectors: Float32Array[] = new Array(texts.length)
if (batch === 0) {
  for (const [at, row] of encoded.entries()) vectors[at] = (await run([row]))[0] as Float32Array
} else {
  const window = Number(values.window) || encoded.length
  for (let start = 0; start < encoded.length; start += window) {
    const order = encoded
      .map((_, at) => at)
      .slice(start, start + window)
      .sort((a, b) => (encoded[a]?.length ?? 0) - (encoded[b]?.length ?? 0))
    for (let from = 0; from < order.length; from += batch) {
      const slice = order.slice(from, from + batch)
      const out = await run(slice.map((at) => encoded[at] as number[]))
      slice.forEach((at, index) => {
        vectors[at] = out[index] as Float32Array
      })
    }
  }
}
const seconds = (performance.now() - started) / 1000
await session.release()

if (values.out) {
  const all = new Float32Array(vectors.length * model.dims)
  for (const [at, vector] of vectors.entries()) all.set(vector, at * model.dims)
  writeFileSync(values.out, all)
}
process.stdout.write(
  `${JSON.stringify({
    model: model.id,
    batch,
    window: Number(values.window),
    texts: texts.length,
    tokens: encoded.reduce((sum, row) => sum + row.length, 0),
    seconds: Math.round(seconds * 10) / 10,
  })}\n`,
)
