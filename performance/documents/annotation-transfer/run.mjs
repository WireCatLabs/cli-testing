import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import "../drive-shared-store/guard.mjs"

const [sourcePrefix, targetPrefix, output] = process.argv.slice(2)
assert.ok(sourcePrefix && targetPrefix && output, "run.mjs SOURCE_SDK_PREFIX TARGET_SDK_PREFIX OUTPUT_JSON")
const artifact = async (prefix) => {
  const root = resolve(prefix),
    require = createRequire(join(root, "package.json"))
  const entry = require.resolve("@wirecat/cli-core/store")
  const pkg = JSON.parse(readFileSync(join(root, "node_modules/@wirecat/cli-core/package.json"), "utf8"))
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
  const installed = lock.packages["node_modules/@wirecat/cli-core"]
  const api = await import(pathToFileURL(entry))
  const coreRequire = createRequire(join(root, "node_modules/@wirecat/cli-core/package.json"))
  assert.equal(
    coreRequire.resolve("@wirecat/cli-base"),
    require.resolve("@wirecat/cli-base"),
    "one physical Base per SDK installation",
  )
  const base = JSON.parse(readFileSync(join(root, "node_modules/@wirecat/cli-base/package.json"), "utf8"))
  return {
    api,
    metadata: {
      version: pkg.version,
      base_version: base.version,
      schema: api.MIGRATIONS.at(-1).version,
      type: installed.resolved?.startsWith("https://registry.npmjs.org/") ? "registry" : "packed source candidate",
      integrity: installed.integrity,
      store_entry_sha256: createHash("sha256").update(readFileSync(entry)).digest("hex"),
    },
  }
}
const previous = await artifact(sourcePrefix),
  current = await artifact(targetPrefix)
assert.equal(typeof current.api.previewDocumentTransfer, "function")
assert.equal(typeof current.api.applyDocumentTransfer, "function")
const root = mkdtempSync(join(tmpdir(), "document-transfer-sdk-"))
const source = join(root, "source.db"),
  destination = join(root, "destination.db")
const env = {
  HOME: root,
  MESSAGING_STORE: destination,
  WIRECAT_STATE_DIR: join(root, "state"),
  NPM_CONFIG_USERCONFIG: "/dev/null",
}
const collection = "synthetic-documents:one"
const options = { source, destination, collection, env }
const checks = [],
  handles = []
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const open = async (api, path) => {
  const store = await api.openStore({ path, env })
  handles.push(store)
  return store
}
const check = (name) => checks.push({ name, status: "passed" })
try {
  const old = await previous.api.openStore({ path: source, env })
  const folder = await old.notes.addFolder({ name: collection })
  const { note: doc } = await old.notes.saveFileNote({
    folderId: folder.id,
    path: "same.md",
    title: "Synthetic evidence",
    text: "Original synthetic budget evidence",
    contentHash: "synthetic-hash",
  })
  const annotation = await old.notes.addNote({ text: "Owner review", about: [doc.ref] })
  await old.knowledge.addTags(null, { type: "document", id: doc.id }, ["transfer-proof"])
  const tag = (await old.knowledge.vocabulary()).entries.find((item) => item.name === "transfer-proof")
  assert.ok(tag)
  await old.knowledge.addVocabularyAlias({ kind: "tag", id: tag.id }, "budget-alias")
  const memory = await old.memories.add({
    kind: "summary",
    body: "Proposed synthetic summary",
    scope: "work",
    subject: doc.ref,
    evidence: [doc.ref, annotation.ref],
    author: { bot: "synthetic-agent", model: "synthetic-model" },
  })
  const decision = await old.facts.add({
    type: "decision",
    statement: "Accepted synthetic budget",
    by: "owner",
    subject: doc.ref,
    evidence: [doc.ref],
  })
  const project = await old.knowledge.addProject({ name: "Synthetic source project" })
  await old.notes.addLink({ from: project.ref, to: doc.ref, kind: "links-to", origin: "owner" })
  const key = { provider: "synthetic-documents", account: "one" }
  await old.accounts.saveAccount(key, { name: "Synthetic provider" })
  await old.people.savePeople(key, [{ id: "editor-42", name: "Alex Example" }])
  const editor = await old.people.personOf({ provider: key.provider, id: "editor-42" })
  await old.notes.addLink({
    from: doc.ref,
    to: `person:${editor.uid}`,
    kind: "links-to",
    role: "last-editor",
    origin: "file",
  })
  await old.close()
  const original = hash(source)
  check("previous-registry-sdk-creates-source")

  const target = await open(current.api, destination)
  const other = await target.notes.addFolder({ name: "synthetic-box:two" })
  const { note: collision } = await target.notes.saveFileNote({
    folderId: other.id,
    path: "same.md",
    title: "Synthetic evidence",
    text: "Keep the other provider's evidence",
  })
  const untouched = await target.notes.addNote({ text: "Keep this unrelated note", about: [collision.ref] })
  const wrongProject = await target.knowledge.addProject({ name: "Unrelated project with colliding row id" })
  assert.equal(wrongProject.ref, project.ref)
  const selected = await target.knowledge.addProject({ name: "Explicit destination project" })
  const otherKey = { provider: "synthetic-box", account: "two" }
  await target.accounts.saveAccount(otherKey, { name: "Other provider" })
  await target.people.savePeople(otherKey, [{ id: "other-99", name: "Alex Example" }])
  const sameName = await target.people.personOf({ provider: otherKey.provider, id: "other-99" })
  const blocked = await current.api.previewDocumentTransfer(options)
  assert.equal(blocked.ready, false)
  assert.deepEqual(blocked.missing_bindings, [project.ref])
  await assert.rejects(current.api.applyDocumentTransfer({ ...options, expected_fingerprint: blocked.fingerprint }), {
    code: "configuration_error",
  })
  check("unresolved-incoming-link-refuses-without-guessing")

  const bound = { ...options, bindings: { [project.ref]: selected.ref } }
  const preview = await current.api.previewDocumentTransfer(bound)
  assert.equal(preview.ready, true)
  assert.equal(preview.counts.people, 1)
  assert.equal(hash(source), original)
  const db = await current.api.openCache(destination)
  handles.push(db)
  const counts = () =>
    Object.fromEntries(
      ["documents", "notes", "memories", "facts", "links", "taggings", "persons", "document_annotation_transfers"].map(
        (table) => [table, Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)],
      ),
    )
  const before = counts()
  db.exec(
    "CREATE TRIGGER synthetic_transfer_stop BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'synthetic stop'); END",
  )
  await assert.rejects(
    current.api.applyDocumentTransfer({ ...bound, expected_fingerprint: preview.fingerprint }),
    /synthetic stop/,
  )
  assert.deepEqual(counts(), before)
  db.exec("DROP TRIGGER synthetic_transfer_stop")
  check("interrupted-copy-rolls-back-every-new-record")

  const refreshed = await current.api.previewDocumentTransfer(bound)
  const receipt = await current.api.applyDocumentTransfer({ ...bound, expected_fingerprint: refreshed.fingerprint })
  const reference = receipt.documents["same.md"]
  assert.notEqual(reference, collision.ref)
  assert.notEqual(receipt.references[annotation.ref], untouched.ref)
  assert.equal((await target.notes.note(reference)).text, "Original synthetic budget evidence")
  assert.equal((await target.notes.note(receipt.references[annotation.ref])).text, "Owner review")
  assert.equal((await target.notes.note(collision.ref)).text, "Keep the other provider's evidence")
  assert.deepEqual(await target.knowledge.tags(null, { type: "document", id: reference.split(":")[1] }), [
    "transfer-proof",
  ])
  assert.ok(
    (await target.knowledge.resolveVocabulary("budget-alias")).matches.some((item) => item.name === "transfer-proof"),
  )
  check("copy-retains-text-notes-tags-aliases-and-unrelated-data")

  const importedMemory = await target.memories.get(receipt.references[memory.ref])
  assert.equal(importedMemory.status, "proposed")
  assert.equal(importedMemory.scope, "work")
  assert.equal(importedMemory.author.name, "synthetic-agent")
  assert.deepEqual(importedMemory.evidence, [reference, receipt.references[annotation.ref]])
  assert.equal((await target.facts.get(receipt.references[decision.ref])).status, "accepted")
  assert.ok((await target.notes.links({ to: reference })).some((link) => link.from === selected.ref))
  assert.equal((await target.notes.links({ from: wrongProject.ref })).length, 0)
  const importedEditor = await target.people.personOf({ provider: key.provider, id: "editor-42" })
  assert.notEqual(importedEditor.uid, sameName.uid)
  assert.ok(
    (await target.notes.links({ from: reference })).some(
      (link) => link.to === `person:${importedEditor.uid}` && link.role === "last-editor",
    ),
  )
  check("memory-status-evidence-and-editor-identities-retain-meaning")
  assert.equal(hash(source), original)
  check("previous-source-bytes-remain-unchanged")

  const olderWriter = await open(previous.api, destination)
  await olderWriter.notes.addNote({ text: "Written by the older reader after the transfer", about: [reference] })
  assert.equal((await target.notes.notes({ source: "internal", about: reference })).items.length, 2)
  check("previous-sdk-writes-newer-destination-without-losing-annotations")
  const completedCounts = counts()
  const again = await current.api.previewDocumentTransfer(bound)
  assert.equal(again.already_transferred, true)
  const replayed = await current.api.applyDocumentTransfer({ ...bound, expected_fingerprint: again.fingerprint })
  assert.deepEqual(replayed.references, receipt.references)
  assert.deepEqual(counts(), completedCounts)
  check("completed-copy-replay-preserves-subsequent-destination-writes")

  const changedSource = await open(previous.api, source)
  await changedSource.notes.addNote({ text: "Later original annotation", about: [doc.ref] })
  const changed = await current.api.previewDocumentTransfer(bound)
  assert.equal(changed.ready, false)
  await assert.rejects(current.api.applyDocumentTransfer({ ...bound, expected_fingerprint: changed.fingerprint }), {
    code: "configuration_error",
  })
  assert.deepEqual(counts(), completedCounts)
  assert.equal((await changedSource.notes.notes({ source: "internal", about: doc.ref })).items.length, 2)
  check("changed-completed-source-refuses-with-both-copies-retained")
  writeFileSync(
    resolve(output),
    `${JSON.stringify({ status: "passed", date: new Date().toISOString(), runtime: process.version, source: previous.metadata, target: current.metadata, fixture: { documents: 2, providers: 2, owner_data: false, network: false }, checks }, null, 2)}\n`,
  )
  process.stdout.write(`${checks.length} packaged SDK transfer checks passed\n`)
} finally {
  for (const handle of handles.reverse()) await handle.close()
}
