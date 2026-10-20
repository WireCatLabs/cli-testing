import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Run with temporary HOME/MESSAGING_STORE/WIRECAT_STATE_DIR; never accepts an existing store.
const entry = process.argv[2]
assert(entry, "pass the built published package store entry")
assert(process.env.MESSAGING_STORE && process.env.HOME && process.env.WIRECAT_STATE_DIR)
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
const sdk = await import(pathToFileURL(resolve(entry)).href)
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
const dir = mkdtempSync(join(tmpdir(), "published-project-snapshot-"))
const source = join(dir, "source.db")
assert.equal(existsSync(source), false)
const store = await sdk.openStore({ path: source, now: () => 1700000000000 })
let project
try {
  project = await store.knowledge.addProject({
    name: "Research Example",
    key: "REX",
    description: "Invented SDK check",
  })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Example study")
  const folder = await store.notes.addFolder({ name: "Invented sources" })
  const { note: doc } = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "source.md",
    title: "Example evidence",
    text: "INVENTED_SOURCE_BODY_SENTINEL",
  })
  await store.facts.add({
    type: "statement",
    statement: "An invented report awaits review",
    project: project.ref,
    by: { bot: "synthetic-sdk-reviewer" },
    evidence: [doc.ref],
  })
} finally {
  await store.close()
}
const first = await sdk.snapshotProjectAnnotations({ source, project: project.ref })
const second = await sdk.snapshotProjectAnnotations({ source, project: project.ref })
assert.equal(first.snapshot.version, 2)
assert.equal(first.snapshot.project.description, "Invented SDK check")
assert.equal(first.snapshot.aliases[0].name, "Example study")
assert.equal(first.snapshot.aliases[0].source, "owner")
assert.equal(first.snapshot.facts.length, 1)
assert.equal(first.snapshot.facts[0].status, "proposed")
assert.equal(first.snapshot.facts[0].confirmed_by, null)
assert.equal(first.fingerprint, second.fingerprint)
assert.equal(first.snapshot.coverage.notes, "omitted")
assert.equal(first.snapshot.coverage.meeting_memberships, "omitted")
const json = JSON.stringify(first.snapshot)
assert(!json.includes("INVENTED_SOURCE_BODY_SENTINEL"))
assert(!json.includes(dir))
assert.deepEqual(sdk.decodeProjectAnnotationSnapshot(json), first.snapshot)
assert.equal(sdk.projectAnnotationSnapshotFingerprint(json), first.fingerprint)
assert.throws(() => sdk.decodeProjectAnnotationSnapshot(JSON.stringify({ ...first.snapshot, unexpected: true })), {
  code: "validation_error",
})
await assert.rejects(() => sdk.snapshotProjectAnnotations({ source: join(dir, "absent.db"), project: project.ref }), {
  code: "not_found",
})
assert.equal(existsSync(join(dir, "absent.db")), false)
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
process.stdout.write(
  `${JSON.stringify({
    public_sdk: true,
    snapshot_version: 2,
    stable_repeat: true,
    proposed_state_preserved: true,
    alias_provenance_preserved: true,
    external_bodies_omitted: true,
    unknown_field_refused: true,
    missing_store_not_created: true,
    implicit_store_created: false,
    owner_data_used: false,
  })}\n`,
)
