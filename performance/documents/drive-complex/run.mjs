import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { complexDocument, expectedMarkers, expectedTabs, nativeMarkdown } from "./fixture.mjs"

const [input, ...extra] = process.argv.slice(2)
assert.ok(input && extra.length === 0, "usage: node run.mjs <installed-reviewed-drive-package>")
const pkg = resolve(input)
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
assert.ok(["0.11.2", "0.12.0"].includes(metadata.version), "unreviewed Drive release")
assert.equal(metadata.dependencies["@wirecat/cli-core"], "0.289.0")
assert.equal(metadata.dependencies["@wirecat/cli-base"], "0.33.0")
const require = createRequire(join(pkg, "package.json"))
const deny = () => {
  throw new Error("Unexpected network/browser/keyring access")
}
globalThis.fetch = deny
for (const name of ["node:http", "node:https"]) {
  const module = require(name)
  module.request = deny
  module.get = deny
}
for (const name of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"])
  require("node:child_process")[name] = deny
syncBuiltinESMExports()
const baseRequire = createRequire(require.resolve("@wirecat/cli-base"))
const keyring = baseRequire.resolve("@napi-rs/keyring")
require.cache[keyring] = {
  id: keyring,
  filename: keyring,
  loaded: true,
  exports: {
    Entry: class {
      constructor() {
        deny()
      }
    },
  },
}
const { createProgram, googleSource } = await import(pathToFileURL(join(pkg, "dist/index.js")))
const { captureStreams } = await import(pathToFileURL(require.resolve("@wirecat/cli-base")))
const { OAuth2Client } = await import(pathToFileURL(require.resolve("google-auth-library")))
const root = mkdtempSync(join(tmpdir(), "drive-complex-installed-"))
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NPM_CONFIG_USERCONFIG: "/dev/null",
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  DRIVE_STORE: join(root, "drive.db"),
  MESSAGING_STORE: join(root, "drive.db"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  XDG_CONFIG_HOME: join(root, "xdg-config"),
  XDG_DATA_HOME: join(root, "xdg-data"),
  XDG_STATE_HOME: join(root, "xdg-state"),
  XDG_CACHE_HOME: join(root, "xdg-cache"),
}
mkdirSync(env.DRIVE_CONFIG_DIR)
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({
    profiles: { synthetic: { principal: "synthetic-principal", roots: ["root"], storage: "keyring" } },
  }),
  { mode: 0o600 },
)
const FOLDER = "application/vnd.google-apps.folder"
const DOC = "application/vnd.google-apps.document"
let phase = 0
let interrupted = false
const calls = []
const file = (id, parents = [], mimeType = FOLDER) => ({
  id,
  parents,
  mimeType,
  name:
    id === "complex" || id === "twin"
      ? phase >= 1 && id === "complex"
        ? "Renamed source"
        : "Synthetic duplicate"
      : id,
  version: String(phase + 1),
  trashed: id === "complex" && phase === 4,
  capabilities: { canDownload: true },
})
const complexFile = () => file("complex", [phase >= 3 ? "right" : "left"], DOC)
const auth = new OAuth2Client("synthetic-client")
Object.defineProperty(auth, "request", {
  value: async (options) => {
    assert.ok(options.method === undefined || options.method === "GET", "ingestion must only read Google")
    const path = new URL(String(options.url)).pathname
    const params = options.params ?? {}
    calls.push(path)
    let data
    if (path.endsWith("/about")) data = { user: { permissionId: "synthetic-principal" } }
    else if (path.endsWith("/changes/startPageToken")) data = { startPageToken: "initial" }
    else if (path.endsWith("/changes"))
      data = {
        changes: phase
          ? [
              phase >= 6
                ? { fileId: "right", file: file("right", [phase === 6 ? "outside" : "root"]) }
                : { fileId: "complex", file: complexFile() },
            ]
          : [],
        newStartPageToken: `phase-${phase}`,
      }
    else if (path.includes("/documents/")) {
      assert.equal(params.includeTabsContent, true)
      assert.equal(params.suggestionsViewMode, "PREVIEW_WITHOUT_SUGGESTIONS")
      if (path.endsWith("/complex")) data = complexDocument(phase >= 2)
      else
        data = {
          tabs: [
            {
              tabProperties: { tabId: "twin", title: "Twin" },
              documentTab: {
                body: { content: [{ paragraph: { elements: [{ textRun: { content: "unrelatedtwinmarker\n" } }] } }] },
              },
            },
          ],
        }
    } else if (path.endsWith("/export")) {
      assert.equal(params.mimeType, "text/markdown")
      if (!interrupted && path.includes("/complex/")) {
        interrupted = true
        throw new Error("synthetic export interruption")
      }
      data = path.includes("/complex/") ? nativeMarkdown(phase >= 2) : "# Twin\n"
    } else if (path.endsWith("/files")) {
      const parent = params.q.match(/^'([^']+)'/)[1]
      data = {
        files:
          parent === "root"
            ? [file("left", ["root"]), file("right", ["root"]), file("twin", ["root"], DOC)]
            : parent === (phase >= 3 ? "right" : "left")
              ? [complexFile()]
              : [],
      }
    } else {
      const id = path.match(/\/files\/([^/]+)$/)?.[1]
      assert.ok(id, "unexpected synthetic SDK request")
      data =
        id === "complex"
          ? complexFile()
          : id === "twin"
            ? file(id, ["root"], DOC)
            : file(id, id === "root" ? [] : ["root"])
    }
    return { data, status: 200, headers: new Headers(), config: options }
  },
})
const source = googleSource(auth)
let invocations = 0
const invoke = async (words, { partial = false } = {}) => {
  const streams = captureStreams()
  try {
    await createProgram({ env, streams, source: async () => source })
      .exitOverride()
      .parseAsync(["synthetic", "--json", ...words], { from: "user" })
    assert.equal(partial, false, "expected a partial-sync failure")
  } catch (error) {
    if (!partial) throw error
    assert.equal(error.code, "provider_error")
    assert.equal(error.details.reason, "sync.partial")
  }
  invocations++
  const answer = JSON.parse(streams.stdout.join(""))
  assert.equal(answer.meta.complete, true)
  return answer
}
const item = async (words, options) => (await invoke(words, options)).item
const list = async (words) => (await invoke(words)).items
const checks = []
const first = await item(["sync"], { partial: true })
assert.equal(first.pending, 1)
assert.equal(first.saved, 1)
const listings = calls.filter((path) => path.endsWith("/files")).length
const resumed = await item(["sync"])
assert.equal(resumed.pending, 0)
assert.equal(calls.filter((path) => path.endsWith("/files")).length, listings)
checks.push("interrupted-export-resumes-without-relisting")
const imported = await list(["--offline", "documents", "list"])
assert.equal(imported.length, 2)
assert.equal(new Set(imported.map((doc) => doc.reference)).size, 2)
const reference = imported.find((doc) => doc.id === "complex").reference
const snapshot = await item(["--offline", "documents", "show", "complex"])
assert.deepEqual(
  snapshot.tabs.map((tab) => tab.id),
  expectedTabs,
)
for (const marker of expectedMarkers) {
  assert.ok(snapshot.text.includes(marker), marker)
  if (!marker.includes(" "))
    assert.ok(
      (await item(["--offline", "search", marker, "--exact"])).hits.some((hit) => hit.ref === reference),
      marker,
    )
}
assert.ok(!snapshot.text.includes("excludedheadermarker"))
assert.ok(!snapshot.text.includes("excludedfootermarker"))
const output = join(root, "native.md")
await item(["--offline", "documents", "export", "complex", "--output", output])
assert.equal(readFileSync(output, "utf8"), nativeMarkdown())
checks.push("nested-tabs-tables-footnotes-chips-unicode-and-native-markdown")
await list(["--offline", "tags", "add", "complex", "follow-up"])
const note = await item(["--offline", "notes", "add", "complex", "Synthetic owner memo"])
const memory = await item(["--offline", "memories", "add", "complex", "Synthetic original decision", "--scope", "work"])
await item(["--offline", "memories", "confirm", "complex", memory.ref])
phase = 1
assert.equal((await item(["sync"])).unchanged, 1)
assert.equal((await list(["--offline", "documents", "list", "tag:follow-up"]))[0].reference, reference)
assert.equal((await item(["--offline", "memories", "show", "complex", memory.ref])).status, "confirmed")
assert.equal((await item(["--offline", "notes", "show", "complex", note.ref])).text, "Synthetic owner memo")
checks.push("rename-preserves-reference-tags-note-and-confirmed-memory")
phase = 2
assert.equal((await item(["sync"])).saved, 1)
assert.ok(
  (await item(["--offline", "search", "replacementmarker", "--exact"])).hits.some((hit) => hit.ref === reference),
)
assert.ok(!(await item(["--offline", "search", "originalmarker", "--exact"])).hits.some((hit) => hit.ref === reference))
assert.equal((await item(["--offline", "memories", "show", "complex", memory.ref])).status, "stale")
checks.push("edit-replaces-search-text-and-stales-memory")
phase = 3
await item(["sync"])
assert.deepEqual((await item(["--offline", "catalog", "show", "complex"])).parents, ["right"])
assert.equal((await list(["--offline", "catalog", "list", "parent:left"])).length, 0)
assert.equal((await list(["--offline", "catalog", "list", "parent:right"]))[0].id, "complex")
assert.equal((await list(["--offline", "documents", "list", "tag:follow-up"]))[0].reference, reference)
checks.push("in-scope-move-updates-tree-and-keeps-reference")
phase = 4
assert.equal((await item(["sync"])).removed, 1)
assert.ok(
  !(await item(["--offline", "search", "replacementmarker", "--exact"])).hits.some((hit) => hit.ref === reference),
)
assert.equal((await list(["--offline", "documents", "list"])).length, 1)
checks.push("trash-hides-source-and-leaves-unrelated-twin")
assert.equal(existsSync(join(env.DRIVE_STATE_DIR, "profiles/synthetic/documents/complex.json")), false)
phase = 5
await item(["sync"])
assert.equal((await list(["--offline", "documents", "list"])).find((doc) => doc.id === "complex").reference, reference)
assert.ok(
  (await item(["--offline", "search", "replacementmarker", "--exact"])).hits.some((hit) => hit.ref === reference),
)
assert.equal((await item(["--offline", "notes", "show", "complex", note.ref])).text, "Synthetic owner memo")
checks.push("restore-reuses-reference-and-owner-note")
assert.equal((await item(["--offline", "memories", "show", "complex", memory.ref])).status, "stale")
phase = 6
assert.equal((await item(["sync"])).removed, 1)
assert.equal((await list(["--offline", "documents", "list"])).length, 1)
assert.ok(
  !(await item(["--offline", "search", "replacementmarker", "--exact"])).hits.some((hit) => hit.ref === reference),
)
checks.push("ancestor-scope-exit-retires-descendants-without-file-events")
phase = 7
await item(["sync"])
assert.equal((await list(["--offline", "documents", "list"])).find((doc) => doc.id === "complex").reference, reference)
assert.equal((await item(["--offline", "notes", "show", "complex", note.ref])).text, "Synthetic owner memo")
checks.push("ancestor-reentry-discovers-descendants-and-retains-identity")
assert.equal((await item(["sync"])).saved, 0)
checks.push("repeat-sync-is-idempotent")
process.stdout.write(
  `${JSON.stringify({ passed: true, data: "synthetic", live_google: false, drive: metadata.version, core: metadata.dependencies["@wirecat/cli-core"], invocations, checks })}\n`,
)
