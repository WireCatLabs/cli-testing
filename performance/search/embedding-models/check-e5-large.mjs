// node check-e5-large.mjs <built cli-core checkout> <empty folder for the model>
const [core, folder] = process.argv.slice(2)
const { downloadTextModel } = await import(`${core}/dist/services/model-downloads.js`)
const { openEmbedder } = await import(`${core}/dist/embeddings/embed.js`)
const env = { ...process.env, WIRECAT_STATE_DIR: folder, MESSAGING_STORE: `${folder}/store.db` }
const { model, directory } = await downloadTextModel("e5-large", {
  env,
  progress: (line) => process.stderr.write(`${line}\n`),
})
const embedder = await openEmbedder(model, directory)
const text = "Встреча с поставщиком перенесена на четверг, нужно подтвердить объём заказа и сроки доставки. ".repeat(12)
const started = performance.now()
const vectors = await embedder.embed(
  Array.from({ length: 20 }, (_, i) => `${i} ${text}`),
  "passage",
)
const seconds = (performance.now() - started) / 1000
const [q] = await embedder.embed(["когда встреча с поставщиком"], "query")
const [p] = await embedder.embed(["Встреча с поставщиком перенесена на четверг"], "passage")
const [o] = await embedder.embed(["Рецепт борща со сметаной"], "passage")
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
const result = {
  dims: vectors[0].length,
  chunksPerSecond: +(20 / seconds).toFixed(2),
  near: dot(q, p).toFixed(3),
  far: dot(q, o).toFixed(3),
}
process.stdout.write(`${JSON.stringify(result)}\n`)
await embedder.close()
