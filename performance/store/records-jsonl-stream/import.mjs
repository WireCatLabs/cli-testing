// One streaming import in a fresh process: node import.mjs <cli-core package dir> <file.jsonl> <store.db>
// Prints one JSON line: the receipt's counts, the wall time and the peak memory of this process.
import { createReadStream, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [core, file, storePath] = process.argv.slice(2).map((one) => resolve(one))
if (!core || !file || !storePath) {
  process.stderr.write("usage: node import.mjs <cli-core package dir> <file.jsonl> <store.db>\n")
  process.exit(2)
}
if (storePath.startsWith(join(homedir(), ".local/share/WireCat")) || process.env.MESSAGING_STORE !== storePath) {
  process.stderr.write("refusing: the store must be a throwaway file named by MESSAGING_STORE\n")
  process.exit(2)
}

const { openStore } = await import(pathToFileURL(join(core, "dist/store/index.js")).href)
const { ingestLines, jsonlLines } = await import(pathToFileURL(join(core, "dist/services/index.js")).href)

// Sampled so the README can say whether the peak is the JS heap or SQLite's native memory.
let heapPeak = 0
const sampler = setInterval(() => {
  heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed)
}, 20)

const store = await openStore({ path: storePath })
const baseline = process.memoryUsage().rss
const started = performance.now()
const receipt = await ingestLines(store, jsonlLines(createReadStream(file)), { account: "bench" })
const ms = performance.now() - started
await store.close()
clearInterval(sampler)

const mb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10
process.stdout.write(
  `${JSON.stringify({
    core_version: JSON.parse(readFileSync(join(core, "package.json"), "utf8")).version,
    node: process.version,
    file_mb: mb(statSync(file).size),
    ms: Math.round(ms),
    rss_after_open_mb: mb(baseline),
    max_rss_mb: mb(process.resourceUsage().maxRSS * 1024),
    heap_peak_mb: mb(heapPeak),
    store_mb: mb(statSync(storePath).size),
    created: receipt.created,
    updated: receipt.updated,
    unchanged: receipt.unchanged,
    refused: receipt.refused,
    waiting: receipt.waiting.length,
    unmatched: receipt.unmatched.length,
    proposed: receipt.proposed.length,
    truncated: receipt.truncated,
    first_error: receipt.errors[0] ?? null,
  })}\n`,
)
