// Seeds a throwaway store: N memories, N facts and N evidence-findings batches, all synthetic.
const [, , memoRoot, storePath, countText = "2000"] = process.argv
const { openStore } = await import(`${memoRoot}/node_modules/@wirecat/cli-core/dist/store/index.js`)
const count = Number(countText)
if (!storePath || storePath.includes("/.local/share/WireCat"))
  throw new Error("give a throwaway store path, never the real store")
const store = await openStore({ path: storePath })
const project = await store.knowledge.addProject({ name: "Project Synthetic", type: "work" })
const notes = []
for (let n = 0; n < 20; n++)
  notes.push(await store.notes.addNote({ text: `Kai Sample note ${n}: the launch checklist moves to Friday ${n}` }))
const cited = []
for (const note of notes) {
  const record = await store.evidenceFindings.citable(note.ref)
  cited.push({ reference: note.ref, fingerprint: record.fingerprint })
}
const started = Date.now()
for (let n = 0; n < count; n++) {
  const evidence = [notes[n % notes.length].ref, notes[(n + 1) % notes.length].ref]
  await store.memories.add({
    kind: "preference",
    body: `Synthetic memory ${n}`,
    scope: "work",
    evidence,
    author: "owner",
  })
  await store.facts.add({
    type: "decision",
    statement: `Synthetic fact ${n}`,
    by: "owner",
    evidence,
    project: project.ref,
  })
  await store.evidenceFindings.stage(
    {
      schemaVersion: 1,
      key: `bench-${n}`,
      extractor: "synthetic",
      findings: [
        {
          id: "f1",
          kind: "fact",
          type: "decision",
          statement: `Synthetic finding ${n}`,
          project: project.ref,
          evidence: [cited[n % cited.length], cited[(n + 1) % cited.length]],
        },
      ],
    },
    { bot: "bench-agent", model: "synthetic-model" },
  )
}
await store.close()
process.stdout.write(`seeded ${count} of each in ${Date.now() - started} ms\n`)
