// Replaces the e5-small vectors of a store copy with vectors from a corpus-*.f32 file (chunks.json order).
import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const [dbPath, f32] = process.argv.slice(2)
const HERE = new URL(".", import.meta.url).pathname
const db = new DatabaseSync(dbPath, { allowExtension: true })
db.loadExtension(
  `${process.env.HOME}/.cache/wirecat-bench/memo-pkg-0.131.50/node_modules/@wirecat/cli-core-sqlite/lib/linux-x64-gnu/vec0`,
)
const chunks = JSON.parse(readFileSync(`${HERE}/chunks.json`, "utf8"))
const buf = readFileSync(f32)
const M = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
const up = db.prepare("UPDATE embeddings SET vector = ? WHERE model = 'local:e5-small:384' AND content_hash = ?")
db.exec("BEGIN")
for (const [i, c] of chunks.entries()) up.run(new Uint8Array(M.buffer, M.byteOffset + i * 1536, 1536), c.hash)
db.exec("COMMIT")
const row = db.prepare("SELECT embedding FROM vector_index_1 WHERE rowid = ?").get(chunks[5].chunk)
const got = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, 384)
let dot = 0
for (let d = 0; d < 384; d++) dot += got[d] * M[5 * 384 + d]
process.stdout.write(
  `${["index row matches new vector:", dot.toFixed(6), db.prepare("SELECT count(*) AS n FROM vector_index_1").get().n].join(" ")}\n`,
)
db.close()
