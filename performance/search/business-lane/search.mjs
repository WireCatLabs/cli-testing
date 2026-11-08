// The business lane of `search all` on a seeded store: node search.mjs <cli-core package dir> <store.db> <records>
// Prints one JSON line per query: the first call, the median of the warm calls, the hits and whether more were left.
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [core, storePath] = process.argv.slice(2, 4).map((one) => resolve(one))
const records = Number(process.argv[4])
if (!core || !storePath || !Number.isInteger(records)) {
  process.stderr.write("usage: node search.mjs <cli-core package dir> <store.db> <records>\n")
  process.exit(2)
}
if (storePath.startsWith(join(homedir(), ".local/share/WireCat")) || process.env.MESSAGING_STORE !== storePath) {
  process.stderr.write("refusing: the store must be a throwaway file named by MESSAGING_STORE\n")
  process.exit(2)
}

const { openStore } = await import(pathToFileURL(join(core, "dist/store/index.js")).href)
const { searchAll } = await import(pathToFileURL(join(core, "dist/services/index.js")).href)

const WARM = 10
const middle = Math.max(0, Math.floor((records - 10) / 8))
const QUERIES = [
  { case: "word in every invoice number", text: "INV" },
  { case: "one invoice number", text: `INV-${String(middle).padStart(6, "0")}` },
  { case: "word in every wallet name", text: "Bench" },
  { case: "word nothing holds", text: "zebra" },
]

const store = await openStore({ path: storePath })
const account = { provider: "bench-erp", account: "bench" }
const once = async (text) => {
  const started = performance.now()
  const found = await searchAll(store, account, { text, limit: 20, only: ["business"] })
  return { ms: performance.now() - started, found }
}
for (const query of QUERIES) {
  const first = await once(query.text)
  const warm = []
  for (let n = 0; n < WARM; n++) warm.push((await once(query.text)).ms)
  warm.sort((a, b) => a - b)
  process.stdout.write(
    `${JSON.stringify({
      core_version: JSON.parse(readFileSync(join(core, "package.json"), "utf8")).version,
      node: process.version,
      records,
      case: query.case,
      query: query.text,
      first_ms: Math.round(first.ms * 10) / 10,
      warm_median_ms: Math.round(warm[Math.floor(WARM / 2)] * 10) / 10,
      hits: first.found.items.length,
      has_more: first.found.hasMore,
      kinds: [...new Set(first.found.items.map((item) => item.kind))],
      skipped: first.found.skipped.map((one) => one.reason),
    })}\n`,
  )
}
await store.close()
