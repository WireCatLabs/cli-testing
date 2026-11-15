// Usage: node bench.mjs <cli-core checkout with dist> <walk|hub|catalog> [maxEntries]
// Synthetic data only, no network: a page tree where every page is a folder and a document (as Notion's are), and a
// Drive-shaped catalog of 12,000 entries. Prints one JSON line.
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, scenario = "walk", maxArg = "10000"] = process.argv.slice(2)
const maxEntries = Number(maxArg)
const load = (path) => import(pathToFileURL(join(core, "dist", path)).href)
const { syncDocuments } = await load("services/documents/sync.js")

const page = (id, parent, version = "1") => ({
  id,
  name: id,
  parents: parent ? [parent] : [],
  mime: "application/x-page",
  url: `https://example.invalid/${id}`,
  trashed: false,
  canDownload: true,
  version,
})
// 1 root, 50 hubs, 10 sections each, 49 pages per section: 25,051 pages; a hub holds 500 pages below it.
const tree = () => {
  const nodes = new Map([["root", page("root")]])
  for (let h = 0; h < 50; h++) {
    nodes.set(`h${h}`, page(`h${h}`, "root"))
    for (let s = 0; s < 10; s++) {
      nodes.set(`h${h}s${s}`, page(`h${h}s${s}`, `h${h}`))
      for (let l = 0; l < 49; l++) nodes.set(`h${h}s${s}l${l}`, page(`h${h}s${s}l${l}`, `h${h}s${s}`))
    }
  }
  return nodes
}

const harness = (nodes) => {
  const byParent = () => {
    const index = new Map()
    for (const node of nodes.values()) for (const p of node.parents) index.set(p, [...(index.get(p) ?? []), node])
    return index
  }
  let index = byParent()
  let changes = []
  let state = { version: 1, principal: "alpha", scope: "", folders: {}, documents: {}, skipped: [] }
  let walk
  const counts = { listings: 0, requests: 0 }
  const source = {
    identity: async () => "alpha",
    metadata: async (id) => {
      counts.requests++
      return nodes.get(id)
    },
    children: async (id) => {
      counts.listings++
      counts.requests++
      return index.get(id) ?? []
    },
    startToken: async () => "start",
    changes: async (cursor) => {
      counts.requests++
      const items = changes
      changes = []
      return { items, cursor: `${cursor}+` }
    },
    content: async (id) => {
      counts.requests++
      return { metadata: nodes.get(id), text: `words of ${id}`, markdown: "", tabs: [] }
    },
    bytes: async () => new Uint8Array(),
  }
  const options = {
    source,
    index: { save: async (_p, content) => content.metadata.id, remove: async () => {}, openPictures: async () => ({}) },
    principal: "alpha",
    roots: ["root"],
    textLimit: 200000,
    max: 1_000_000,
    maxEntries,
    storeVersion: "bench",
    isFolder: () => true,
    isDocument: () => true,
    skipReason: () => undefined,
    retryable: () => false,
    errorOf: (error) => error,
    assertHeld: () => {},
    state: {
      read: () => structuredClone(state),
      save: (next) => {
        state = next
      },
      readWalk: (scope) => (walk?.scope === scope ? structuredClone(walk) : undefined),
      saveWalk: (next) => {
        walk = structuredClone(next)
      },
      removeWalk: () => {
        walk = undefined
      },
      saveSnapshot: () => {},
      removeSnapshot: () => {},
    },
  }
  const change = (...files) => {
    for (const file of files) nodes.set(file.id, file)
    index = byParent()
    changes = files.map((file) => ({ id: file.id, removed: false, file }))
  }
  return { options, counts, change, state: () => state }
}

// Calls until the pass completes, as an agent following `next` would; a failed call ends the run.
const untilDone = async (h) => {
  const started = performance.now()
  let calls = 0
  for (;;) {
    calls++
    try {
      const result = await syncDocuments(h.options)
      if (result.complete !== false && !result.pending) break
    } catch (error) {
      return { calls, failed: String(error.message), ms: Math.round(performance.now() - started) }
    }
    if (calls > 1000) return { calls, failed: "no end after 1000 calls" }
  }
  return { calls, ms: Math.round(performance.now() - started) }
}

let out
if (scenario === "walk") {
  const nodes = tree()
  const h = harness(nodes)
  const run = await untilDone(h)
  out = {
    scenario,
    maxEntries,
    pages: nodes.size,
    ...run,
    ...h.counts,
    documents: Object.keys(h.state().documents).length,
  }
} else if (scenario === "hub") {
  const h = harness(tree())
  await untilDone(h)
  h.counts.listings = 0
  h.counts.requests = 0
  h.change(page("h7", "root", "2"), page("h7s3l5", "h7s3", "2"))
  const started = performance.now()
  const run = await untilDone(h)
  out = { scenario, maxEntries, pagesBelowHub: 500, ...run, ms: Math.round(performance.now() - started), ...h.counts }
} else {
  const { openStore } = await load("store/index.js")
  const { documentIngestion } = await load("services/documents/ingestion.js")
  const { catalogSource } = await load("cli/documents/catalog.js")
  const dir = mkdtempSync(join(tmpdir(), "sync-scale-catalog-"))
  const store = await openStore({ path: join(dir, "wirecat.db") })
  const ingest = documentIngestion(store, {
    provider: "google-drive",
    externalId: (id) => `${id}.md`,
    catalogInput: (item) => ({
      externalId: `${item.id}.md`,
      kind: item.mime === "inode/directory" ? "folder" : "file",
      name: item.name,
      parents: item.parents.map((p) => `${p}.md`),
    }),
    frontMatter: () => ({ source: "google-drive" }),
  })
  const file = (id, parent, mime = "text/plain") => ({ ...page(id, parent), mime })
  const files = [file("big", "root", "inode/directory")]
  for (let i = 0; i < 1000; i++) files.push(file(`b${i}`, "big"))
  for (let i = 0; i < 11000; i++) files.push(file(`o${i}`, `other${i % 50}`))
  await ingest.catalog.import("p", files)
  const tree = catalogSource(ingest.catalog, "p")
  let started = performance.now()
  const children = []
  for (let offset = 0; ; offset += 1000) {
    const got = await tree.children("big", { limit: 1000, offset })
    children.push(...got.items)
    if (!got.hasMore) break
  }
  const childrenMs = performance.now() - started
  started = performance.now()
  await tree.withChildren(children.map((entry) => entry.externalId.replace(/\.md$/, "")))
  const branchesMs = performance.now() - started
  out = {
    scenario,
    entries: files.length,
    children: children.length,
    childrenMs: Math.round(childrenMs),
    branchesMs: Math.round(branchesMs),
    depth1Ms: Math.round(childrenMs + branchesMs),
  }
  await store.close()
  rmSync(dir, { recursive: true, force: true })
}
process.stdout.write(`${JSON.stringify(out)}\n`)
