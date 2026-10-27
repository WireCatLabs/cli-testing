// WIRECAT_STATE_DIR=<dir> node picture.mjs <built cli-core checkout> install|native|wasm <out.json>
// "install" downloads the native library and clip-b32 into <dir>/models. Native or WebAssembly is whatever Core picks
// for <dir>: run once in the installed <dir>, once in a <dir> holding only models/image. The mode is only a label.
// 12 synthetic pictures (plain shapes) and 5 text queries; prints timings, saves the vectors.
const [core, mode, out] = process.argv.slice(2)
const { createCanvas } = await import(`${core}/node_modules/@napi-rs/canvas/index.js`)
const { downloadImageModel } = await import(`${core}/dist/services/model-downloads.js`)
const { installNativeRuntime, onnxRuntime } = await import(`${core}/dist/embeddings/onnx-runtime.js`)
const { openPictureEmbedder } = await import(`${core}/dist/images/picture/embedder.js`)
const env = process.env
if (mode === "install") {
  await installNativeRuntime({ env, progress: (line) => process.stdout.write(`${line}\n`) })
  await downloadImageModel("clip-b32", { env, progress: (line) => process.stdout.write(`${line}\n`) })
  process.exit(0)
}
const { model, directory } = await (async () => {
  const m = await import(`${core}/dist/images/picture/models.js`)
  return { model: m.imageModel("clip-b32"), directory: m.imageModelsDirectory(env) }
})()
const colors = ["red", "green", "blue", "yellow", "black", "white"]
const images = []
for (let i = 0; i < 12; i++) {
  const c = createCanvas(320, 240)
  const g = c.getContext("2d")
  g.fillStyle = colors[i % 6]
  g.fillRect(0, 0, 320, 240)
  g.fillStyle = colors[(i + 3) % 6]
  if (i % 2) g.fillRect(80, 60, 160, 120)
  else {
    g.beginPath()
    g.arc(160, 120, 70, 0, 7)
    g.fill()
  }
  images.push(c.toBuffer("image/png"))
}
const rt = await onnxRuntime(env)
const t0 = performance.now()
const e = await openPictureEmbedder(model, directory, { threads: 4 })
const vectors = []
for (const b of images) vectors.push(Array.from(await e.embedImage(b)))
const t1 = performance.now()
const queries = []
for (const q of ["a red square", "a blue circle", "a green background", "a yellow shape", "black and white"])
  queries.push(Array.from(await e.embedQuery(q)))
const t2 = performance.now()
await e.close()
const fs = await import("node:fs")
fs.writeFileSync(out, JSON.stringify({ native: rt.native, images_ms: t1 - t0, queries_ms: t2 - t1, vectors, queries }))
process.stdout.write(`${mode} native: ${rt.native} 12 images ms ${Math.round(t1 - t0)} 5 queries ms ${Math.round(t2 - t1)}
`)
process.exit(0)
