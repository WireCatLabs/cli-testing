// Usage: node --expose-gc bench.mjs <cli-core checkout with dist> <entries> [saves]
// Synthetic data only. One Drive-shaped documents account: a catalog import of <entries> files under 100 folders,
// the same import again (a sync with nothing new), <saves> document texts saved, and a page of the catalog list.
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, entriesArg = "10000", savesArg = "200"] = process.argv.slice(2)
const entries = Number(entriesArg)
const saves = Number(savesArg)
const load = (path) => import(pathToFileURL(join(core, "dist", path)).href)
const { openStore } = await load("store/index.js")
const { documentIngestion } = await load("services/documents/ingestion.js")

const dir = mkdtempSync(join(tmpdir(), "catalog-scale-"))
const store = await openStore({ path: join(dir, "wirecat.db") })
const folders = Array.from({ length: 100 }, (_, i) => ({ id: `folder-${i}`, name: `Folder ${i}`, parents: ["root"] }))
const file = (i) => ({
  id: `file-${i}`,
  name: `Report ${i} budget plan`,
  parents: [`folder-${i % 100}`],
  mime: "text/plain",
  url: `https://example.invalid/file-${i}`,
  trashed: false,
  canDownload: true,
  version: "1",
  modifiedAt: "2026-11-01T10:00:00.000Z",
})
const files = [
  { id: "root", name: "Root", parents: [], mime: "inode/directory" },
  ...folders.map((f) => ({ ...f, mime: "inode/directory" })),
  ...Array.from({ length: entries }, (_, i) => file(i)),
].map((f) => ({ url: `https://example.invalid/${f.id}`, trashed: false, canDownload: true, version: "1", ...f }))
const ingest = documentIngestion(store, {
  provider: "google-drive",
  externalId: (id) => `${id}.md`,
  catalogInput: (f) => ({
    externalId: `${f.id}.md`,
    kind: f.mime === "inode/directory" ? "folder" : "file",
    name: f.name,
    parents: f.parents.map((id) => `${id}.md`),
    url: f.url,
    mime: f.mime,
  }),
  frontMatter: (content) => ({ source: "google-drive", fileId: content.metadata.id, sourceUrl: content.metadata.url }),
})

let peak = 0
const sample = setInterval(() => {
  peak = Math.max(peak, process.memoryUsage().rss)
}, 5)
const step = async (name, run) => {
  globalThis.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  peak = process.memoryUsage().rss
  const start = performance.now()
  try {
    await run()
    const ms = performance.now() - start
    peak = Math.max(peak, process.memoryUsage().rss)
    return {
      step: name,
      ms: Math.round(ms),
      peak_rss_mb: Math.round(peak / 2 ** 20),
      heap_growth_mb: Math.round((process.memoryUsage().heapUsed - heapBefore) / 2 ** 20),
    }
  } catch (error) {
    return { step: name, ms: Math.round(performance.now() - start), error: error.message }
  }
}
const results = []
results.push(await step("import", () => ingest.catalog.import("ana@example.com", files)))
results.push(await step("import again", () => ingest.catalog.import("ana@example.com", files)))
results.push(
  await step(`save ${saves}`, async () => {
    for (let i = 0; i < saves; i++) {
      const metadata = files[101 + Math.floor((i * entries) / saves)]
      await ingest.save("ana@example.com", { metadata, text: `budget text ${i}`, markdown: "", tabs: [] }, `hash-${i}`)
    }
  }),
)
results.push(
  await step("list page", () =>
    ingest.catalog.list("ana@example.com", { limit: 50, offset: Math.max(0, entries - 50) }),
  ),
)
clearInterval(sample)
await store.close()
rmSync(dir, { recursive: true, force: true })
process.stdout.write(`${JSON.stringify({ entries, saves, node: process.version, results })}\n`)
