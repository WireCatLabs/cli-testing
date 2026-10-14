import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join } from "node:path"

export const verifyKnowledge = async ({ invoke, openStore, env, workspace, reference }) => {
  const checks = []
  const item = (words, options) => {
    const answer = invoke(words, options)
    assert.ok(answer.item)
    return answer.item
  }
  const list = (words) => {
    const answer = invoke(words)
    assert.ok(Array.isArray(answer.items))
    return answer.items
  }
  const store = await openStore({ path: env.DRIVE_STORE, env })
  let person
  try {
    const account = { provider: "synthetic-messenger", account: "synthetic-account" }
    await store.saveAccount(account, { name: "Synthetic test account" })
    await store.savePeople(account, [{ id: "synthetic-editor", name: "Rin Example" }])
    person = await store.personOf({ provider: account.provider, id: "synthetic-editor" })
    assert.ok(person)
  } finally {
    await store.close()
  }
  const personRef = `person:${person.uid}`
  item(["relationships", "add", "doc", personRef, "--kind", "related-to"])
  assert.ok(item(["documents", "context", "doc"]).links.some((link) => link.to === personRef))
  assert.ok(list(["documents", "list", "--person", personRef]).some((doc) => doc.id === "doc"))
  checks.push("explicit-person-link-and-filter")

  const note = item(["notes", "add", "doc", "Synthetic lifecycle note"])
  const edited = item(["notes", "edit", "doc", note.ref, "Updated lifecycle note", "--revision", String(note.revision)])
  assert.ok(edited.revision > note.revision)
  const refused = invoke(["notes", "edit", "doc", note.ref, "Stale overwrite", "--revision", String(note.revision)], {
    failure: true,
  })
  assert.ok(refused.error?.code)
  assert.equal(item(["notes", "show", "doc", note.ref]).text, "Updated lifecycle note")
  checks.push("note-edit-refuses-stale-revision")

  const memory = item(["memories", "add", "doc", "Synthetic lifecyclemarker decision", "--scope", "work"])
  assert.equal(memory.subject, reference)
  assert.deepEqual(memory.evidence, [reference])
  assert.equal(memory.status, "proposed")
  assert.equal(memory.scope, "work")
  assert.equal(item(["memories", "confirm", "doc", memory.ref]).status, "confirmed")
  checks.push("memory-evidence-and-review")
  assert.equal(list(["memories", "list", "doc", "--scope", "personal"]).length, 0)
  assert.ok(list(["memories", "list", "doc", "--scope", "work"]).some((entry) => entry.ref === memory.ref))
  const found = item(["memories", "search", "doc", "lifecyclemarker", "--scope", "work"])
  assert.ok(found.items.some((entry) => entry.ref === memory.ref))
  checks.push("memory-scope-and-source-search")

  item(["folders", "remove", "root"])
  // With no selected roots, this sync reconciles local sources; the provider/keyring guard remains installed.
  const reconciled = item(["sync"], { offline: false })
  assert.equal(reconciled.removed, 1)
  assert.equal(reconciled.pending, 0)
  assert.equal(list(["catalog", "list"]).length, 0)
  assert.equal(list(["documents", "list"]).length, 0)
  assert.equal(item(["search", "wirecatbodymarker", "--exact"]).hits.length, 0)
  assert.equal(invoke(["documents", "show", "doc"], { failure: true }).error.code, "not_found")
  assert.equal(existsSync(join(workspace, "state/profiles/synthetic/documents/doc.json")), false)
  checks.push("scope-removal-reconciles-catalog-search-and-snapshot")

  const retained = await openStore({ path: env.DRIVE_STORE, env })
  try {
    assert.equal((await retained.memories.get(memory.ref)).status, "stale")
    assert.equal((await retained.notes.note(note.ref)).text, "Updated lifecycle note")
  } finally {
    await retained.close()
  }
  checks.push("removed-source-stales-memory-and-keeps-owner-note")
  assert.equal(item(["sync"], { offline: false }).removed, 0)
  checks.push("scope-removal-is-idempotent")
  return checks
}
