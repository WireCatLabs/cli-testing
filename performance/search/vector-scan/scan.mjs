// How long a brute-force vector search takes when vectors are read from SQLite in pages, as vectors.ts does.

import { rmSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const [file, nArg] = process.argv.slice(2)
const N = Number(nArg),
  D = 384
rmSync(file, { force: true })
const db = new DatabaseSync(file)
db.exec("PRAGMA journal_mode=WAL; CREATE TABLE e (id INTEGER PRIMARY KEY, v BLOB NOT NULL)")
const ins = db.prepare("INSERT INTO e (v) VALUES (?)")
db.exec("BEGIN")
for (let i = 0; i < N; i++) {
  const f = new Float32Array(D)
  for (let j = 0; j < D; j++) f[j] = Math.random() - 0.5
  ins.run(new Uint8Array(f.buffer))
}
db.exec("COMMIT")
const q = new Float32Array(D).map(() => Math.random() - 0.5)
const page = db.prepare("SELECT id, v FROM e WHERE id > ? ORDER BY id LIMIT 5000")
const search = () => {
  const t = performance.now()
  let after = 0,
    best = -1e9
  for (;;) {
    const rows = page.all(after)
    if (!rows.length) break
    for (const r of rows) {
      const f = new Float32Array(r.v.buffer, r.v.byteOffset, D)
      let s = 0
      for (let j = 0; j < D; j++) s += q[j] * f[j]
      if (s > best) best = s
    }
    after = rows.at(-1).id
  }
  return performance.now() - t
}
search()
const times = [search(), search(), search()].sort((a, b) => a - b)
process.stdout.write(`${N} vectors: ${times[1].toFixed(0)} ms a search (warm, median of 3)` + "\n")
