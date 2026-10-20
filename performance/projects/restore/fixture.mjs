import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const annotationFixture = async (sdk) => {
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
        await store.facts.add({
          type: "statement",
          statement: "Padding",
          project: unrelated.ref,
          by: { bot: "padding" },
        })
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
        await store.notes.saveFileNote({
          folderId: folder.id,
          path: "padding.md",
          title: "Padding",
          text: "Other text",
        })
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

  return {
    source,
    target,
    body,
    project,
    destination,
    unrelated,
    sourceDocument,
    targetDocument,
    sourceFact,
    targetFact,
  }
}
