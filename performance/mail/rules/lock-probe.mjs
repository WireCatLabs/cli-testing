// A second writer beside bench.mjs: it writes through cli-core's own `write` again and again, as another WireCat
// command would (it retries the lock every millisecond, not on SQLite's 100 ms busy handler), and reports the longest
// it waited and how many times it gave up after the store's 5 s busy timeout.
import { join } from "node:path"
import { parentPort, workerData } from "node:worker_threads"

const { repo, path, stop } = workerData
const { openCache } = await import(join(repo, "dist/store/open.js"))
const { write } = await import(join(repo, "dist/store/sqlite/transaction.js"))
const db = await openCache(path)
const flag = new Int32Array(stop)
let longest = 0
let tries = 0
let gaveUp = 0
while (Atomics.load(flag, 0) === 0) {
  const start = performance.now()
  try {
    write(db, () => db.prepare("SELECT 1").get())
  } catch {
    gaveUp += 1
  }
  longest = Math.max(longest, performance.now() - start)
  tries += 1
  Atomics.wait(flag, 0, 0, 5)
}
db.close()
parentPort.postMessage({ longest, tries, gaveUp })
