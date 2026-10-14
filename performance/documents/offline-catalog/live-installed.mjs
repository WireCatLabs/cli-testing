import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { initialize, workspaceEnvironment } from "./live-input.mjs"

const [input, ...rest] = process.argv.slice(2)
assert.ok(input && rest.length === 0, "usage: node live-installed.mjs <installed-drive-0.7.0-package>")
const pkg = resolve(input)
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
assert.equal(metadata.version, "0.7.0")
const require = createRequire(join(pkg, "package.json"))
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const root = mkdtempSync(join(tmpdir(), "drive-live-installed-"))
const workspace = initialize(join(root, "workspace"), "synthetic")
const env = workspaceEnvironment(workspace, "synthetic")
const store = await openStore({ path: env.DRIVE_STORE, env })
const folder = await store.notes.addFolder({ name: "google-drive:synthetic-principal" })
const { note } = await store.notes.saveFileNote({
  folderId: folder.id,
  path: "doc.md",
  title: "Synthetic document",
  text: "wirecatbodymarker",
  contentHash: "synthetic-hash",
})
await store.close()
const file = (id, parents, mime) => ({
  id,
  parents,
  mime,
  name: "Synthetic document",
  url: `https://example.invalid/${id}`,
  canDownload: true,
  trashed: false,
})
const parent = file("root", [], "application/vnd.google-apps.folder")
const doc = file("doc", ["root"], "application/vnd.google-apps.document")
mkdirSync(env.DRIVE_CONFIG_DIR)
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({
    profiles: { synthetic: { principal: "synthetic-principal", roots: ["root"], storage: "keyring" } },
  }),
)
const state = join(env.DRIVE_STATE_DIR, "profiles/synthetic")
mkdirSync(join(state, "documents"), { recursive: true })
writeFileSync(
  join(state, "state.json"),
  JSON.stringify({
    version: 1,
    principal: "synthetic-principal",
    scope: "",
    folders: { root: parent },
    documents: { doc: { metadata: doc, hash: "synthetic-hash", reference: note.ref, tabs: 2 } },
    skipped: [],
  }),
)
writeFileSync(
  join(state, "documents/doc.json"),
  JSON.stringify({
    metadata: doc,
    text: "wirecatbodymarker",
    markdown: "# wirecatbodymarker",
    tabs: [
      { id: "one", title: "One", text: "wirecatbodymarker" },
      { id: "two", title: "Two", text: "Synthetic second tab" },
    ],
  }),
)
const guard = join(root, "guard.mjs")
writeFileSync(
  guard,
  `import { createRequire, syncBuiltinESMExports } from 'node:module';
const require = createRequire(import.meta.url);
const deny = () => { throw new Error('Unexpected network/browser/keyring access'); };
globalThis.fetch = deny;
for (const name of ['node:http','node:https']) { const module = require(name); module.request = deny; module.get = deny; }
for (const name of ['exec','execFile','spawn','fork','execSync','execFileSync','spawnSync']) require('node:child_process')[name] = deny;
syncBuiltinESMExports();
const keyringRequire = createRequire(${JSON.stringify(require.resolve("@wirecat/cli-base"))});
const keyring = keyringRequire.resolve('@napi-rs/keyring');
require.cache[keyring] = { id: keyring, filename: keyring, loaded: true, exports: { Entry: class { constructor() { deny(); } } } };
`,
)
const wrapper = join(root, "guarded-package")
mkdirSync(join(wrapper, "dist/bin"), { recursive: true })
writeFileSync(join(wrapper, "package.json"), JSON.stringify({ ...metadata, type: "module" }))
writeFileSync(
  join(wrapper, "dist/bin/drive.js"),
  `await import(${JSON.stringify(pathToFileURL(guard).href)}); await import(${JSON.stringify(pathToFileURL(join(pkg, "dist/bin/drive.js")).href)});`,
)
const seed = spawnSync(
  process.execPath,
  [join(wrapper, "dist/bin/drive.js"), "synthetic", "--offline", "--json", "catalog", "import"],
  { env, encoding: "utf8", timeout: 30000 },
)
assert.equal(seed.status, 0, seed.stderr)
const manifest = join(root, "manifest.json")
writeFileSync(
  manifest,
  JSON.stringify({
    schema_version: 1,
    drive_version: "0.7.0",
    folder_id: "root",
    folders: [{ id: "root", parents: [] }],
    documents: [
      {
        id: "doc",
        parents: ["root"],
        markers: ["wirecatbodymarker"],
        markdown_markers: ["wirecatbodymarker"],
        min_tabs: 2,
      },
    ],
  }),
)
const runner = fileURLToPath(new URL("./live.mjs", import.meta.url))
const run = (output, extra) => {
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "check",
      "--workspace",
      workspace,
      "--profile",
      "synthetic",
      "--drive",
      wrapper,
      "--manifest",
      manifest,
      "--output",
      output,
      ...extra,
    ],
    { env: process.env, encoding: "utf8", timeout: 120000 },
  )
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(readFileSync(output, "utf8"))
  assert.equal(report.passed, true)
  assert.equal(report.live_google, false)
  return report
}
const first = join(root, "first.json")
const annotated = run(first, ["--annotate"])
const repeated = run(join(root, "repeat.json"), ["--baseline", first])
process.stdout.write(
  `${JSON.stringify({ passed: true, data: "synthetic", live_google: false, drive: metadata.version, core: metadata.dependencies["@wirecat/cli-core"], first_checks: annotated.checks.length, repeat_checks: repeated.checks.length })}\n`,
)
