import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { releaseOf } from "./live-input.mjs"

const tag = "wirecat-acceptance"
const note = "Synthetic acceptance note; preserve across rename and resync."
const same = (left, right) => assert.deepEqual([...left].sort(), [...right].sort())
const annotated = (context) =>
  context.tags.some((entry) => entry.tag === tag) && context.notes.items.some((entry) => entry.text === note)

export const checkFixture = ({ manifest, invoke, workspace, refresh = false, annotate = false, baseline }) => {
  const release = releaseOf(manifest.drive_version)
  const checks = []
  const check = (name, fn) => {
    fn()
    checks.push(name)
  }
  const list = (words) => {
    const value = invoke(words)
    assert.ok(Array.isArray(value.items))
    return value.items
  }
  const item = (words, offline = true) => {
    const value = invoke(words, offline)
    assert.ok(value.item && typeof value.item === "object")
    return value.item
  }
  check("selected-root", () =>
    same(
      list(["folders", "list"]).map((entry) => entry.id),
      [manifest.folder_id],
    ),
  )
  if (refresh) {
    item(["sync"], false)
    check("sync-drained", () => assert.equal(item(["status"]).pending, 0))
  }
  const imported = list(["documents", "list"])
  check("scope-and-unique-identities", () => {
    same(
      imported.map((entry) => entry.id),
      manifest.documents.map((entry) => entry.id),
    )
    assert.equal(new Set(imported.map((entry) => entry.reference)).size, imported.length)
    assert.equal(item(["status"]).pending, 0)
  })
  const references = []
  for (const entry of [...manifest.folders, ...manifest.documents]) {
    const metadata = item(["catalog", "show", entry.id])
    check("catalog-identity-and-parents", () => {
      assert.equal(metadata.id, entry.id)
      if (entry.parents) same(metadata.parents, entry.parents)
      if (entry.name !== undefined) assert.equal(metadata.name, entry.name)
      const prior = baseline?.references.find((old) => old.id === entry.id)
      if (prior) assert.equal(metadata.ref, prior.ref, "source reference changed")
    })
    references.push({ id: entry.id, ref: metadata.ref })
  }
  const exports = mkdtempSync(join(workspace, "exports-"))
  for (const [index, entry] of manifest.documents.entries()) {
    const document = imported.find((current) => current.id === entry.id)
    const snapshot = item(["documents", "show", entry.id])
    check("cached-text-and-tabs", () => {
      assert.equal(snapshot.metadata.id, entry.id)
      assert.ok(snapshot.tabs.length >= (entry.min_tabs ?? 0))
      for (const text of entry.markers) assert.ok(snapshot.text.includes(text))
      for (const text of entry.absent_markers ?? []) assert.ok(!snapshot.text.includes(text))
    })
    for (const text of entry.markers) {
      const search = item(["search", text, "--exact", "--limit", "100"])
      check("marker-finds-own-source", () => assert.ok(search.hits.some((hit) => hit.ref === document.reference)))
    }
    for (const text of entry.absent_markers ?? []) {
      const search = item(["search", text, "--exact", "--limit", "100"])
      check("old-marker-removed", () => assert.ok(search.hits.every((hit) => hit.ref !== document.reference)))
    }
    const out = join(exports, `${index}.md`)
    item(["documents", "export", entry.id, release.export_flag, out])
    check("markdown-export", () => {
      const markdown = readFileSync(out, "utf8")
      for (const text of entry.markdown_markers ?? []) assert.ok(markdown.includes(text))
    })
    let context = item(["documents", "context", entry.id])
    if (annotate && !annotated(context)) {
      item(["tags", "add", entry.id, tag])
      if (!context.notes.items.some((saved) => saved.text === note)) item(["notes", "add", entry.id, note])
      context = item(["documents", "context", entry.id])
    }
    if (annotate || baseline?.annotations) check("local-context-retained", () => assert.ok(annotated(context)))
  }
  for (const id of manifest.absent_ids ?? []) {
    check("retired-source-hidden", () => assert.ok(imported.every((entry) => entry.id !== id)))
    invoke(["catalog", "show", id], true, "not_found")
  }
  if (refresh) {
    item(["sync"], false)
    check("unchanged-sync-is-idempotent", () => {
      assert.equal(item(["status"]).pending, 0)
      same(
        list(["documents", "list"]).map((entry) => entry.reference),
        imported.map((entry) => entry.reference),
      )
    })
    if (annotate || baseline?.annotations) {
      for (const entry of manifest.documents)
        check("context-survives-sync", () => assert.ok(annotated(item(["documents", "context", entry.id]))))
    }
  }
  return { checks, references, annotations: annotate || baseline?.annotations === true }
}
