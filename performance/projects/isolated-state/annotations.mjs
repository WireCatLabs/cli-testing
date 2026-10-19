import assert from "node:assert/strict"
import { author } from "./fixture.mjs"

const MAX = 8
const linkFields = ({ from, to, kind, role, origin, evidence, provenance, confirmed }) => ({
  from,
  to,
  kind,
  role,
  origin,
  evidence,
  provenance,
  confirmed,
})
const aliasNames = async (store, project) => {
  const catalog = await store.knowledge.vocabulary({ kind: "project", maxEntries: 32, maxReadBytes: 65536 })
  assert.equal(catalog.coverage.complete, true)
  return (
    catalog.entries
      .find((entry) => entry.id === project.id)
      ?.aliases.map((alias) => alias.name)
      .sort() ?? []
  )
}

export async function capture(f) {
  const all = [
    ...(await f.store.notes.links({ from: f.project.ref })),
    ...(await f.store.notes.links({ to: f.project.ref })),
  ]
  const links = [...new Map(all.map((link) => [link.id, link])).values()]
  const facts = await f.store.facts.list({ project: f.project.ref, limit: MAX + 1 })
  const aliases = await aliasNames(f.store, f.project)
  assert.ok(links.length <= MAX && facts.length <= MAX && aliases.length <= MAX, "subset exceeds explicit bounds")
  assert.ok(links.every((link) => link.kind === "related-to" && !link.confirmed && link.origin === "suggested"))
  assert.ok(
    facts.every((fact) => fact.status === "proposed" && fact.author.name === author.bot && fact.model === author.model),
  )
  assert.ok(facts.every((fact) => fact.type === "fact" && fact.supersedes === null && fact.occurredAt === null))
  return {
    schema_version: 1,
    scope: "synthetic-existing-annotation-subset",
    reused: { project: f.project.ref, person: f.personRef, source: f.sourceRef },
    aliases,
    links: links.map(linkFields),
    facts: facts.map(({ type, statement, project, subject, evidence, scope, status }) => ({
      type,
      statement,
      project,
      subject,
      evidence,
      scope,
      status,
      by: author,
    })),
    coverage: { truncated: false, max_per_area: MAX, completeness: "supported-subset-only" },
    excluded: [
      "raw-source-bodies",
      "tasks",
      "findings",
      "tags",
      "memories",
      "history",
      "derived-record-ids",
      "timestamps",
      "ownership-inference",
    ],
  }
}

export async function restore(manifest, target, bindings) {
  assert.equal(manifest.schema_version, 1)
  assert.equal(manifest.coverage.truncated, false)
  const map = (ref) => {
    assert.ok(Object.hasOwn(bindings, ref), "each reference needs an explicit binding")
    return bindings[ref]
  }
  const project = map(manifest.reused.project)
  assert.equal(project, target.project.ref)
  assert.equal(map(manifest.reused.person), target.personRef)
  assert.equal(map(manifest.reused.source), target.sourceRef)
  const current = await capture(target)
  assert.ok(
    !current.aliases.length && !current.links.length && !current.facts.length,
    "restore requires a fresh annotation target",
  )
  const links = manifest.links.map((link) =>
    Object.fromEntries(
      Object.entries({ ...link, from: map(link.from), to: map(link.to) }).filter(([, value]) => value !== null),
    ),
  )
  const facts = manifest.facts.map(({ status, ...fact }) => {
    assert.equal(status, "proposed")
    return { ...fact, project: map(fact.project), subject: map(fact.subject), evidence: fact.evidence.map(map) }
  })
  for (const name of manifest.aliases)
    await target.store.knowledge.addVocabularyAlias({ kind: "project", id: target.project.id }, name)
  for (const link of links) await target.store.notes.addLink(link)
  for (const fact of facts) await target.store.facts.add(fact)
  return {
    reused_entities: 3,
    aliases_restored: manifest.aliases.length,
    links_restored: links.length,
    facts_restored: facts.length,
  }
}

export function logical(manifest) {
  const bindings = new Map(Object.entries(manifest.reused).map(([name, ref]) => [ref, name]))
  return JSON.stringify(
    { aliases: manifest.aliases, links: manifest.links, facts: manifest.facts },
    (_key, value) => bindings.get(value) ?? value,
  )
}
