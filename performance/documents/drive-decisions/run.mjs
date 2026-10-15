import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [input] = process.argv.slice(2)
assert.ok(input && process.argv.length === 3, "supply the installed Drive package directory")
const pkg = resolve(input)
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
assert.equal(metadata.name, "@wirecat/drive-cli")
assert.equal(metadata.version, "0.13.0")
assert.equal(metadata.dependencies["@wirecat/cli-core"], "0.294.0")
assert.equal(metadata.dependencies["@wirecat/cli-base"], "0.35.0")
const require = createRequire(join(pkg, "package.json"))
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const root = mkdtempSync("/var/tmp/drive-decisions-")
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NPM_CONFIG_USERCONFIG: "/dev/null",
  NO_COLOR: "1",
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
  DRIVE_TEST_PACKAGE: pkg,
}
mkdirSync(env.DRIVE_CONFIG_DIR)
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({
    profiles: {
      synthetic: { principal: "synthetic-principal", roots: ["root"], storage: "keyring" },
      other: { principal: "other-principal", roots: ["root"], storage: "keyring" },
    },
  }),
  { mode: 0o600 },
)
const store = await openStore({ path: env.DRIVE_STORE, env })
const folder = await store.notes.addFolder({ name: "google-drive:synthetic-principal" })
const documents = {}
for (const id of ["doc", "other-doc"]) {
  const { note } = await store.notes.saveFileNote({
    folderId: folder.id,
    path: `${id}.md`,
    title: id,
    text: "A synthetic budget decision",
    contentHash: "synthetic-hash",
  })
  documents[id] = {
    metadata: {
      id,
      name: id,
      parents: ["root"],
      mime: "application/vnd.google-apps.document",
      url: `https://example.invalid/${id}`,
      trashed: false,
      canDownload: true,
    },
    hash: "synthetic-hash",
    reference: note.ref,
    tabs: 0,
  }
}
const initial = await store.facts.add({
  type: "decision",
  statement: "Use the April budget",
  by: "owner",
  subject: documents.doc.reference,
  evidence: [documents.doc.reference],
})
const proposal = await store.facts.add({
  type: "decision",
  statement: "Use the May budget",
  by: { bot: "synthetic-agent", model: "synthetic-model" },
  supersedes: initial.ref,
  subject: documents.doc.reference,
  evidence: [documents.doc.reference],
})
await store.close()
const state = { version: 1, principal: "synthetic-principal", scope: "", folders: {}, documents, skipped: [] }
const statePath = join(env.DRIVE_STATE_DIR, "profiles/synthetic")
mkdirSync(statePath, { recursive: true })
writeFileSync(join(statePath, "state.json"), JSON.stringify(state))
mkdirSync(join(statePath, "documents"))
for (const [id, doc] of Object.entries(documents))
  writeFileSync(
    join(statePath, `documents/${id}.json`),
    JSON.stringify({
      metadata: doc.metadata,
      text: "A synthetic budget decision",
      markdown: "A synthetic budget decision",
      tabs: [],
    }),
  )
const otherPath = join(env.DRIVE_STATE_DIR, "profiles/other")
mkdirSync(join(otherPath, "documents"), { recursive: true })
writeFileSync(join(otherPath, "state.json"), JSON.stringify({ ...state, principal: "other-principal" }))
for (const [id, doc] of Object.entries(documents))
  writeFileSync(
    join(otherPath, `documents/${id}.json`),
    JSON.stringify({
      metadata: doc.metadata,
      text: "A synthetic budget decision",
      markdown: "A synthetic budget decision",
      tabs: [],
    }),
  )
const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url))
let commands = 0
const checks = []
const call = (words, { profile = "synthetic", exit = 0, error } = {}) => {
  const result = spawnSync(
    process.execPath,
    ["--import", guard, join(pkg, "dist/bin/drive.js"), profile, "--json", ...words],
    { env, encoding: "utf8", timeout: 30000 },
  )
  assert.equal(result.error, undefined)
  assert.equal(result.status, exit, `CLI exit differs for ${words.slice(0, 2).join(" ")}: ${result.stderr}`)
  const answer = JSON.parse(result.stdout.trim() || result.stderr.trim())
  if (error) assert.equal(answer.error.code, error)
  commands++
  return answer.item ?? answer
}
const show = (ref) => call(["facts", "show", "doc", ref])
assert.equal(show(initial.ref).status, "accepted")
assert.equal(show(proposal.ref).status, "proposed")
call(["facts", "reverse", "doc", proposal.ref], { exit: 2, error: "validation_error" })
assert.equal(show(initial.ref).status, "accepted")
checks.push("proposal leaves earlier decision accepted")
assert.equal(call(["facts", "confirm", "doc", proposal.ref]).status, "accepted")
assert.equal(show(initial.ref).status, "superseded")
checks.push("confirm supersedes earlier decision")
const replacement = call([
  "facts",
  "add",
  "doc",
  "Pause the budget",
  "--type",
  "decision",
  "--supersedes",
  proposal.ref,
  "--occurred-time",
  "2026-05-01T12:00:00Z",
])
assert.equal(replacement.status, "accepted")
assert.equal(replacement.supersedes, proposal.ref)
assert.equal(replacement.occurred_at, "2026-05-01T12:00:00.000Z")
assert.equal(show(proposal.ref).status, "superseded")
checks.push("owner replacement and event time survive executable round trip")
for (const [doc, profile] of [
  ["other-doc", "synthetic"],
  ["doc", "other"],
]) {
  call(["facts", "reverse", doc, replacement.ref], { profile, exit: 6, error: "not_found" })
  call(["facts", "add", doc, "Wrong source", "--type", "decision", "--supersedes", replacement.ref], {
    profile,
    exit: 6,
    error: "not_found",
  })
}
assert.equal(show(replacement.ref).status, "accepted")
assert.deepEqual(call(["facts", "list", "other-doc"]).items, [])
checks.push("wrong document and account cannot reverse or replace")
assert.deepEqual(call(["--dry-run", "facts", "reverse", "doc", replacement.ref]).effects, {
  remote: "none",
  local: "write",
})
call(["--read-only", "facts", "reverse", "doc", replacement.ref], { exit: 5, error: "permission_error" })
assert.equal(show(replacement.ref).status, "accepted")
assert.equal(call(["--offline", "facts", "reverse", "doc", replacement.ref]).status, "reversed")
assert.equal(show(replacement.ref).status, "reversed")
checks.push("dry-run and readonly preserve decision; offline reversal persists")
const ordinary = call(["facts", "add", "doc", "Budget discussed"])
call(["facts", "reverse", "doc", ordinary.ref], { exit: 2, error: "validation_error" })
assert.equal(show(ordinary.ref).status, "accepted")
assert.equal(call(["facts", "list", "doc", "kind:decision"]).items.length, 3)
call(["facts", "reverse", "doc", replacement.ref, "--unknown"], { exit: 2, error: "validation_error" })
checks.push("nondecisions and unknown arguments refused; history retained")
process.stdout.write(
  `${JSON.stringify(
    {
      version: metadata.version,
      dependencies: metadata.dependencies,
      node: process.version,
      commands,
      checks,
      guards: "child network/browser/keyring denied",
      package_manifest_sha256: createHash("sha256")
        .update(readFileSync(join(pkg, "package.json")))
        .digest("hex"),
      limitations: "synthetic local decisions only; no live Google writes, AI calls or model accuracy measurement",
    },
    null,
    2,
  )}\n`,
)
