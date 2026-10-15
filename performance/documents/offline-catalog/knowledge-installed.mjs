import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join } from "node:path"

export const verifyKnowledge = async ({ invoke, openStore, env, workspace, reference, release }) => {
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
  const personFilter = release.list_queries ? [`person:${person.uid}`] : ["--person", personRef]
  assert.ok(list(["documents", "list", ...personFilter]).some((doc) => doc.id === "doc"))
  if (release.list_queries) {
    assert.equal(list(["documents", "list", "tag:wirecat-acceptance"])[0].id, "doc")
    assert.equal(list(["documents", "list", "tag:synthetic-missing-tag"]).length, 0)
    const projected = list(["documents", "list", ...personFilter, "--json=id,name,reference,tabs"])
    assert.equal(projected.length, 1)
    assert.deepEqual(projected[0], { id: "doc", name: "Synthetic document", reference, tabs: 2 })
    assert.equal(list(["documents", "list", ...personFilter, "--limit", "1", "--page", "2"]).length, 0)
    assert.equal(invoke(["documents", "list", "--person", personRef], { failure: true }).error.code, "validation_error")
    assert.equal(
      invoke(["documents", "list", "synthetic_unknown:value"], { failure: true }).error.code,
      "validation_error",
    )
    checks.push("document-query-projection-and-removed-filter-refusal")
  }
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
  const scope = (value) => (release.list_queries ? [`scope:${value}`] : ["--scope", value])
  assert.equal(list(["memories", "list", "doc", ...scope("personal")]).length, 0)
  assert.ok(list(["memories", "list", "doc", ...scope("work")]).some((entry) => entry.ref === memory.ref))
  const search = ["memories", "search", "doc", "lifecyclemarker", ...scope("work")]
  const found = release.memory_search === "items" ? list(search) : item(search).items
  assert.ok(found.some((entry) => entry.ref === memory.ref))
  checks.push("memory-scope-and-source-search")
  if (release.list_queries) {
    assert.equal(list(["memories", "list", "doc", "status:proposed"]).length, 0)
    assert.equal(list(["memories", "list", "doc", "scope:work status:confirmed"])[0].ref, memory.ref)
    assert.equal(
      invoke(["memories", "list", "doc", "--scope", "work"], { failure: true }).error.code,
      "validation_error",
    )
    checks.push("memory-query-combination-and-removed-filter-refusal")
  }

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
