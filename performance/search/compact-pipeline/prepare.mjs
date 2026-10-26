import { createHash } from "node:crypto"
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const [id, destination, permission] = process.argv.slice(2)
if (!id || !destination || permission !== "--download" || process.argv.length !== 5)
  throw new Error("usage: node prepare.mjs MODEL CACHE_ROOT --download")
const catalog = JSON.parse(readFileSync(new URL("models.json", import.meta.url), "utf8"))
const model = catalog.models.find((item) => item.id === id)
if (!model || model.asset_bytes > 2_000_000_000) throw new Error("unknown model or asset budget exceeded")
const root = resolve(destination, id)
const started = performance.now()
let downloaded = 0
for (const file of model.files) {
  const target = join(root, file.name)
  if (!target.startsWith(`${root}/`)) throw new Error("invalid asset path")
  if (!file.url.startsWith(`https://huggingface.co/${model.repository}/resolve/${model.revision}/`))
    throw new Error("asset URL is not revision-pinned")
  mkdirSync(dirname(target), { recursive: true })
  const hash = createHash("sha256")
  let bytes = 0
  if (existsSync(target)) {
    for await (const block of createReadStream(target)) {
      hash.update(block)
      bytes += block.length
    }
  } else {
    const partial = `${target}.partial`
    const output = createWriteStream(partial, { flags: "wx" })
    const response = await fetch(file.url, { signal: AbortSignal.timeout(300_000) })
    if (!response.ok || !response.body) throw new Error(`download refused: ${response.status}`)
    const { Readable, Transform } = await import("node:stream")
    const { pipeline } = await import("node:stream/promises")
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(block, _encoding, callback) {
          bytes += block.length
          if (bytes > file.bytes) return callback(new Error("asset exceeds pinned byte count"))
          hash.update(block)
          callback(null, block)
        },
      }),
      output,
    )
    const digest = hash.digest("hex")
    if (bytes !== file.bytes || digest !== file.sha256) throw new Error(`asset mismatch: ${file.name}`)
    renameSync(partial, target)
    downloaded += bytes
    continue
  }
  if (bytes !== file.bytes || hash.digest("hex") !== file.sha256) throw new Error(`cache mismatch: ${file.name}`)
}
process.stdout.write(
  `${JSON.stringify({
    model: id,
    revision: model.revision,
    asset_bytes: model.asset_bytes,
    downloaded_bytes: downloaded,
    elapsed_ms: performance.now() - started,
    preparer: fileURLToPath(import.meta.url),
  })}\n`,
)
