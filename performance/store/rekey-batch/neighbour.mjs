// Another command in another process: writes one sync cursor every 50 ms and, when told to stop, reports its waits
// and the writes that gave up on the lock.
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, path] = process.argv.slice(2)
const { openStore } = await import(pathToFileURL(join(core, "dist", "store", "index.js")).href)
const store = await openStore({ path })
const account = { provider: "whatsapp", account: "600@lid" }
const waits = []
const failures = []
let running = true
process.on("message", () => {
  running = false
})
process.send("ready")
while (running) {
  const started = performance.now()
  try {
    await store.sync.setSyncState(account, "bench:neighbour", String(started))
    waits.push(performance.now() - started)
  } catch (error) {
    failures.push(`${Math.round(performance.now() - started)} ms: ${error instanceof Error ? error.message : error}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 50))
}
await store.close()
process.send({ waits, failures })
process.disconnect()
