import assert from "node:assert/strict"

export const now = () => Date.parse("2026-10-19T00:00:00Z")
export const author = { bot: "synthetic-restorer", model: "fixture-only" }

export async function seed(openStore, path, shifted = false) {
  const store = await openStore({ path, env: process.env, now })
  if (shifted) {
    await store.knowledge.addProject({ name: "Offset fixture", key: "OFF" })
    const folder = await store.notes.addFolder({ name: "Offset folder" })
    await store.notes.saveFileNote({ folderId: folder.id, path: "offset.md", title: "Offset", text: "Padding" })
  }
  const project = await store.knowledge.addProject({ name: "Copper Orchard", key: "CPO", scope: "work" })
  const unrelated = await store.knowledge.addProject({ name: "Cobalt Bridge", key: "COB", scope: "work" })
  const key = { provider: "synthetic", account: "fixture" }
  await store.people.savePeople(key, [{ id: "shared-colleague", name: "Rin Example" }])
  const person = await store.people.personOf({ provider: key.provider, id: "shared-colleague" })
  assert.ok(person)
  const personRef = `person:${person.uid}`
  const folder = await store.notes.addFolder({ name: "Synthetic shared sources" })
  const { note } = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "shared.md",
    title: "Shared source",
    text: "SOURCE_BODY_NOT_FOR_EXPORT: Copper Orchard and Cobalt Bridge discuss an optional review.",
    contentHash: "synthetic-source-v1",
  })
  await store.notes.addLink({ from: note.ref, to: unrelated.ref, kind: "related-to", origin: "owner" })
  await store.knowledge.relate(null, { from: unrelated.ref, to: personRef, kind: "related-to", confirmed: true })
  await store.facts.add({
    type: "fact",
    statement: "Unrelated retained annotation",
    by: "owner",
    project: unrelated.ref,
  })
  return { store, project, unrelated, personRef, sourceRef: note.ref }
}

export async function addAnnotations(f) {
  await f.store.knowledge.addVocabularyAlias({ kind: "project", id: f.project.id }, "Copper study")
  await f.store.notes.addLink({
    from: f.project.ref,
    to: f.personRef,
    kind: "related-to",
    origin: "suggested",
    confirmed: false,
    evidence: "Candidate participant; review required",
    provenance: "synthetic-run:manual-v1",
  })
  await f.store.notes.addLink({
    from: f.sourceRef,
    to: f.project.ref,
    kind: "related-to",
    role: "key",
    origin: "suggested",
    confirmed: false,
    evidence: "Candidate reference document",
    provenance: "synthetic-run:manual-v1",
  })
  await f.store.facts.add({
    type: "fact",
    statement: "An optional review was discussed; no decision is established",
    by: author,
    project: f.project.ref,
    subject: f.personRef,
    evidence: [f.sourceRef],
    scope: "work",
  })
}

export async function sharedState(f) {
  return {
    person: await f.store.people.personByUid(f.personRef.slice(7)),
    source: await f.store.notes.note(f.sourceRef),
    unrelated: f.unrelated,
    links: await f.store.notes.links({ to: f.unrelated.ref }),
    relations: await f.store.knowledge.relations(null, f.unrelated.ref),
    facts: await f.store.facts.list({ project: f.unrelated.ref, limit: 2 }),
  }
}
