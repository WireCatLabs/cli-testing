import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [drivePrefix, previousPrefix, output] = process.argv.slice(2)
assert.ok(drivePrefix && previousPrefix && output, "cli.mjs DRIVE_PREFIX PREVIOUS_CORE_PREFIX OUTPUT_JSON")
const app = join(resolve(drivePrefix), "node_modules/@wirecat/drive-cli")
const current = createRequire(join(app, "package.json"))
const previous = createRequire(join(resolve(previousPrefix), "package.json"))
const { openStore } = await import(pathToFileURL(previous.resolve("@wirecat/cli-core/store")))
const sdk = createRequire(current.resolve("@wirecat/cli-core/store"))
for (const dependency of ["@wirecat/cli-base", "commander"])
  assert.equal(sdk.resolve(dependency), current.resolve(dependency), `one physical ${dependency} in the consumer`)
const packageJson = JSON.parse(readFileSync(join(app, "package.json"), "utf8"))
const root = mkdtempSync(join(tmpdir(), "drive-transfer-cli-"))
const sourcePath = join(root, "previous.db"),
  destination = join(root, "selected.db")
const profile = "synthetic",
  principal = "synthetic-principal",
  id = "SyntheticDoc_ABc"
const profileDir = join(root, "state/profiles", profile)
const configDir = join(root, "config")
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NO_COLOR: "1",
  NODE_OPTIONS: "",
  DRIVE_CONFIG_DIR: configDir,
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  MESSAGING_STORE: destination,
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  NPM_CONFIG_USERCONFIG: "/dev/null",
}
mkdirSync(join(profileDir, "documents"), { recursive: true, mode: 0o700 })
mkdirSync(configDir, { recursive: true, mode: 0o700 })
const text = "Synthetic archived budget evidence"
const hash = createHash("sha256").update(text).digest("hex")
const metadata = {
  id,
  name: "Synthetic source",
  mime: "application/vnd.google-apps.document",
  parents: [],
  url: `https://docs.google.com/document/d/${id}/edit`,
  trashed: false,
  canDownload: true,
}
const source = await openStore({ path: sourcePath, env })
let reference
try {
  const folder = await source.notes.addFolder({ name: `google-drive:${principal}` })
  const { note } = await source.notes.saveFileNote({
    folderId: folder.id,
    path: `${id}.md`,
    title: metadata.name,
    text,
    contentHash: hash,
    frontMatter: { source: "google-drive", fileId: id, sourceUrl: metadata.url, owners: [], tabs: [] },
  })
  reference = note.ref
  await source.knowledge.addTags(null, { type: "document", id: note.id }, ["retained-tag"])
  await source.notes.addNote({ text: "Synthetic retained owner memo", about: [note.ref] })
} finally {
  await source.close()
}
writeFileSync(
  join(configDir, "config.json"),
  JSON.stringify({ profiles: { [profile]: { principal, roots: [], storage: "keyring" } } }),
  { mode: 0o600 },
)
writeFileSync(
  join(profileDir, "state.json"),
  JSON.stringify({
    version: 1,
    store: sourcePath,
    principal,
    scope: "synthetic-scope",
    cursor: "synthetic-cursor",
    linkedThrough: "2026-01-01T00:00:00Z",
    folders: {},
    documents: { [id]: { metadata, hash, reference, tabs: 0, picture: "saved" } },
    skipped: [],
  }),
  { mode: 0o600 },
)
writeFileSync(
  join(profileDir, "documents", `${id}.json`),
  JSON.stringify({ metadata, text, markdown: text, tabs: [] }),
  { mode: 0o600 },
)
const oldTarget = await openStore({ path: destination, env })
try {
  const folder = await oldTarget.notes.addFolder({ name: "synthetic-box:other" })
  const { note } = await oldTarget.notes.saveFileNote({
    folderId: folder.id,
    path: "other.md",
    title: "Other",
    text: "Keep unrelated evidence",
  })
  const sourceHash = createHash("sha256").update(readFileSync(sourcePath)).digest("hex")
  const originalCheckpoint = readFileSync(join(profileDir, "state.json"))
  const checks = []
  const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url))
  const bin = join(app, "dist/bin/drive.js")
  const run = (args, expected = 0, scoped = true) =>
    new Promise((resolveResult, reject) => {
      const words = [...(scoped ? [profile] : []), ...args, "--offline", "--json"]
      const child = spawn(process.execPath, ["--import", guard, bin, ...words], {
        env,
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      })
      let stdout = "",
        stderr = ""
      const timer = setTimeout(() => {
        child.kill("SIGTERM")
        reject(new Error("synthetic command deadline"))
      }, 30000)
      child.stdout.on("data", (chunk) => {
        stdout += chunk
      })
      child.stderr.on("data", (chunk) => {
        stderr += chunk
      })
      child.on("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        try {
          assert.equal(code, expected, `${args.slice(0, 2).join(" ")}: ${stderr.slice(0, 500)}`)
          const result = JSON.parse(expected === 0 ? stdout : stderr)
          if (expected === 0) assert.equal(result.meta.complete, true)
          else assert.equal(stdout, "")
          checks.push({ command: args.slice(0, 2).join(" "), exit: code })
          resolveResult(result)
        } catch (error) {
          reject(error)
        }
      })
    })
  assert.equal((await run(["status"])).item.store.checkpoint, sourcePath)
  const preview = await run(["store", "check", sourcePath])
  assert.equal(preview.item.ready, true)
  assert.ok(readFileSync(join(profileDir, "state.json")).equals(originalCheckpoint))
  assert.equal(
    (await run(["store", "import", sourcePath, "--fingerprint", preview.item.fingerprint, "--read-only"], 5)).error
      .code,
    "permission_error",
  )
  assert.equal((await run(["store", "check", sourcePath], 2, false)).error.code, "validation_error")
  assert.equal(
    (await run(["store", "import", sourcePath, "--fingerprint", "0".repeat(64)], 2)).error.code,
    "validation_error",
  )
  const receipt = await run(["store", "import", sourcePath, "--fingerprint", preview.item.fingerprint])
  assert.equal(receipt.item.checkpoint_updated, true)
  assert.equal(receipt.item.source_retained, true)
  assert.equal(receipt.item.documents[0].external_id, `${id}.md`)
  assert.notEqual(receipt.item.documents[0].reference, note.ref)
  const state = JSON.parse(readFileSync(join(profileDir, "state.json"), "utf8"))
  assert.equal(state.store, destination)
  assert.equal(state.cursor, "synthetic-cursor")
  assert.equal(state.linkedThrough, undefined)
  assert.equal(state.documents[id].picture, undefined)
  assert.equal((await run(["documents", "show", id])).item.text, text)
  assert.deepEqual((await run(["tags", "list", id])).item.tags, ["retained-tag"])
  const hits = (await run(["search", "tag:retained-tag", "--exact"])).item.hits
  assert.equal(hits.length, 1)
  assert.equal(hits[0].source_url, metadata.url)
  assert.equal((await run(["documents", "context", id])).item.notes.items[0].text, "Synthetic retained owner memo")
  assert.equal((await run(["status"])).item.store.checkpoint, destination)
  const again = await run(["store", "check", sourcePath])
  assert.equal(again.item.already_transferred, true)
  await run(["store", "import", sourcePath, "--fingerprint", again.item.fingerprint])
  assert.equal((await run(["notes", "list", id])).items.length, 1)
  assert.equal((await oldTarget.notes.note(note.ref)).text, "Keep unrelated evidence")
  assert.equal(createHash("sha256").update(readFileSync(sourcePath)).digest("hex"), sourceHash)
  const coreRoot = resolve(dirname(current.resolve("@wirecat/cli-core/store")), "../..")
  const core = JSON.parse(readFileSync(join(coreRoot, "package.json"), "utf8"))
  const lock = JSON.parse(readFileSync(join(resolve(drivePrefix), "package-lock.json"), "utf8"))
  const installed = lock.packages["node_modules/@wirecat/drive-cli"]
  writeFileSync(
    resolve(output),
    `${JSON.stringify({ status: "passed", date: new Date().toISOString(), runtime: process.version, drive: packageJson.version, core: core.version, artifact: installed.resolved?.startsWith("https://registry.npmjs.org/") ? "registry" : "packed source candidate", integrity: installed.integrity, bin_sha256: createHash("sha256").update(readFileSync(bin)).digest("hex"), one_physical_base: true, one_physical_commander: true, checks }, null, 2)}\n`,
  )
  process.stdout.write(`${checks.length} guarded CLI transfer invocations passed\n`)
} finally {
  await oldTarget.close()
}
