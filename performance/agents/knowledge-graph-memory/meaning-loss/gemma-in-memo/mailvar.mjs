// Mail chunks re-embedded two ways: as real mail would read (header, body without the subject and sender the fixture repeats), and without the sender line.
import { readFileSync, writeFileSync } from "node:fs"

const PKG = "/home/leemour/Projects/AI/cli-memo-wt-gemma-bench/node_modules/@wirecat/cli-core/dist"
const [STORE, OUT] = process.argv.slice(2)
const { openEmbedder } = await import(`${PKG}/embeddings/embed.js`)
const { textModel } = await import(`${PKG}/embeddings/models.js`)
const chunks = JSON.parse(readFileSync(`${OUT}/chunks.json`, "utf8"))
const model = textModel("embeddinggemma")
const embedder = await openEmbedder(model, `${STORE}/memo/wirecat-state/models/text`, { threads: 8 })
const variants = {
  reallike: (t) => {
    const [head, body] = t.split("\n\n", 2)
    const subject = head.slice(head.indexOf(": ") + 2)
    return `${head}\n\n${body.startsWith(`${subject}. `) ? body.slice(subject.length + 2).replace(/^[A-Z][a-z]+ [A-Z][a-z]+: /, "") : body}`
  },
  nosender: (t) => t.replace(/^[^:\n]+: /, ""),
}
for (const [name, f] of Object.entries(variants)) {
  const out = new Float32Array(chunks.length * model.dims)
  const idx = chunks.map((c, i) => [c, i]).filter(([c]) => c.kind === "mail")
  for (let i = 0; i < idx.length; i += 32) {
    const part = idx.slice(i, i + 32)
    const vs = await embedder.embed(
      part.map(([c]) => f(c.text)),
      "passage",
    )
    for (const [j, v] of vs.entries()) out.set(v, part[j][1] * model.dims)
  }
  writeFileSync(`${OUT}/mail-${name}.f32`, Buffer.from(out.buffer))
  process.stdout.write(`${name} ${f(idx[0][0].text).slice(0, 160).replace(/\n/g, "|")}\n`)
}
await embedder.close()
