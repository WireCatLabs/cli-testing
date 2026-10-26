// Times Core's text models on synthetic Russian text: loading, one-by-one scoring, padded batches, and whether a
// pair's score depends on its batch. Usage: node bench.mjs <path to an installed @wirecat/cli-core>
const C = process.argv[2]
const { textModelsDirectory, loadModel, truncated, openEmbedder, defaultThreads } = await import(
  `${C}/dist/embeddings/embed.js`
)
const { openReranker } = await import(`${C}/dist/embeddings/rerank.js`)
const models = await import(`${C}/dist/embeddings/models.js`)
const dir = textModelsDirectory()
const now = () => performance.now()
const words =
  "сайт заявка клиент цена схема блог видео звонок анализ номер одобрение пост страница реклама поиск".split(" ")
const text = (n, seed) => Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(" ")
const question = text(8, 3)
const out = {
  core: JSON.parse((await import("node:fs")).readFileSync(`${C}/package.json`, "utf8")).version,
  threads: defaultThreads(),
}

const e5 = models.TEXT_MODELS.find((m) => m.id === "e5-small")
let t = now()
const embedder = await openEmbedder(e5, dir)
out.e5_load_ms = now() - t
t = now()
await embedder.embed([question], "query")
out.e5_query_ms = now() - t
await embedder.close()

const mm = models.RERANK_MODELS.find((m) => m.id === "mmarco")
t = now()
const reranker = await openReranker(mm, dir)
out.mmarco_load_ms = now() - t
for (const n of [40, 120, 300]) {
  t = now()
  await reranker.score(
    question,
    Array.from({ length: 50 }, (_, i) => text(n, i)),
  )
  out[`one_by_one_50_of_${n}_words_ms`] = now() - t
}

const { ort, tokenizer, session } = await loadModel(mm, dir, defaultThreads())
const batch = async (passages, width) => {
  const ids = passages.map((p) => truncated(tokenizer.encode(question, { text_pair: p }).ids, mm.maxTokens))
  const w = width ?? Math.max(...ids.map((x) => x.length))
  const n = ids.length
  const input = new BigInt64Array(n * w).fill(1n)
  const mask = new BigInt64Array(n * w)
  for (const [r, row] of ids.entries()) {
    for (const [c, id] of row.entries()) {
      input[r * w + c] = BigInt(id)
      mask[r * w + c] = 1n
    }
  }
  const feeds = {
    input_ids: new ort.Tensor("int64", input, [n, w]),
    attention_mask: new ort.Tensor("int64", mask, [n, w]),
  }
  return Array.from((await session.run(feeds)).logits.data)
}
const mixed = Array.from({ length: 50 }, (_, i) => text(10 + ((i * 37) % 240), i))
t = now()
const single = await reranker.score(question, mixed)
out.mixed_one_by_one_ms = now() - t
for (const size of [5, 10, 25, 50]) {
  for (const sorted of [false, true]) {
    const order = mixed.map((_, i) => i)
    if (sorted) order.sort((a, b) => mixed[a].length - mixed[b].length)
    const scores = []
    t = now()
    for (let i = 0; i < order.length; i += size) {
      const part = order.slice(i, i + size)
      for (const [j, s] of (await batch(part.map((k) => mixed[k]))).entries()) scores[part[j]] = s
    }
    out[`mixed_batch_${size}${sorted ? "_by_length" : ""}`] = {
      ms: now() - t,
      largest_score_change: Math.max(...scores.map((s, i) => Math.abs(s - single[i]))),
    }
  }
}
const a = text(40, 1)
out.same_pair = {
  alone: (await batch([a]))[0],
  alone_padded_to_200_tokens: (await batch([a], 200))[0],
  beside_another_pair: (await batch([a, text(40, 2)]))[0],
}
await reranker.close()
const rounded = JSON.stringify(out, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))
process.stdout.write(`${rounded}\n`)
process.exit(0)
