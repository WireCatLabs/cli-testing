import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"

const [drivePath, corePath, effectsMode] = process.argv.slice(2)
assert.ok(drivePath && corePath, "usage: node run.mjs <built-drive-package> <built-core-package> [--precise-effects]")
assert.ok(effectsMode === undefined || effectsMode === "--precise-effects", "unknown effects expectation")
const preciseEffects = effectsMode === "--precise-effects"
const driveRoot = resolve(drivePath)
const coreRoot = resolve(corePath)
const require = createRequire(join(coreRoot, "package.json"))
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const { itemEnvelopeSchema, listEnvelopeSchema, errorObjectSchema } = await import(
  pathToFileURL(require.resolve("@wirecat/cli-base/standards"))
)
const v = await import(pathToFileURL(require.resolve("valibot")))
const successSchema = v.union([itemEnvelopeSchema(v.unknown()), listEnvelopeSchema(v.unknown())])
const packageVersion = (root) => JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version
const directory = mkdtempSync(join(tmpdir(), "wirecat-catalog-contract-"))
const env = {
  HOME: directory,
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
  providerMetadata: { starred: true, fixture: true, customMixedKey: "synthetic-value" },
})
const root = file("root", [], "application/vnd.google-apps.folder")
const nested = file("nested", ["root"], "application/vnd.google-apps.folder")
const doc = file("doc", ["nested"])
mkdirSync(env.DRIVE_CONFIG_DIR, { recursive: true })
const config = {
  defaults: { readOnly: false, maxTextChars: 2000 },
  profiles: {
    synthetic: { principal: "synthetic-principal", roots: ["root"], storage: "keyring" },
    other: { principal: "other-principal", roots: ["root"], storage: "keyring" },
  },
}
const configPath = join(env.DRIVE_CONFIG_DIR, "config.json")
writeFileSync(configPath, JSON.stringify(config), { mode: 0o640 })
const configMode = statSync(configPath).mode & 0o777
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
let contract
const invoke = (words, profile = "synthetic", ok = true, shape = "item") => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      guard,
      join(driveRoot, "dist/bin/drive.js"),
      ...(profile ? [profile] : []),
      "--offline",
      ...(words.some((word) => word.startsWith("--json=")) ? [] : ["--json"]),
      ...words,
    ],
    { env, encoding: "utf8", timeout: 30000 },
  )
  assert.equal(result.error, undefined)
  assert.equal(result.status === 0, ok, result.stderr)
  checks++
  const raw = result.stdout.trim() || result.stderr.trim()
  if (shape === "jsonl") return raw.split("\n").map((line) => JSON.parse(line))
  const answer = JSON.parse(raw)
  if (shape === "discovery") return answer
  if (!ok) {
    v.parse(errorObjectSchema, answer)
    if (contract === 3) assert.equal(answer.error.retry.safe, false)
    return answer.error
  }
  if (contract >= 2) {
    v.parse(successSchema, answer)
    if (contract === 3) assert.equal(answer.meta.complete, true)
    assert.ok(Object.hasOwn(answer, shape), `expected ${shape} envelope for ${words.join(" ")}`)
    return shape === "item" ? answer.item : answer
  }
  return answer
}
const discovery = invoke(["commands"], "", true, "discovery")
contract = discovery.contract
assert.ok([1, 2, 3].includes(contract), "unreviewed command contract")
if (preciseEffects) assert.equal(contract, 3)
assert.equal(discovery.version, packageVersion(driveRoot))
if (contract === 3) {
  const flatten = (commands) => commands.flatMap((command) => [command, ...flatten(command.commands)])
  const commands = flatten(discovery.commands)
  for (const command of commands) {
    assert.ok(["none", "read", "write"].includes(command.effects.remote))
    assert.ok(["none", "read", "write"].includes(command.effects.local))
    for (const old of ["mutates", "local", "operation_id"]) assert.equal(Object.hasOwn(command, old), false)
  }
  for (const [path, effects] of [
    ["documents show", { remote: "none", local: "read" }],
    ["catalog import", { remote: "none", local: "write" }],
    ["documents get", { remote: "read", local: preciseEffects ? "none" : "read" }],
    ["files copy", { remote: "write", local: "none" }],
    ["sync", { remote: "read", local: "write" }],
  ]) {
    assert.deepEqual(commands.find((command) => command.path.join(" ") === path)?.effects, effects)
  }
  const generatedRead = commands.find((command) => command.path.join(" ") === "api drive-files-get")
  assert.equal(generatedRead.api_operation, "drive.files.get")
  assert.deepEqual(generatedRead.effects, { remote: "read", local: "none" })
  if (preciseEffects) {
    for (const path of ["commands", "complete", "api list", "api show"]) {
      assert.deepEqual(commands.find((command) => command.path.join(" ") === path)?.effects, {
        remote: "none",
        local: "none",
      })
    }
    for (const path of [
      "files get",
      "files list",
      "documents history",
      "comments get",
      "permissions get",
      "revisions get",
    ]) {
      assert.deepEqual(commands.find((command) => command.path.join(" ") === path)?.effects, generatedRead.effects)
    }
  }
  assert.equal(
    discovery.global_options.some((option) => option.flags.startsWith("--agent-json")),
    false,
  )
}
assert.equal(invoke(["catalog", "import"]).entries, 3)
if (contract >= 2) {
  const migrated = JSON.parse(readFileSync(configPath, "utf8"))
  assert.equal(migrated.defaults.read_only, false)
  assert.equal(migrated.defaults.max_text_chars, 2000)
  assert.equal(Object.hasOwn(migrated.defaults, "readOnly"), false)
  assert.equal(Object.hasOwn(migrated.defaults, "maxTextChars"), false)
  assert.equal(statSync(configPath).mode & 0o777, configMode)
  const before = statSync(configPath, { bigint: true })
  const bytes = readFileSync(configPath)
  invoke(["config", "show"])
  const after = statSync(configPath, { bigint: true })
  assert.equal(after.ino, before.ino)
  assert.equal(after.mtimeNs, before.mtimeNs)
  assert.deepEqual(readFileSync(configPath), bytes)
}
assert.equal(invoke(["catalog", "show", "doc"]).ref, note.ref)
assert.equal(invoke(["catalog", "show", "doc"]).provider_metadata.starred, true)
assert.equal(invoke(["catalog", "show", "doc"]).provider_metadata.customMixedKey, "synthetic-value")
if (preciseEffects) {
  assert.deepEqual(invoke(["catalog", "show", "doc", "--json=id,name"]), { id: "doc", name: "Budget outline" })
  assert.deepEqual(invoke(["catalog", "show", "doc", "--json=provider_metadata.customMixedKey"]), {
    provider_metadata: { customMixedKey: "synthetic-value" },
  })
  const projected = invoke(["catalog", "list", "--limit", "2", "--json=id,name"], "synthetic", true, "items")
  assert.equal(projected.items.length, 2)
  assert.ok(projected.items.every((item) => Object.keys(item).sort().join(",") === "id,name"))
  const lines = invoke(["catalog", "list", "--limit", "2", "--json=id,name", "--jsonl"], "synthetic", true, "jsonl")
  assert.deepEqual(
    lines.map((line) => line.type),
    ["item", "item", "end"],
  )
  assert.ok(lines.slice(0, -1).every((line) => Object.keys(line.data).sort().join(",") === "id,name"))
  assert.equal(lines.at(-1).complete, true)
  assert.equal(
    invoke(["catalog", "show", "doc", "--json=synthetic_missing"], "synthetic", false).code,
    "validation_error",
  )
  assert.equal(invoke(["files", "copy", "doc", "--json=id"], "synthetic", false).code, "validation_error")
}
assert.equal(invoke(["catalog", "tree"], "synthetic", true, "items").items[0].children[0].children[0].item.id, "doc")
assert.equal(invoke(["catalog", "list", "parent:nested AND person:Rin*"], "synthetic", true, "items").items.length, 1)
assert.equal(invoke(["catalog", "search", "budget AND kind:file"], "synthetic", true, "items").items.length, 1)
const addedTags = invoke(["catalog", "tags", "add", "nested", "follow-up"], "synthetic", true, "items")
assert.ok((contract >= 2 ? addedTags.items : addedTags).includes("follow-up"))
assert.equal(invoke(["catalog", "list", "tag:follow-up"], "synthetic", true, "items").items[0].id, "nested")
invoke(["notes", "add", "nested", "Synthetic folder memo"])
assert.equal(invoke(["notes", "list", "nested"], "synthetic", true, "items").items.length, 1)
assert.equal(invoke(["documents", "context", "nested"]).notes.items.length, 1)
assert.equal(invoke(["catalog", "list"], "other", true, "items").items.length, 0)
assert.equal(invoke(["catalog", "show", "doc"], "other", false).code, "not_found")
const preview = invoke(["catalog", "import", "--dry-run"])
assert.equal(preview.dry_run, true)
if (contract === 3) assert.deepEqual(preview.effects, { remote: "none", local: "write" })
assert.equal(
  invoke(["catalog", "tags", "add", "nested", "blocked", "--read-only"], "synthetic", false).code,
  "permission_error",
)
assert.equal(invoke(["catalog", "list"], "", false).reason, "profile.required")
const hits = invoke(["search", "Synthetic", "--exact"])
assert.equal(hits.hits.length, 1)
if (contract >= 2) {
  assert.ok(Object.hasOwn(hits.hits[0], "found_by"))
  assert.equal(Object.hasOwn(hits.hits[0], "foundBy"), false)
}
if (contract === 3) {
  const ids = []
  for (const page of [1, 2, 3]) {
    const answer = invoke(["catalog", "list", "--limit", "1", "--page", String(page)], "synthetic", true, "items")
    assert.equal(answer.page.mode, "page")
    assert.equal(answer.page.limit, 1)
    assert.equal(answer.page.has_more, page < 3)
    assert.equal(answer.page.next_page, page < 3 ? page + 1 : undefined)
    assert.equal(Object.hasOwn(answer.page, "cursor"), false)
    ids.push(answer.items[0].id)
  }
  assert.equal(new Set(ids).size, 3)
  invoke(["notes", "add", "nested", "Second synthetic folder memo"])
  const firstNotes = invoke(["notes", "list", "nested", "--limit", "1", "--page", "1"], "synthetic", true, "items")
  const lastNotes = invoke(["notes", "list", "nested", "--limit", "1", "--page", "2"], "synthetic", true, "items")
  assert.equal(firstNotes.page.next_page, 2)
  assert.equal(firstNotes.page.has_more, true)
  assert.equal(lastNotes.page.has_more, false)
  assert.notEqual(firstNotes.items[0].id, lastNotes.items[0].id)
  assert.equal(invoke(["search", "Synthetic", "--exact", "--limit", "1", "--page", "2"]).hits.length, 0)
  for (const words of [
    ["search", "Synthetic", "--exact", "--offset", "0"],
    ["notes", "list", "nested", "--offset", "0"],
    ["catalog", "list", "--agent-json"],
    ["catalog", "list", "--unknown-synthetic-flag"],
  ]) {
    assert.equal(invoke(words, "synthetic", false).code, "validation_error")
  }
  const records = invoke(["catalog", "list", "--limit", "2", "--jsonl"], "synthetic", true, "jsonl")
  assert.deepEqual(
    records.map((record) => record.type),
    ["item", "item", "end"],
  )
  assert.ok(records[0].data.id)
  assert.equal(records.at(-1).complete, true)
  assert.equal(records.at(-1).page.mode, "page")
  assert.equal(records.at(-1).page.next_page, 2)
}
const currentConfig = JSON.parse(readFileSync(configPath, "utf8"))
currentConfig.profiles.synthetic.roots = []
writeFileSync(configPath, JSON.stringify(currentConfig))
assert.equal(invoke(["catalog", "import"]).retired, 3)
assert.equal(invoke(["catalog", "list"], "synthetic", true, "items").items.length, 0)
assert.equal(invoke(["search", "budget", "--exact"]).hits.length, 0)
const kept = await openStore({ path: env.DRIVE_STORE, env })
assert.equal((await kept.notes.note(note.ref)).text, "Synthetic source body")
assert.equal((await kept.notes.note(note.ref)).contentHash, "fixture-hash")
await kept.close()
let mcpCalls = 0
if (contract >= 2) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", guard, join(driveRoot, "dist/bin/drive.js"), "synthetic", "--offline", "--read-only", "mcp"],
    env,
    stderr: "pipe",
  })
  const client = new Client({ name: "synthetic-contract-client", version: "1" })
  const tool = "drive_api_drive_files_get"
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.ok(tools.tools.some((entry) => entry.name === tool))
    if (contract === 3) {
      assert.equal(tools.tools.find((entry) => entry.name === "drive_documents_show").annotations.openWorldHint, false)
      assert.equal(tools.tools.find((entry) => entry.name === tool).annotations.openWorldHint, true)
    }
    for (const [field, args] of [
      ["file-id", { "file-id": 42 }],
      ["unknown-field", { "file-id": "synthetic-file", "unknown-field": "SYNTHETIC_NO_ARGUMENT_LOG" }],
      ["file-id", {}],
    ]) {
      const answer = await client.callTool({ name: tool, arguments: args })
      assert.equal(answer.isError, true)
      v.parse(errorObjectSchema, answer.structuredContent)
      assert.equal(answer.structuredContent.error.code, "validation_error")
      assert.ok(answer.structuredContent.error.message.includes(field))
      assert.equal(JSON.stringify(answer).includes("SYNTHETIC_NO_ARGUMENT_LOG"), false)
      mcpCalls++
    }
  } finally {
    await client.close()
  }
  const audited = await openStore({ path: env.DRIVE_STORE, env })
  try {
    const rows = await audited.agentActions.list({ tool })
    assert.equal(rows.length, mcpCalls)
    assert.ok(rows.every((row) => row.status === "failed" && row.error === "validation_error"))
    assert.equal(JSON.stringify(rows).includes("SYNTHETIC_NO_ARGUMENT_LOG"), false)
  } finally {
    await audited.close()
  }
}
process.stdout.write(
  `${JSON.stringify({
    checks,
    mcp_calls: mcpCalls,
    passed: true,
    data: "synthetic",
    live_google: false,
    node: process.version,
    drive: packageVersion(driveRoot),
    core: packageVersion(coreRoot),
    framework: packageVersion(resolve(require.resolve("@wirecat/cli-base"), "../..")),
    contract,
    effects_expectation: preciseEffects ? "precise" : "legacy",
  })}\n`,
)
