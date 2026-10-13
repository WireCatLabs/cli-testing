import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [driveRoot, coreRoot] = process.argv.slice(2).map((path) => resolve(path))
assert.ok(driveRoot && coreRoot, "usage: node run.mjs <built-drive-package> <built-core-package>")
const require = createRequire(join(coreRoot, "package.json"))
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const directory = mkdtempSync(join(tmpdir(), "wirecat-catalog-contract-"))
const env = {
  PATH: process.env.PATH,
  NPM_CONFIG_USERCONFIG: "/dev/null",
  DRIVE_CONFIG_DIR: join(directory, "config"),
  DRIVE_STATE_DIR: join(directory, "state"),
  DRIVE_CACHE_DIR: join(directory, "cache"),
  DRIVE_STORE: join(directory, "store.db"),
  MESSAGING_STORE: join(directory, "store.db"),
  WIRECAT_STATE_DIR: join(directory, "wirecat"),
}
const file = (id, parents, mime = "application/pdf") => ({
  id,
  parents,
  mime,
  name: "Budget outline",
  url: `https://example.invalid/${id}`,
  canDownload: true,
  trashed: false,
  lastModifiedBy: { id: "rin", name: "Rin Example" },
  providerMetadata: { starred: true, fixture: true },
})
const root = file("root", [], "application/vnd.google-apps.folder")
const nested = file("nested", ["root"], "application/vnd.google-apps.folder")
const doc = file("doc", ["nested"])
mkdirSync(env.DRIVE_CONFIG_DIR, { recursive: true })
const config = {
  profiles: {
    synthetic: { principal: "synthetic-principal", roots: ["root"], storage: "keyring" },
    other: { principal: "other-principal", roots: ["root"], storage: "keyring" },
  },
}
writeFileSync(join(env.DRIVE_CONFIG_DIR, "config.json"), JSON.stringify(config))
const store = await openStore({ path: env.DRIVE_STORE, env })
const collection = await store.notes.addFolder({ name: "google-drive:synthetic-principal" })
const { note } = await store.notes.saveFileNote({
  folderId: collection.id,
  path: "doc.md",
  title: doc.name,
  text: "Synthetic source body",
  contentHash: "fixture-hash",
})
await store.close()
mkdirSync(join(env.DRIVE_STATE_DIR, "profiles", "synthetic"), { recursive: true })
writeFileSync(
  join(env.DRIVE_STATE_DIR, "profiles", "synthetic", "state.json"),
  JSON.stringify({
    version: 1,
    principal: "synthetic-principal",
    scope: "",
    folders: { root, nested },
    documents: { doc: { metadata: doc, hash: "fixture-hash", reference: note.ref, tabs: 0 } },
    skipped: [],
  }),
)
const guard = join(directory, "guard.mjs")
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
let checks = 0
const invoke = (words, profile = "synthetic", ok = true) => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      guard,
      join(driveRoot, "dist/bin/drive.js"),
      ...(profile ? [profile] : []),
      "--offline",
      "--json",
      ...words,
    ],
    { env, encoding: "utf8", timeout: 30000 },
  )
  assert.equal(result.error, undefined)
  assert.equal(result.status === 0, ok, result.stderr)
  checks++
  return JSON.parse(result.stdout.trim() || result.stderr.trim())
}
assert.equal(invoke(["catalog", "import"]).entries, 3)
assert.equal(invoke(["catalog", "show", "doc"]).ref, note.ref)
assert.equal(invoke(["catalog", "show", "doc"]).metadata.starred, true)
assert.equal(invoke(["catalog", "tree"]).items[0].children[0].children[0].item.id, "doc")
assert.equal(invoke(["catalog", "list", "parent:nested AND person:Rin*"]).items.length, 1)
assert.equal(invoke(["catalog", "search", "budget AND kind:file"]).items.length, 1)
assert.ok(invoke(["catalog", "tags", "add", "nested", "follow-up"]).includes("follow-up"))
assert.equal(invoke(["catalog", "list", "tag:follow-up"]).items[0].id, "nested")
invoke(["notes", "add", "nested", "Synthetic folder memo"])
assert.equal(invoke(["notes", "list", "nested"]).items.length, 1)
assert.equal(invoke(["documents", "context", "nested"]).notes.items.length, 1)
assert.equal(invoke(["catalog", "list"], "other").items.length, 0)
invoke(["catalog", "show", "doc"], "other", false)
assert.equal(invoke(["catalog", "import", "--dry-run"]).dryRun, true)
invoke(["catalog", "tags", "add", "nested", "blocked", "--read-only"], "synthetic", false)
invoke(["catalog", "list"], "", false)
config.profiles.synthetic.roots = []
writeFileSync(join(env.DRIVE_CONFIG_DIR, "config.json"), JSON.stringify(config))
assert.equal(invoke(["catalog", "import"]).retired, 3)
assert.equal(invoke(["catalog", "list"]).items.length, 0)
const kept = await openStore({ path: env.DRIVE_STORE, env })
assert.equal((await kept.notes.note(note.ref)).text, "Synthetic source body")
assert.equal((await kept.notes.note(note.ref)).contentHash, "fixture-hash")
await kept.close()
process.stdout.write(`${JSON.stringify({ checks, passed: true, data: "synthetic", liveGoogle: false })}\n`)
