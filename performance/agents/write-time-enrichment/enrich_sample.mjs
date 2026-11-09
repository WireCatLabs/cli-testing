// Enriches the records named on stdin through cli-core's own enrichRecords, against the store the environment names.
// The key comes from OPENAI_API_KEY in the environment; this process prints only the run's counts and cost.
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const core = process.argv[2]
const { openStore } = await import(pathToFileURL(`${core}/dist/store/index.js`).href)
const { enrichRecords } = await import(pathToFileURL(`${core}/dist/services/index.js`).href)
const only = JSON.parse(readFileSync(0, "utf8"))
const store = await openStore({ env: process.env })
try {
  const run = await enrichRecords(store, {
    env: process.env,
    narrow: { only },
    maxRecords: only.length,
    concurrency: 6,
  })
  process.stdout.write(`${JSON.stringify(run)}\n`)
} finally {
  await store.close()
}
