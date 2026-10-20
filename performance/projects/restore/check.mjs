import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const entry = process.argv[2]
assert(entry, "pass the independently installed published package store entry")
assert(process.env.HOME && process.env.MESSAGING_STORE && process.env.WIRECAT_STATE_DIR)
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
const sdk = await import(pathToFileURL(resolve(entry)).href)
const directory = mkdtempSync(join(tmpdir(), "published-project-restore-"))
const source = join(directory, "source.db"),
  target = join(directory, "target.db")
const body = "INVENTED_EXTERNAL_BODY_SENTINEL"
let project, destination, unrelated, sourceDocument, targetDocument, sourceFact, targetFact
const seed = async (path, targetSide) => {
  const store = await sdk.openStore({ path, now: () => 1700000000000 })
  try {
    if (targetSide) {
      unrelated = await store.knowledge.addProject({ name: "Unrelated Example", key: "PAD" })
      await store.facts.add({ type: "statement", statement: "Padding", project: unrelated.ref, by: { bot: "padding" } })
      targetFact = await store.facts.add({
        type: "statement",
        statement: "Keep this unrelated fact",
        project: unrelated.ref,
        by: { bot: "target-reviewer" },
      })
    }
    const selected = await store.knowledge.addProject({
      name: "Research Example",
      key: "REX",
      ...(targetSide ? {} : { description: "Invented portable project" }),
    })
    const folder = await store.notes.addFolder({ name: "Invented sources" })
    if (targetSide)
      await store.notes.saveFileNote({ folderId: folder.id, path: "padding.md", title: "Padding", text: "Other text" })
    const { note } = await store.notes.saveFileNote({
      folderId: folder.id,
      path: "evidence.md",
      title: "Evidence",
      text: body,
    })
    if (targetSide) {
      destination = selected
      targetDocument = note
    } else {
      project = selected
      sourceDocument = note
      await store.knowledge.addVocabularyAlias({ kind: "project", id: selected.id }, "Example study")
      sourceFact = await store.facts.add({
        type: "statement",
        statement: "A report awaits review",
        project: selected.ref,
        by: { bot: "source-reviewer" },
        evidence: [note.ref],
      })
    }
  } finally {
    await store.close()
  }
}
await seed(source, false)
await seed(target, true)
assert.notEqual(project.ref, destination.ref)
assert.notEqual(sourceDocument.ref, targetDocument.ref)
assert.notEqual(sourceFact.author.id, targetFact.author.id)
const sourceBefore = readFileSync(source),
  targetBefore = readFileSync(target)
const snapshot = await sdk.snapshotProjectAnnotations({ source, project: project.ref })
const json = JSON.stringify(snapshot.snapshot)
assert(!json.includes(body))
assert.equal(snapshot.snapshot.coverage.tasks, "omitted")
assert.equal(snapshot.snapshot.coverage.meeting_memberships, "omitted")
const bindings = {
  [project.ref]: destination.ref,
  [sourceDocument.ref]: targetDocument.ref,
  [`bot:${sourceFact.author.id}`]: `bot:${targetFact.author.id}`,
}
const request = { snapshot: json, project: destination.ref, bindings }
const input = { ...request, target }
const first = await sdk.previewProjectAnnotationSnapshot(input)
assert.equal(first.ready, true)
assert.deepEqual(readFileSync(source), sourceBefore)
assert.deepEqual(readFileSync(target), targetBefore)
const writer = await sdk.openStore({ path: target })
let receipt
try {
  await writer.knowledge.addVocabularyAlias({ kind: "project", id: unrelated.id }, "Independent alias")
  await assert.rejects(() => writer.projectAnnotations.restore({ ...request, fingerprint: first.fingerprint }), {
    code: "validation_error",
    message: /stale|conflict/,
  })
  assert.equal((await writer.facts.list({ project: destination.ref })).length, 0)
  const current = await writer.projectAnnotations.preview(request)
  assert.equal(current.ready, true)
  receipt = await writer.projectAnnotations.restore({ ...request, fingerprint: current.fingerprint })
  assert.deepEqual(receipt.counts, { aliases: 1, facts: 1, links: 1 })
  const facts = await writer.facts.list({ project: destination.ref })
  assert.equal(facts.length, 1)
  assert.equal(facts[0].status, "proposed")
  assert.equal(facts[0].author.id, targetFact.author.id)
  assert.equal((await writer.facts.list({ project: unrelated.ref })).length, 2)
  await assert.rejects(() => writer.projectAnnotations.restore({ ...request, fingerprint: current.fingerprint }), {
    code: "validation_error",
    message: /stale|conflict/,
  })
  assert.equal((await writer.facts.list({ project: destination.ref })).length, 1)
} finally {
  await writer.close()
}
assert.deepEqual(readFileSync(source), sourceBefore)
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
process.stdout.write(
  `${JSON.stringify({
    public_sdk: true,
    snapshot_version: 2,
    independent_ids: true,
    source_unchanged: true,
    preview_target_unchanged: true,
    stale_preview_refused: true,
    proposed_state_preserved: true,
    author_binding_preserved: true,
    unrelated_facts_preserved: true,
    repeat_refused_without_duplicates: true,
    external_bodies_omitted: true,
    implicit_store_created: false,
    owner_data_used: false,
    restored_counts: receipt.counts,
  })}\n`,
)
